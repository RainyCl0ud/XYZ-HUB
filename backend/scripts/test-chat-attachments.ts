import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rmdir, unlink } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout } from "node:timers/promises";
import cookieParser from "cookie-parser";
import express from "express";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";
import { loadSession } from "../src/middleware/session-auth.js";
import chat from "../src/routes/chat.js";
import { chatAttachmentDirectory, MAX_CHAT_ATTACHMENT_BYTES } from "../src/services/chat-attachment-policy.js";
import { chatChannelArchiveEnabled, chatChannelExportEnabled } from "../src/services/chat-archive-policy.js";
import { installCreatorChatDefaults, provisionCreatorChat } from "../src/services/creator-chat.js";
import { createSession } from "../src/services/session.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { chatVoiceFile } from "../../frontend/src/pages/chatVoiceWav.js";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(db.hostname, "127.0.0.1");
  assert.equal(db.port, "55484");
  assert.equal(db.pathname, "/block2_attachments_qa_20261108");
  assert.equal(process.env.NODE_ENV, "test");
  assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);

  const directory = await mkdtemp(join(tmpdir(), "xyz-chat-attachment-test-"));
  process.env.CHAT_ATTACHMENT_DIRECTORY = directory;
  process.env.BLOCK2_CHAT_ENABLED = "true";
  process.env.BLOCK2_CHAT_ATTACHMENTS_ENABLED = "true";
  assert.ok(chatAttachmentDirectory());
  assert.equal(chatAttachmentDirectory({ ...process.env, RAILWAY_ENVIRONMENT_NAME: "Production" }), null);
  assert.equal(chatAttachmentDirectory({ ...process.env, RAILWAY_PROJECT_ID: "unknown" }), null);
  const app = express();
  app.use(express.json(), cookieParser(), loadSession);
  app.use("/api/chat", chat);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
    const prefix = randomUUID();
    const roles = new Map((await prisma.role.findMany()).map(role => [role.systemKey, role.id]));
    await prisma.$transaction(async tx => {
      await installCreatorChatDefaults(tx);
      await installStandingChatDefaults(tx);
    });
    async function person(name: string, key: string) {
      const roleId = roles.get(key);
      assert.ok(roleId);
      const user = await prisma.user.create({ data: {
        name, email: `${prefix}-${name}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId } },
      } });
      const session = await createSession({ userId: user.id, expiresAt: new Date(Date.now() + 900_000) });
      return { id: user.id, cookie: { Cookie: `xyz_session=${session.token}` } };
    }
    const owner = await person("owner", "OWNER");
    const staff = await person("staff", "CHATTER");
    const peer = await person("peer", "CHATTER");
    const model = await prisma.agencyModel.create({ data: { name: `Fictional files ${prefix}` } });
    await prisma.$transaction(tx => provisionCreatorChat(tx, model.id));
    for (const user of [staff, peer]) {
      await prisma.userModelAssignment.create({ data: { userId: user.id, modelId: model.id } });
      await prisma.$transaction(tx => syncUserStandingChats(tx, user.id));
    }
    const channel = await prisma.chatChannel.findFirstOrThrow({ where: { modelId: model.id, key: "general" } });
    const privateChat = await prisma.chatStandingConversation.findFirstOrThrow({ where: { subjectUserId: staff.id, modelId: model.id } });
    const url = (id: string) => `${base}/channels/${id}`;
    const fileUrl = (channelId: string, messageId: string) => `${url(channelId)}/messages/${messageId}/file`;
    const upload = (input: { id?: string; name?: string; bytes: number; body: BodyInit; nonce?: string; cookie?: typeof owner.cookie; voice?: boolean }) =>
      fetch(`${url(input.id ?? channel.id)}/files`, {
        method: "POST", duplex: "half",
        headers: {
          ...input.cookie, "Content-Type": "application/octet-stream", "X-XYZ-File-Name": encodeURIComponent(input.name ?? "test.txt"),
          "X-XYZ-File-Size": String(input.bytes), "X-XYZ-Chat-Nonce": input.nonce ?? randomUUID(),
          ...(input.voice ? { "X-XYZ-Voice-Message": "true" } : {}),
        },
        body: input.body,
      } as RequestInit);
    async function messageId(response: Response, expectedName: string) {
      assert.equal(response.status, 201, await response.clone().text());
      const { message } = await response.json();
      assert.equal(message.text, "");
      assert.equal(message.attachment.fileName, expectedName);
      assert.equal(message.attachment.available, true);
      assert.ok(!("sha256" in message.attachment) && !("id" in message.attachment));
      return message.id as string;
    }
    const text = await fetch(`${url(channel.id)}/messages`, {
      method: "POST", headers: { ...owner.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Fictional plain message", clientNonce: randomUUID() }),
    });
    assert.equal(text.status, 201);
    assert.equal((await text.json()).message.attachment, undefined);
    const nonce = randomUUID();
    const input = { body: "file", bytes: 4, nonce, name: "Report résumé.html", cookie: owner.cookie };
    const first = await messageId(await upload(input), input.name);
    assert.equal(await messageId(await upload(input), input.name), first);
    assert.equal((await upload({ ...input, body: "same" })).status, 409);
    assert.equal((await readdir(directory)).length, 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.message.send", targetId: first } }), 1);
    console.log("PASS: plain Chat messages still work and upload retries do not duplicate messages or files.");

    const firstUrl = fileUrl(channel.id, first);
    assert.equal((await fetch(firstUrl)).status, 401);
    assert.equal((await fetch(firstUrl, { method: "HEAD", headers: staff.cookie })).status, 405);
    assert.equal((await fetch(firstUrl, { headers: { ...staff.cookie, "Sec-Fetch-Site": "cross-site" } })).status, 404);
    assert.equal((await fetch(fileUrl(privateChat.id, first), { headers: owner.cookie })).status, 404);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.attachment.download", targetId: first } }), 0);
    const download = await fetch(firstUrl, { headers: staff.cookie });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.match(download.headers.get("content-disposition") ?? "", /^attachment/);
    assert.equal(download.headers.get("cache-control"), "no-store");
    assert.equal(await download.text(), "file");
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.attachment.download", targetId: first, actorUserId: staff.id } }), 1);
    console.log("PASS: only authorized full downloads start a file audit. The browser receives a private download.");

    const privateId = await messageId(await upload({ ...input, id: privateChat.id, nonce: randomUUID(), cookie: staff.cookie }), input.name);
    const privateUrl = fileUrl(privateChat.id, privateId);
    assert.equal((await fetch(privateUrl, { headers: peer.cookie })).status, 404);
    const deleted = await fetch(`${url(privateChat.id)}/messages/${privateId}`, {
      method: "DELETE", headers: { ...owner.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, reason: "Fictional attachment moderation test" }),
    });
    assert.equal(deleted.status, 200, await deleted.text());
    assert.equal((await fetch(privateUrl, { headers: staff.cookie })).status, 404);
    assert.equal(await (await fetch(privateUrl, { headers: owner.cookie })).text(), "file");
    await prisma.userModelAssignment.deleteMany({ where: { userId: staff.id, modelId: model.id } });
    assert.equal((await fetch(firstUrl, { headers: staff.cookie })).status, 404);
    assert.equal((await upload({ ...input, nonce: randomUUID(), cookie: staff.cookie })).status, 404);
    console.log("PASS: protected chats, deleted files and saved links follow current permissions.");

    const stream = (body: string) => new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); },
    });
    assert.equal((await upload({ ...input, name: "../escape.txt" })).status, 400);
    assert.equal((await upload({ ...input, bytes: MAX_CHAT_ATTACHMENT_BYTES + 1 })).status, 413);
    for (const body of ["too short", "too much data"]) {
      const short = body === "too short";
      const attempt = randomUUID();
      assert.equal((await upload({ ...input, nonce: attempt, bytes: short ? 20 : 4, body: stream(body) })).status, 400);
      assert.equal(await prisma.chatMessage.count({ where: { clientNonce: attempt } }), 0);
    }
    assert.equal((await readdir(directory)).length, 2);
    console.log("PASS: invalid names, oversized requests and incomplete files leave no message or blob behind.");

    let remaining = MAX_CHAT_ATTACHMENT_BYTES;
    const chunk = new Uint8Array(1024 * 1024).fill(113);
    const expected = createHash("sha256");
    const large = new ReadableStream<Uint8Array>({
      pull(controller) {
        const bytes = chunk.subarray(0, Math.min(remaining, chunk.length));
        expected.update(bytes);
        controller.enqueue(bytes);
        remaining -= bytes.length;
        if (remaining === 0) controller.close();
      },
    });
    const largeId = await messageId(await upload({ ...input, nonce: randomUUID(), name: "boundary.bin", bytes: MAX_CHAT_ATTACHMENT_BYTES, body: large }), "boundary.bin");
    const big = await fetch(fileUrl(channel.id, largeId), { headers: owner.cookie });
    assert.equal(big.status, 200);
    const actual = createHash("sha256");
    const reader = big.body!.getReader();
    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      actual.update(value);
    }
    assert.equal(downloaded, MAX_CHAT_ATTACHMENT_BYTES);
    assert.equal(actual.digest("hex"), expected.digest("hex"));
    console.log("PASS: the full 500 MB file streamed through upload and download with identical bytes.");

    const picture = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "#538cba" },
    }).jpeg().withMetadata().toBuffer();
    const pictureId = await messageId(await upload({
      ...input, nonce: randomUUID(), name: "preview-test.jpg", bytes: picture.length, body: new Uint8Array(picture),
    }), "preview-test.jpg");
    const previewUrl = fileUrl(channel.id, pictureId).replace(/\/file$/, "/preview");
    assert.equal((await fetch(previewUrl)).status, 401);
    assert.equal((await fetch(previewUrl, { headers: staff.cookie })).status, 404);
    assert.equal((await fetch(previewUrl, { headers: { ...peer.cookie, "Sec-Fetch-Site": "cross-site" } })).status, 404);
    assert.equal((await fetch(previewUrl, { headers: peer.cookie, method: "HEAD" })).status, 405);
    const thumbnail = await fetch(previewUrl, { headers: peer.cookie });
    assert.equal(thumbnail.status, 200);
    assert.equal(thumbnail.headers.get("content-type"), "image/webp");
    assert.equal(thumbnail.headers.get("cache-control"), "no-store");
    const previewMetadata = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
    assert.equal(previewMetadata.width, 320);
    assert.equal(previewMetadata.height, 160);
    assert.equal(previewMetadata.exif, undefined);
    assert.equal(previewMetadata.icc, undefined);
    const pictureAudit = { action: "chat.attachment.download", targetId: pictureId };
    assert.equal(await prisma.auditEvent.count({ where: pictureAudit }), 0);
    const originalPicture = await fetch(fileUrl(channel.id, pictureId), { headers: peer.cookie });
    assert.deepEqual(Buffer.from(await originalPicture.arrayBuffer()), picture);
    assert.equal(await prisma.auditEvent.count({ where: pictureAudit }), 1);
    console.log("PASS: a real thumbnail uses current access, strips metadata, and keeps the original download audit separate.");

    for (const format of ["png", "webp"] as const) {
      const fileName = `preview-test.${format}`;
      const bytes = await sharp({
        create: { width: 80, height: 60, channels: 4, background: "#538cba80" },
      }).toFormat(format).toBuffer();
      const id = await messageId(await upload({
        ...input, nonce: randomUUID(), name: fileName, bytes: bytes.length, body: new Uint8Array(bytes),
      }), fileName);
      const response = await fetch(fileUrl(channel.id, id).replace(/\/file$/, "/preview"), { headers: peer.cookie });
      assert.equal(response.status, 200);
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.hasAlpha, true);
      assert.equal(metadata.width, 80);
    }
    console.log("PASS: transparent PNG and WebP images keep transparency and are never enlarged.");

    const disguised = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
    const disguisedId = await messageId(await upload({
      ...input, nonce: randomUUID(), name: "not-an-image.png", body: disguised, bytes: disguised.length,
    }), "not-an-image.png");
    const disguisedPreview = fileUrl(channel.id, disguisedId).replace(/\/file$/, "/preview");
    assert.equal((await fetch(disguisedPreview, { headers: peer.cookie })).status, 404);
    assert.equal(await (await fetch(fileUrl(channel.id, disguisedId), { headers: peer.cookie })).text(), disguised);
    const removed = await fetch(`${url(channel.id)}/messages/${pictureId}`, {
      method: "DELETE", headers: { ...owner.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, reason: "Fictional preview moderation test" }),
    });
    assert.equal(removed.status, 200);
    assert.equal((await fetch(previewUrl, { headers: peer.cookie })).status, 404);
    assert.equal((await fetch(previewUrl, { headers: owner.cookie })).status, 200);
    console.log("PASS: disguised files fall back to download and deleted thumbnails stay Owner-only.");

    const tone = Int16Array.from({ length: 24_000 }, (_, i) => Math.round(Math.sin(i * 2 * Math.PI * 440 / 24_000) * 8000));
    const recording = chatVoiceFile(24_000, tone.length, [tone]);
    const peerChat = await prisma.chatStandingConversation.findFirstOrThrow({ where: { subjectUserId: peer.id, modelId: model.id } });
    const voiceUpload = { id: peerChat.id, cookie: peer.cookie, bytes: recording.size, name: recording.name, body: recording, nonce: randomUUID(), voice: true };
    process.env.BLOCK2_CHAT_VOICE_ENABLED = "false";
    assert.equal((await upload(voiceUpload)).status, 404);
    process.env.BLOCK2_CHAT_VOICE_ENABLED = "true";
    const areas = await fetch(`${base}/areas`, { headers: owner.cookie });
    assert.equal((await areas.json()).attachments.voiceMaxSeconds, 120);
    const before = (await readdir(directory)).sort();
    assert.equal((await upload({ ...voiceUpload, body: "junk", bytes: 4 })).status, 400);
    const tooLong = chatVoiceFile(8000, 960_001, []);
    assert.equal((await upload({ ...voiceUpload, bytes: tooLong.size, body: tooLong })).status, 400);
    assert.deepEqual((await readdir(directory)).sort(), before);
    const voiceResponse = await upload(voiceUpload);
    assert.equal((await voiceResponse.clone().json()).message.attachment.voiceDurationMs, 1000);
    const voiceId = await messageId(voiceResponse, "Voice message.wav");
    assert.equal(await messageId(await upload(voiceUpload), "Voice message.wav"), voiceId);
    assert.equal((await upload({ ...voiceUpload, voice: false })).status, 409);
    const voiceUrl = fileUrl(peerChat.id, voiceId).replace(/\/file$/, "/voice");
    const playAudit = { action: "chat.attachment.play", targetId: voiceId };
    assert.equal((await fetch(voiceUrl, { headers: staff.cookie })).status, 404);
    assert.equal((await fetch(voiceUrl, { method: "HEAD", headers: owner.cookie })).status, 405);
    assert.equal((await fetch(firstUrl.replace(/\/file$/, "/voice"), { headers: owner.cookie })).status, 404);
    assert.equal(await prisma.auditEvent.count({ where: playAudit }), 0);
    const playback = await fetch(voiceUrl, { headers: owner.cookie });
    assert.equal(playback.status, 200);
    assert.equal(playback.headers.get("content-type"), "audio/wav");
    assert.equal(playback.headers.get("cache-control"), "no-store");
    assert.deepEqual(await playback.arrayBuffer(), await recording.arrayBuffer());
    assert.equal(await prisma.auditEvent.count({ where: { ...playAudit, actorUserId: owner.id } }), 1);
    const channelVoiceId = await messageId(await upload({
      ...voiceUpload, id: channel.id, nonce: randomUUID(),
    }), "Voice message.wav");
    console.log("PASS: recorded WAV uploads are validated and retry-safe; authorized playback sends the original audio and records a separate audit event.");

    const manager = await person("manager", "MANAGER");
    const otherManager = await person("other-manager", "MANAGER");
    const developer = await person("developer", "DEV");
    for (const user of [manager, otherManager]) {
      await prisma.userModelAssignment.create({ data: { userId: user.id, modelId: model.id } });
    }
    const json = (actor: typeof owner, path: string, method: string, body: object) => fetch(path, {
      method, headers: { ...actor.cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const archive = (actor: typeof owner, target: { id: string; name: string }) => json(actor, `${url(target.id)}/archive`, "PUT", { name: target.name });
    const updates = await prisma.chatChannel.findFirstOrThrow({ where: { modelId: model.id, key: "updates" } });
    process.env.BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED = "false";
    assert.equal((await archive(owner, channel)).status, 404);
    process.env.BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED = "true";
    assert.equal(chatChannelArchiveEnabled({ ...process.env, RAILWAY_ENVIRONMENT_NAME: "Production" }), false);
    assert.equal((await archive(peer, channel)).status, 403);
    assert.equal((await archive(developer, channel)).status, 403);
    assert.equal((await archive(owner, updates)).status, 403);
    assert.equal((await archive(owner, { id: peerChat.id, name: "Private" })).status, 404);
    assert.equal((await archive(manager, { ...channel, name: "Out of date" })).status, 409);
    await prisma.chatMessage.createMany({ data: Array.from({ length: 206 }, (_, index) => ({
      channelId: channel.id, authorUserId: owner.id, authorName: "Fictional <author>", clientNonce: randomUUID(),
      text: `Archive page fixture ${index} <script>alert(1)</script>`, createdAt: new Date("2026-01-01T00:00:00Z"),
      ...(index === 0 ? { deletedAt: new Date(), deletedByName: "Fictional owner", deletionReason: "Fictional removed text" } : {}),
    })) });
    const attempts = await Promise.all([archive(manager, channel), archive(manager, channel)]);
    assert.deepEqual(attempts.map(response => response.status), [200, 200]);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.channel.archive", targetId: channel.id } }), 1);
    assert.equal((await archive(otherManager, channel)).status, 404);
    const transcriptUrl = `${url(channel.id)}/messages`;
    const hiddenChannel = await fetch(transcriptUrl, { headers: manager.cookie });
    assert.equal(hiddenChannel.status, 404);
    assert.equal((await fetch(firstUrl, { headers: peer.cookie })).status, 404);
    const developerView = await fetch(transcriptUrl, { headers: developer.cookie });
    assert.equal(developerView.status, 200);
    const frozen = await developerView.json();
    assert.equal(frozen.canPost, false);
    assert.deepEqual(frozen.unreadMessageIds, []);
    assert.ok(frozen.messages.some((m: { id: string }) => m.id === first));
    assert.ok(!frozen.messages.some((m: { id: string }) => m.id === pictureId));
    assert.equal((await fetch(previewUrl, { headers: developer.cookie })).status, 404);
    assert.equal((await fetch(previewUrl, { headers: owner.cookie })).status, 200);
    assert.equal(await (await fetch(firstUrl, { headers: owner.cookie })).text(), "file");
    assert.equal((await fetch(`${url(channel.id)}/deleted`, { headers: developer.cookie })).status, 403);
    const deletedInArchive = await fetch(`${url(channel.id)}/deleted`, { headers: owner.cookie });
    assert.ok((await deletedInArchive.json()).messages.some((m: { id: string }) => m.id === pictureId));
    const search = await fetch(`${base}/search?q=Fictional`, { headers: peer.cookie });
    assert.ok(!(await search.json()).results.some((m: { channelId: string }) => m.channelId === channel.id));
    assert.equal((await upload({ ...input, nonce: randomUUID() })).status, 403);
    assert.equal((await json(owner, transcriptUrl, "POST", { text: "Frozen", clientNonce: randomUUID() })).status, 403);
    assert.equal((await json(owner, url(channel.id), "PATCH", { name: "Frozen" })).status, 403);
    assert.equal((await json(owner, `${transcriptUrl}/${first}/reaction`, "PUT", { emoji: "👍", active: true })).status, 403);
    assert.equal((await json(owner, `${transcriptUrl}/${first}`, "DELETE", { version: 1, reason: "Frozen" })).status, 403);
    const adjacent = await json(owner, `${url(updates.id)}/messages`, "POST", { text: "Updates remains available", clientNonce: randomUUID() });
    assert.equal(adjacent.status, 201);
    const exportUrl = `${url(channel.id)}/archive/export`;
    process.env.BLOCK2_CHAT_CHANNEL_EXPORT_ENABLED = "false";
    assert.equal((await fetch(exportUrl, { headers: owner.cookie })).status, 404);
    process.env.BLOCK2_CHAT_CHANNEL_EXPORT_ENABLED = "true";
    assert.equal(chatChannelExportEnabled({ ...process.env, RAILWAY_ENVIRONMENT_NAME: "Production" }), false);
    assert.equal((await fetch(exportUrl)).status, 401);
    for (const actor of [developer, manager, peer]) {
      assert.equal((await fetch(exportUrl, { headers: actor.cookie })).status, 403);
    }
    assert.equal((await fetch(`${url(updates.id)}/archive/export`, { headers: owner.cookie })).status, 409);
    assert.equal((await fetch(`${url(privateChat.id)}/archive/export`, { headers: owner.cookie })).status, 404);
    assert.equal((await (await fetch(transcriptUrl, { headers: owner.cookie })).json()).canExportArchive, true);
    assert.equal((await (await fetch(transcriptUrl, { headers: developer.cookie })).json()).canExportArchive, undefined);

    process.env.BLOCK2_CHAT_ATTACHMENTS_ENABLED = "false";
    assert.equal((await fetch(exportUrl, { headers: owner.cookie })).status, 503);
    process.env.BLOCK2_CHAT_ATTACHMENTS_ENABLED = "true";
    const auditWhere = { targetId: channel.id, actorUserId: owner.id };
    assert.equal(await prisma.auditEvent.count({ where: { ...auditWhere, action: "chat.channel.export.start" } }), 0);
    const archiveDownload = await fetch(exportUrl, { headers: owner.cookie });
    assert.equal(archiveDownload.status, 200);
    assert.equal(archiveDownload.headers.get("content-type"), "application/zip");
    assert.match(archiveDownload.headers.get("content-disposition") ?? "", /^attachment;.*\.zip"/);
    assert.equal(archiveDownload.headers.get("cache-control"), "no-store");
    const zipPath = join(directory, "offline-test.zip");
    await pipeline(Readable.fromWeb(archiveDownload.body as import("node:stream/web").ReadableStream), createWriteStream(zipPath));
    const extractor = process.platform === "win32" ? "tar.exe" : "unzip";
    const extractArgs = (path: string) => process.platform === "win32" ? ["-xOf", zipPath, path] : ["-p", zipPath, path];
    const html = execFileSync(extractor, extractArgs("transcript.html"), { encoding: "utf8" });
    assert.equal((html.match(/<article\b/g) ?? []).length, await prisma.chatMessage.count({ where: { channelId: channel.id } }));
    assert.match(html, /Archive page fixture 0 &lt;script&gt;/);
    assert.match(html, /Archive page fixture 205 &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/i);
    assert.match(html, /<strong>Deleted<\/strong>/);
    assert.match(html, /Fictional removed text/);
    const manifest = JSON.parse(execFileSync(extractor, extractArgs("manifest.json"), { encoding: "utf8" }));
    assert.equal(manifest.attachments.length, await prisma.chatAttachment.count({ where: { message: { channelId: channel.id } } }));
    assert.ok(manifest.attachments.some((file: { fileName: string }) => file.fileName === "preview-test.jpg"));
    assert.ok(manifest.attachments.some((file: { messageId: string }) => file.messageId === channelVoiceId));
    assert.ok(!manifest.attachments.some((file: { messageId: string }) => file.messageId === voiceId));
    assert.ok(manifest.attachments.some((file: { byteSize: number }) => file.byteSize === MAX_CHAT_ATTACHMENT_BYTES));
    for (const { path, byteSize, sha256 } of manifest.attachments) {
      assert.match(path, /^attachments\/[1-9]\d*-[A-Za-z0-9._-]+$/);
      assert.ok(html.includes(` href="${path}"`));
      const member = spawn(extractor, extractArgs(path), { stdio: ["ignore", "pipe", "ignore"] });
      const closed = once(member, "close");
      const hash = createHash("sha256");
      let size = 0;
      for await (const bytes of member.stdout) { hash.update(bytes); size += bytes.length; }
      assert.equal((await closed)[0], 0);
      assert.equal(size, byteSize);
      assert.equal(hash.digest("hex"), sha256);
    }
    const auditAction = (action: string) => prisma.auditEvent.findFirst({ where: { ...auditWhere, action } });
    let completed = await auditAction("chat.channel.export.download");
    for (let attempt = 0; !completed && attempt < 20; attempt++) {
      await setTimeout(50);
      completed = await auditAction("chat.channel.export.download");
    }
    assert.ok(completed);
    assert.deepEqual(completed.metadata, (await auditAction("chat.channel.export.start"))?.metadata);
    console.log("PASS: only an Owner can export an archived channel. The offline ZIP includes every message, deleted markers, voice, the deleted original image and the full 500 MB file. Every attachment matched its stored hash.");

    const otherOwner = await person("export-retry-owner", "OWNER");
    const cancel = new AbortController();
    const partial = await fetch(exportUrl, { headers: otherOwner.cookie, signal: cancel.signal });
    assert.equal(partial.status, 200);
    assert.equal((await partial.body!.getReader().read()).done, false);
    cancel.abort();
    const empty = await prisma.chatChannel.findFirstOrThrow({ where: { modelId: model.id, key: "feedback" } });
    assert.equal((await archive(owner, empty)).status, 200);
    let afterCancel = await fetch(`${url(empty.id)}/archive/export`, { headers: otherOwner.cookie });
    for (let attempt = 0; afterCancel.status === 429 && attempt < 2; attempt++) {
      await setTimeout(100);
      afterCancel = await fetch(`${url(empty.id)}/archive/export`, { headers: otherOwner.cookie });
    }
    assert.equal(afterCancel.status, 200);
    assert.ok((await afterCancel.arrayBuffer()).byteLength > 0);
    assert.equal(await prisma.auditEvent.count({
      where: { targetId: channel.id, actorUserId: otherOwner.id, action: "chat.channel.export.download" },
    }), 0);
    console.log("PASS: cancelling a large download does not record completion or block the next export.");

    process.env.BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED = "false";
    assert.equal((await fetch(transcriptUrl, { headers: manager.cookie })).status, 404);
    console.log("PASS: archiving is scoped, retry-safe, and read-only; attachments and deleted history follow archive access while Updates stays open.");

    process.env.BLOCK2_CHAT_ATTACHMENTS_ENABLED = "false";
    assert.equal((await fetch(firstUrl, { headers: owner.cookie })).status, 404);
    assert.equal((await upload(input)).status, 404);
    assert.equal((await fetch(previewUrl, { headers: owner.cookie })).status, 404);
    const hidden = await fetch(`${base}/areas`, { headers: owner.cookie });
    assert.equal((await hidden.json()).attachments, undefined);
    console.log("PASS: disabling attachments hides upload capability and stops file requests.");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
    for (const file of await readdir(directory)) await unlink(join(directory, file));
    await rmdir(directory);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
