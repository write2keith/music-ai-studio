export function equalPowerGains(pan: number): { left: number; right: number } {
  const clamped = Math.max(-1, Math.min(1, pan));
  const angle = ((clamped + 1) / 2) * (Math.PI / 2);
  return {
    left: Math.cos(angle),
    right: Math.sin(angle),
  };
}

export function interpolateExponential(prev: number, next: number, t: number): number {
  if (prev <= 0) prev = 1e-6;
  if (next <= 0) next = 1e-6;
  return prev * Math.pow(next / prev, t);
}

export function interpolateLinear(prev: number, next: number, t: number): number {
  return prev + (next - prev) * t;
}

export type AutomationCurveType = "linear" | "exponential";

export function interpolateEnvelope(
  points: { time: number; value: number }[],
  time: number,
  curve: AutomationCurveType = "linear",
): number {
  if (points.length === 0) return 1;
  if (points.length === 1) return points[0].value;
  if (time <= points[0].time) return points[0].value;
  if (time >= points[points.length - 1].time) return points[points.length - 1].value;

  for (let i = 0; i < points.length - 1; i++) {
    if (time >= points[i].time && time <= points[i + 1].time) {
      const dur = points[i + 1].time - points[i].time;
      if (dur <= 0) return points[i].value;
      const t = (time - points[i].time) / dur;
      if (curve === "exponential") {
        return interpolateExponential(points[i].value, points[i + 1].value, t);
      }
      return interpolateLinear(points[i].value, points[i + 1].value, t);
    }
  }
  return points[points.length - 1].value;
}

export class AudioChunkManager {
  private fullBuffer: AudioBuffer | null = null;
  private chunkSize: number;
  private preloadMargin: number;

  constructor(chunkSize: number = 15, preloadMargin: number = 5) {
    this.chunkSize = chunkSize;
    this.preloadMargin = preloadMargin;
  }

  setBuffer(buffer: AudioBuffer) {
    this.fullBuffer = buffer;
  }

  clear() {
    this.fullBuffer = null;
  }

  get buffer(): AudioBuffer | null {
    return this.fullBuffer;
  }

  get loaded(): boolean {
    return this.fullBuffer !== null;
  }

  get activeWindow(playheadTime: number): { start: number; end: number } | null {
    if (!this.fullBuffer) return null;
    const start = Math.max(0, playheadTime - this.preloadMargin);
    const end = Math.min(this.fullBuffer.duration, playheadTime + this.chunkSize + this.preloadMargin);
    return { start, end };
  }

  shouldSourceBeActive(playheadTime: number, clipStart: number, clipDuration: number): boolean {
    const window = this.activeWindow(playheadTime);
    if (!window) return true;
    const clipEnd = clipStart + clipDuration;
    return clipStart < window.end && clipEnd > window.start;
  }

  sliceBuffer(startTime: number, duration: number): AudioBuffer | null {
    if (!this.fullBuffer) return null;
    const sr = this.fullBuffer.sampleRate;
    const startFrame = Math.floor(startTime * sr);
    const frameCount = Math.min(
      Math.ceil(duration * sr),
      this.fullBuffer.length - startFrame,
    );
    if (frameCount <= 0) return null;

    const ctx = new OfflineAudioContext(
      this.fullBuffer.numberOfChannels,
      frameCount,
      sr,
    );
    const sliced = ctx.createBuffer(
      this.fullBuffer.numberOfChannels,
      frameCount,
      sr,
    );
    for (let ch = 0; ch < this.fullBuffer.numberOfChannels; ch++) {
      sliced.getChannelData(ch).set(
        this.fullBuffer.getChannelData(ch).subarray(startFrame, startFrame + frameCount),
      );
    }
    return sliced;
  }

  get duration(): number {
    return this.fullBuffer?.duration ?? 0;
  }
}
