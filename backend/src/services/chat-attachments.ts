import { createHash, randomUUID } from "node:crypto";
import { open, statfs, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { MAX_CHAT_ATTACHMENT_BYTES } from "./chat-attachment-policy.js";
import { assertChatAttachmentPosting, ChatError, sendChatAttachmentMessage } from "./creator-chat.js";

const activeUploads = new Map<string, number>();
const DISK_RESERVE_BYTES = 128 * 1024 * 1024;

export function chatAttachmentMetadata(encodedName: string, size: string, nonce: string) {
  let fileName: string;
  try {
    fileName = decodeURIComponent(encodedName).trim();
  } catch {
    throw new ChatError(400, "Choose a file with a valid name.");
  }
  if (!fileName || fileName.length > 240 || /[\\/:\u0000-\u001f\u007f]/u.test(fileName) || fileName === "." || fileName === "..") {
    throw new ChatError(400, "Choose a file with a valid name.");
  }
  const byteSize = Number(size);
  if (!/^\d{1,10}$/.test(size) || byteSize < 1) throw new ChatError(400, "Choose a nonempty file.");
  if (byteSize > MAX_CHAT_ATTACHMENT_BYTES) throw new ChatError(413, "Files must be 500 MB or smaller.");
  if (!/^[\w-]{8,80}$/.test(nonce)) throw new ChatError(400, "The upload reference is invalid.");
  return { fileName, byteSize, nonce };
}

export async function uploadChatAttachment(
  stream: Readable, directory: string, userId: string, channelId: string,
  { fileName, byteSize, nonce }: ReturnType<typeof chatAttachmentMetadata>,
) {
  await assertChatAttachmentPosting(userId, channelId);
  if (activeUploads.has(userId) || activeUploads.size >= 3) {
    throw new ChatError(429, "An upload is already in progress. Try again shortly.");
  }
  activeUploads.set(userId, byteSize);

  const id = randomUUID();
  const path = join(directory, id);
  let ownsFile = false;
  let keepFile = false;
  try {
    const sha256 = createHash("sha256");
    try {
      const { bavail, bsize } = await statfs(directory);
      const reservedBytes = [...activeUploads.values()].reduce((total, bytes) => total + bytes, 0);
      if (bavail * bsize < reservedBytes + DISK_RESERVE_BYTES) throw new ChatError(507, "Attachment storage is full.");
      const handle = await open(path, "wx", 0o600);
      ownsFile = true;
      try {
        let receivedBytes = 0;
        for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
          const bytes: Buffer = chunk;
          receivedBytes += bytes.length;
          if (receivedBytes > byteSize) throw new ChatError(400, "The upload size did not match the selected file.");
          sha256.update(bytes);
          let offset = 0;
          while (offset < bytes.length) {
            const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
            if (bytesWritten === 0) throw new Error("File write made no progress");
            offset += bytesWritten;
          }
        }
        if (receivedBytes !== byteSize) throw new ChatError(400, "The upload ended before the whole file arrived.");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error instanceof ChatError) throw error;
      if (stream.errored || stream.readableAborted) throw new ChatError(400, "The upload was interrupted. Try again.");
      throw new ChatError(503, "Attachment storage is temporarily unavailable.");
    }

    // An unknown database outcome may have committed. Keep the bytes in that
    // case so a retry cannot leave an existing message without its file.
    keepFile = true;
    try {
      const result = await sendChatAttachmentMessage(userId, channelId, nonce, { id, fileName, byteSize, sha256: sha256.digest("hex") });
      keepFile = result.attachmentStored;
      return result.message;
    } catch (error) {
      if (error instanceof ChatError) keepFile = false;
      throw error;
    }
  } finally {
    try {
      if (ownsFile && !keepFile) await unlink(path).catch(() => console.error("Could not remove an unfinished chat upload."));
    } finally {
      activeUploads.delete(userId);
    }
  }
}
