export interface MixdownTrack {
  buffer: Float32Array;
  sampleRate: number;
  volume: number;
  pan: number;
  startOffset: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
}

export interface MixdownRequest {
  tracks: MixdownTrack[];
  duration: number;
  sampleRate: number;
}

self.onmessage = async (e: MessageEvent<{ tracks: MixdownTrack[]; duration: number; sampleRate: number }>) => {
  const { tracks, duration, sampleRate } = e.data;
  const sr = sampleRate || 44100;
  const totalFrames = Math.ceil(duration * sr);
  const ctx = new OfflineAudioContext(2, totalFrames, sr);

  const sources: AudioBufferSourceNode[] = [];

  for (const track of tracks) {
    const buf = ctx.createBuffer(1, track.buffer.length, track.sampleRate);
    buf.getChannelData(0).set(track.buffer);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = 0;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const gain = ctx.createGain();
    gain.gain.value = track.volume;

    if (panner) {
      src.connect(panner);
      panner.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(ctx.destination);

    const offset = Math.max(0, (track.trimStart || 0) + (track.startOffset || 0));
    const when = 0;
    const effectiveDuration = track.duration - (track.trimStart || 0) - (track.trimEnd || 0);

    if (panner) {
      panner.pan.value = track.pan;
    }

    src.start(when, offset, effectiveDuration);
    sources.push(src);
  }

  const rendered = await ctx.startRendering();
  const wav = encodeWav(rendered);

  self.postMessage({ wav }, { transfer: [wav] });
};

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitsPerSample = 16;

  const left = buffer.getChannelData(0);
  const right = numChannels > 1 ? buffer.getChannelData(1) : left;

  const dataLength = left.length * numChannels * (bitsPerSample / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  const wav = new ArrayBuffer(totalLength);
  const view = new DataView(wav);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < left.length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l * 0x7fff, true);
    offset += 2;
    view.setInt16(offset, r * 0x7fff, true);
    offset += 2;
  }

  return wav;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
