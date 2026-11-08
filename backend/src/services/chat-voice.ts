export const MAX_CHAT_VOICE_SECONDS = 120;
export const MAX_CHAT_VOICE_SAMPLE_RATE = 96_000;
export const MAX_CHAT_VOICE_BYTES = 44 + MAX_CHAT_VOICE_SECONDS * MAX_CHAT_VOICE_SAMPLE_RATE * 2;

export function chatVoiceEnabled() {
  return process.env.BLOCK2_CHAT_VOICE_ENABLED === "true";
}

export function chatVoiceDuration(header: Buffer, byteSize: number) {
  if (header.length !== 44 || byteSize <= 44 || byteSize > MAX_CHAT_VOICE_BYTES || byteSize % 2 !== 0) return null;
  const sampleRate = header.readUInt32LE(24);
  if (
    header.toString("latin1", 0, 4) !== "RIFF" || header.readUInt32LE(4) !== byteSize - 8
    || header.toString("latin1", 8, 16) !== "WAVEfmt " || header.readUInt32LE(16) !== 16
    || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1
    || sampleRate < 8000 || sampleRate > MAX_CHAT_VOICE_SAMPLE_RATE
    || header.readUInt32LE(28) !== sampleRate * 2 || header.readUInt16LE(32) !== 2 || header.readUInt16LE(34) !== 16
    || header.toString("latin1", 36, 40) !== "data" || header.readUInt32LE(40) !== byteSize - 44
  ) return null;

  const seconds = (byteSize - 44) / (sampleRate * 2);
  return seconds <= MAX_CHAT_VOICE_SECONDS ? Math.ceil(seconds * 1000) : null;
}
