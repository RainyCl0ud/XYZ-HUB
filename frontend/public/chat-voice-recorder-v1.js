/* global AudioWorkletProcessor, registerProcessor */
class ChatVoiceRecorder extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.remaining = processorOptions.maxFrames;
    this.chunk = new Int16Array(4096);
    this.used = 0;
    this.finished = false;
    this.port.onmessage = () => this.finish();
  }

  flush() {
    if (!this.used) return;
    const samples = this.chunk.slice(0, this.used);
    this.port.postMessage({ samples }, [samples.buffer]);
    this.used = 0;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.flush();
    this.port.postMessage({ done: true });
  }

  process(inputs) {
    if (this.finished) return false;
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    const count = Math.min(samples.length, this.remaining);
    for (let i = 0; i < count; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      this.chunk[this.used++] = sample * (sample < 0 ? 32768 : 32767);
      if (this.used === this.chunk.length) this.flush();
    }
    this.remaining -= count;
    if (!this.remaining) this.finish();
    return !this.finished;
  }
}

registerProcessor("chat-voice-recorder", ChatVoiceRecorder);
