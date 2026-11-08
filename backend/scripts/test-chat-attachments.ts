import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rmdir, unlink } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";
import { loadSession } from "../src/middleware/session-auth.js";
import chat from "../src/routes/chat.js";
import { chatAttachmentDirectory, MAX_CHAT_ATTACHMENT_BYTES } from "../src/services/chat-attachment-policy.js";
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
    console.log("PASS: recorded WAV uploads are validated and retry-safe; authorized playback sends the original audio and records a separate audit event.");

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
