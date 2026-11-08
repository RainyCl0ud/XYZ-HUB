export function chatVoiceFile(sampleRate: number, frames: number, chunks: Int16Array[]) {
  const dataSize = frames * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const header = new DataView(buffer);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) header.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  header.setUint32(4, 36 + dataSize, true);
  tag(8, "WAVEfmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  tag(36, "data");
  header.setUint32(40, dataSize, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      header.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return new File([buffer], "Voice message.wav", { type: "audio/wav" });
}
