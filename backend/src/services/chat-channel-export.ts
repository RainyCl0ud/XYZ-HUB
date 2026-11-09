import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { addAbortSignal, Readable } from "node:stream";
import { ZipFile } from "yazl";
import { prisma } from "../lib/prisma.js";
import { chatChannelExportEnabled } from "./chat-archive-policy.js";
import { chatAttachmentDirectory } from "./chat-attachment-policy.js";
import { channelAccess, channelInclude, ChatError, loadViewer } from "./creator-chat.js";
import { CLOCK_TIME_ZONE } from "./clock-time.js";

const centralTime = new Intl.DateTimeFormat("en-US", {
  timeZone: CLOCK_TIME_ZONE, dateStyle: "medium", timeStyle: "long",
});
const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function safeName(name: string, maxLength: number) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, maxLength).replace(/^[.-]+|[.-]+$/g, "") || "file";
}

async function exportChannel(userId: string, channelId: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    if (!viewer.isOwner) throw new ChatError(403, "Only Owners can download channel archives.");
    const channel = await tx.chatChannel.findUnique({ where: { id: channelId }, include: channelInclude });
    const access = channel && channelAccess(viewer, channel);
    if (!channel || !access?.canView) throw new ChatError(404, "Channel not found.");
    if (!access.archived) throw new ChatError(409, "Archive the channel before downloading it.");
    return { channel, actorLabel: viewer.user.name };
  });
}

async function* transcript(channelId: string, title: string, generatedAt: Date, paths: Map<string, string>, signal: AbortSignal) {
  yield `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font:1rem/1.55 system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#151515}article{border-top:1px solid #aaa;padding:1rem 0}p{margin:.4rem 0;white-space:pre-wrap;overflow-wrap:anywhere}time{color:#444}.deleted{border-left:3px solid #930000;padding-left:1rem}.deleted strong{color:#930000}</style>
</head><body><main><h1>${escapeHtml(title)}</h1>
<p>Confidential · Owner export · ${escapeHtml(centralTime.format(generatedAt))}</p>
<p>Times are shown in US Central. Extract the full ZIP to open attachments.</p>
`;
  let cursor: string | undefined;
  let foundMessages = false;
  for (;;) {
    signal.throwIfAborted();
    const rows = await prisma.chatMessage.findMany({
      where: { channelId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 200,
      select: {
        id: true, authorName: true, text: true, createdAt: true, replyToId: true,
        deletedAt: true, deletedByName: true, deletionReason: true,
        attachment: { select: { fileName: true } },
      },
    });
    for (const row of rows) {
      signal.throwIfAborted();
      foundMessages = true;
      const path = paths.get(row.id);
      yield `<article id="m-${escapeHtml(row.id)}"${row.deletedAt ? ' class="deleted"' : ""}>
<header><b>${escapeHtml(row.authorName)}</b> · <time datetime="${row.createdAt.toISOString()}">${escapeHtml(centralTime.format(row.createdAt))}</time></header>
${row.deletedAt ? `<p><strong>Deleted</strong> · ${escapeHtml(centralTime.format(row.deletedAt))}${row.deletedByName ? ` by ${escapeHtml(row.deletedByName)}` : ""}</p>` : ""}
${row.deletionReason ? `<p>Deletion reason · ${escapeHtml(row.deletionReason)}</p>` : ""}
${row.replyToId ? `<p><a href="#m-${encodeURIComponent(row.replyToId)}">Original message</a></p>` : ""}
${row.text ? `<p>${escapeHtml(row.text)}</p>` : ""}
${row.attachment && path ? `<p><a href="${path}" download>${escapeHtml(row.attachment.fileName)}</a></p>` : ""}
</article>
`;
    }
    if (rows.length < 200) break;
    cursor = rows.at(-1)!.id;
  }
  yield foundMessages ? "</main></body></html>" : "<p>This channel has no messages.</p></main></body></html>";
}

// A single stream per instance bounds file I/O and archive metadata in memory.
let exportInProgress = false;

export async function downloadChatChannelExport(
  userId: string,
  channelId: string,
  signal: AbortSignal,
  send: (fileName: string, body: Readable) => Promise<void>,
) {
  if (!chatChannelExportEnabled()) throw new ChatError(404, "Channel exports are unavailable.");
  const { channel } = await exportChannel(userId, channelId);
  if (exportInProgress) throw new ChatError(429, "Another archive download is in progress. Please try again shortly.");
  exportInProgress = true;
  try {
    const files = await prisma.chatAttachment.findMany({
      where: { message: { channelId } },
      orderBy: { id: "asc" },
      select: { id: true, messageId: true, fileName: true, byteSize: true, sha256: true },
    });
    const directory = chatAttachmentDirectory();
    const entries = [];
    for (const [index, { id, ...file }] of files.entries()) {
      signal.throwIfAborted();
      if (!directory || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
        throw new ChatError(503, "An original attachment is unavailable. The archive could not be built.");
      }
      const source = join(directory, id);
      const info = await lstat(source).catch(() => null);
      if (!info?.isFile() || info.size !== file.byteSize) {
        throw new ChatError(503, "An original attachment is unavailable. The archive could not be built.");
      }
      const extension = file.fileName.match(/\.[a-z0-9]{1,12}$/i)?.[0] ?? "";
      const path = `attachments/${index + 1}-${safeName(extension ? file.fileName.slice(0, -extension.length) : file.fileName, 90)}${extension}`;
      entries.push({ source, ...file, path });
    }
    // Recheck access after checking files so a changed role cannot start the download.
    const { actorLabel } = await exportChannel(userId, channelId);
    signal.throwIfAborted();
    const generatedAt = new Date();
    const exportId = randomUUID();
    const fileName = `chat-archive-${safeName(channel.name, 70)}-${generatedAt.toISOString().slice(0, 10)}-${exportId.slice(0, 8)}.zip`;
    const audit = (action: string) => prisma.auditEvent.create({ data: {
      action, actorUserId: userId, actorLabel, success: true, statusCode: 200,
      targetType: "chat", targetId: channelId,
      metadata: { fileName, exportId, channelName: channel.name, modelId: channel.modelId, attachments: entries.length },
    } });
    await audit("chat.channel.export.start");
    signal.throwIfAborted();

    const zip = new ZipFile();
    // yazl exposes a Node PassThrough typed as a legacy ReadableStream.
    const output = zip.outputStream as Readable;
    zip.on("error", (error: Error) => output.destroy(error));
    const forwardInputErrors = (input: Readable) => input.on("error", (error) => zip.emit("error", error));
    const title = `${channel.area.model.name} / ${channel.name}`;
    const paths = new Map(entries.map(({ messageId, path }) => [messageId, path]));
    zip.addReadStreamLazy("transcript.html", { mtime: generatedAt }, (callback) => {
      callback(null, forwardInputErrors(addAbortSignal(signal, Readable.from(transcript(channelId, title, generatedAt, paths, signal)))));
    });
    zip.addBuffer(Buffer.from(JSON.stringify({
      version: 1, channel: channel.name, creator: channel.area.model.name, generatedAt,
      timeZone: CLOCK_TIME_ZONE, attachments: entries.map(({ source: _source, ...entry }) => entry),
    }, null, 2)), "manifest.json", { mtime: generatedAt });
    for (const { source, path, byteSize } of entries) {
      zip.addReadStreamLazy(path, { size: byteSize, compress: false, mtime: generatedAt }, (callback) => {
        callback(null, forwardInputErrors(createReadStream(source, { signal })));
      });
    }
    const transfer = send(fileName, output);
    zip.end();
    await transfer;
    // This records that the server finished the transfer. It cannot attest to
    // the browser saving the ZIP on the Owner's device.
    await audit("chat.channel.export.download").catch(() => {
      console.error("Chat archive download completion could not be recorded.");
    });
  } finally {
    exportInProgress = false;
  }
}
