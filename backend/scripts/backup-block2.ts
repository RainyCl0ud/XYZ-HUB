import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { chatAttachmentDirectory } from "../src/services/chat-attachment-policy.js";
import { assertChatStagingTarget } from "../src/services/chat-staging-target.js";

const dumpName = "database.dump";
const maxDumpTime = 15 * 60_000;
type Entry = { id: string; byteSize: number; sha256: string };
class BackupError extends Error {}

async function directory(value: string | undefined, description: string) {
  if (!value || !isAbsolute(value)) throw new BackupError(`Set an absolute ${description} path.`);
  const path = await realpath(value).catch(() => null);
  if (!path || !(await lstat(path)).isDirectory()) throw new BackupError(`The ${description} directory is unavailable.`);
  return path;
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return !path || (!isAbsolute(path) && !/^\.\.(?:[\\/]|$)/.test(path));
}

async function fingerprint(path: string, output?: string) {
  if (!(await lstat(path)).isFile()) throw new BackupError("A backup input is missing or is not a regular file.");
  const hash = createHash("sha256");
  let byteSize = 0;
  const source = createReadStream(path);
  if (output) {
    const capture = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(source, capture, createWriteStream(output, { flags: "wx", mode: 0o600 }));
  } else {
    for await (const chunk of source) {
      byteSize += chunk.length;
      hash.update(chunk);
    }
  }
  return { byteSize, sha256: hash.digest("hex") };
}

function validateEntry(entry: Entry) {
  if (!entry || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(entry.id) ||
      !Number.isSafeInteger(entry.byteSize) || entry.byteSize < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new BackupError("An attachment has invalid backup metadata.");
  }
}

async function assertFingerprint(path: string, expected: Omit<Entry, "id">, copyTo?: string) {
  const actual = await fingerprint(path, copyTo);
  if (!Number.isSafeInteger(expected?.byteSize) || expected.byteSize < 1 ||
      actual.byteSize !== expected.byteSize || actual.sha256 !== expected.sha256) {
    throw new BackupError("A backup file did not match its recorded checksum.");
  }
}

function dumpDatabase(db: URL, local: boolean, snapshot: string, output: string) {
  const pgEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name)));
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.BLOCK2_PG_DUMP_BIN || "pg_dump", [
      "--no-password", "--format=custom", "--no-owner", "--no-acl",
      "--lock-wait-timeout=5s", "--snapshot", snapshot, "--file", output,
    ], {
      signal: AbortSignal.timeout(maxDumpTime),
      stdio: "ignore",
      env: {
        ...pgEnvironment,
        PGHOST: db.hostname.replace(/^\[|\]$/g, ""),
        PGPORT: db.port || "5432",
        PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
        PGUSER: decodeURIComponent(db.username),
        PGPASSWORD: decodeURIComponent(db.password),
        PGSSLMODE: local ? "prefer" : "verify-full",
        ...(process.env.BLOCK2_BACKUP_SSL_ROOT_CERT ? { PGSSLROOTCERT: process.env.BLOCK2_BACKUP_SSL_ROOT_CERT } : {}),
        PGCONNECT_TIMEOUT: "5",
      },
    });
    child.once("error", () => reject(new BackupError("pg_dump could not start or timed out.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new BackupError("pg_dump failed. Check its version, database access, and certificate trust.")));
  });
}

async function createBackup() {
  let db: URL;
  try { db = new URL(process.env.DATABASE_URL ?? ""); }
  catch { throw new BackupError("Set a valid database connection."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) &&
    /^\/xyz_hub_backup_fixture_[a-z0-9_]+$/.test(db.pathname) &&
    !process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID &&
    !process.env.RAILWAY_ENVIRONMENT_NAME && process.env.NODE_ENV === "test";
  if (!local) {
    try { assertChatStagingTarget(process.env); }
    catch { throw new BackupError("Backup creation is restricted to XYZ Hub Staging or a named local test fixture."); }
    if (db.hostname !== "postgres.railway.internal") throw new BackupError("Use the Staging Postgres private hostname.");
    db.searchParams.set("sslmode", "require");
    db.searchParams.set("sslaccept", "strict");
    if (process.env.BLOCK2_BACKUP_SSL_ROOT_CERT) db.searchParams.set("sslcert", process.env.BLOCK2_BACKUP_SSL_ROOT_CERT);
  }
  if (!["postgresql:", "postgres:"].includes(db.protocol) || !db.username || !/^\/[a-zA-Z0-9_]+$/.test(db.pathname) || db.searchParams.has("host") ||
      (db.searchParams.get("schema") ?? "public") !== "public") throw new BackupError("Use a direct PostgreSQL connection to the public schema.");

  const source = await directory(chatAttachmentDirectory({ ...process.env, DATABASE_URL: db.toString() }) ?? undefined, "chat attachment");
  const root = await directory(process.env.BLOCK2_BACKUP_DIRECTORY, "private backup");
  if (contains(source, root) || contains(root, source)) throw new BackupError("Backup and attachment directories must be separate.");
  const startedAt = new Date().toISOString();
  const target = join(root, startedAt.slice(0, 10));
  if (await lstat(target).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) throw new BackupError("A backup already exists for this UTC day.");
  const partial = await mkdtemp(join(root, ".incomplete-"));
  const client = new PrismaClient({ datasourceUrl: db.toString() });
  try {
    const dump = join(partial, dumpName);
    const attachments = await client.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [{ snapshot }] = await tx.$queryRaw<{ snapshot: string }[]>`SELECT pg_export_snapshot() AS snapshot`;
      const files = await tx.chatAttachment.findMany({
        select: { id: true, byteSize: true, sha256: true },
        orderBy: { id: "asc" },
      });
      await dumpDatabase(db, local, snapshot, dump);
      return files;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: maxDumpTime + 15_000 });

    const originals = join(partial, "attachments");
    await mkdir(originals, { mode: 0o700 });
    for (const entry of attachments) {
      validateEntry(entry);
      await assertFingerprint(join(source, entry.id), entry, join(originals, entry.id));
    }
    const database = await fingerprint(dump);
    if (!database.byteSize) throw new BackupError("The database backup was empty.");
    await writeFile(join(partial, "manifest.json"), JSON.stringify({ version: 1, startedAt, database, attachments }), { flag: "wx", mode: 0o600 });
    await rename(partial, target);
    console.log(`Completed backup for ${startedAt.slice(0, 10)} UTC with ${attachments.length} chat files.`);
  } finally {
    try {
      await client.$disconnect();
    } finally {
      // Only remove this invocation's temporary directory at its original location.
      const temporary = await realpath(partial).catch(() => null);
      if (temporary === partial && contains(root, temporary) && root !== temporary) {
        await rm(temporary, { force: true, recursive: true });
      }
    }
  }
}

async function verifyBackup(value: string | undefined) {
  const root = await directory(value, "completed backup");
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest?.version !== 1 || !Array.isArray(manifest.attachments)) throw new BackupError("The backup manifest is invalid.");
  await assertFingerprint(join(root, dumpName), manifest.database);
  const ids = new Set<string>();
  for (const entry of manifest.attachments) {
    validateEntry(entry);
    if (ids.has(entry.id)) throw new BackupError("The backup manifest contains a duplicate file.");
    ids.add(entry.id);
    await assertFingerprint(join(root, "attachments", entry.id), entry);
  }
  console.log(`Verified database dump and ${ids.size} chat files.`);
}

try {
  const [command, target, ...extra] = process.argv.slice(2);
  if (!extra.length && command === "create" && !target) await createBackup();
  else if (!extra.length && command === "verify" && target) await verifyBackup(target);
  else throw new BackupError("Use backup:block2 -- create or backup:block2 -- verify <absolute backup directory>.");
} catch (error) {
  // Database connections and raw filesystem errors can contain credentials or private paths.
  console.error(error instanceof BackupError ? error.message : "Backup operation failed. Check storage and database access.");
  process.exitCode = 1;
}
