// Audio helpers for Exotel's stream format: raw 16-bit mono PCM (little-endian), 8 kHz.
// Exotel requires outbound media chunks of at least 3.2 KB (100 ms), at most 100 KB, and a
// multiple of 320 bytes.

export const FRAME_BYTES = 3200; // 100 ms at 8 kHz · 16-bit · mono

/**
 * Accumulates PCM and emits Exotel-sized frames.
 */
export class PcmFramer {
  #pending = Buffer.alloc(0);

  /** @param {Buffer} pcm @returns {Buffer[]} complete frames ready to send */
  push(pcm) {
    this.#pending = Buffer.concat([this.#pending, pcm]);
    const frames = [];
    while (this.#pending.length >= FRAME_BYTES) {
      frames.push(this.#pending.subarray(0, FRAME_BYTES));
      this.#pending = this.#pending.subarray(FRAME_BYTES);
    }
    return frames;
  }

  /** Pads the remainder with silence to a full frame. @returns {Buffer | null} */
  flush() {
    if (this.#pending.length === 0) return null;
    const frame = Buffer.alloc(FRAME_BYTES); // zero-filled = silence
    this.#pending.copy(frame);
    this.#pending = Buffer.alloc(0);
    return frame;
  }

  reset() {
    this.#pending = Buffer.alloc(0);
  }
}

/**
 * Returns the PCM payload of a WAV buffer, or the buffer unchanged when it is not WAV.
 * @param {Buffer} buf
 */
export function stripWavHeader(buf) {
  if (
    buf.length < 12 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return buf;
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      return buf.subarray(offset + 8, Math.min(buf.length, offset + 8 + size));
    }
    offset += 8 + size + (size % 2);
  }
  return Buffer.alloc(0);
}
