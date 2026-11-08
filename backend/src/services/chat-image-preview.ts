import type { FileHandle } from "node:fs/promises";
import sharp from "sharp";
import { ChatError } from "./creator-chat.js";

const MAX_PENDING_PREVIEWS = 24;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let previewQueue: Promise<unknown> = Promise.resolve();
let pendingPreviews = 0;

export function renderChatImagePreview(handle: FileHandle) {
  if (pendingPreviews >= MAX_PENDING_PREVIEWS) {
    throw new ChatError(503, "Image previews are busy. Try again shortly.");
  }
  pendingPreviews++;
  const result = previewQueue.then(async () => {
    const input = await handle.readFile();
    const png = input.subarray(0, 8).equals(PNG_SIGNATURE);
    const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
    const webp = input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
    if (!png && !jpeg && !webp) return null;

    try {
      const image = sharp(input, { limitInputPixels: 16_000_000, failOn: "warning" });
      const { format, pages } = await image.metadata();
      if (format !== (png ? "png" : jpeg ? "jpeg" : "webp") || (pages ?? 1) > 1) return null;
      const preview = await image.autoOrient()
        .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75, effort: 2 })
        .timeout({ seconds: 4 })
        .toBuffer();
      return preview.length <= 128_000 ? preview : null;
    } catch {
      return null;
    }
  });
  previewQueue = result.catch(() => {});
  return result.finally(() => { pendingPreviews--; });
}
