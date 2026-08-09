import { PitchShifter } from "soundtouchjs";

export type PlaybackState = "idle" | "playing" | "paused" | "stopped";

export class PitchTempoEngine {
  private _context: AudioContext | null = null;
  private _shifter: PitchShifter | null = null;
  private _buffer: AudioBuffer | null = null;
  private _state: PlaybackState = "idle";
  private _pitchSemitones = 0;
  private _tempo = 1.0;
  private _bufferSize = 4096;
  private _seekPosition = 0;
  private _gainNode: GainNode | null = null;
  private _rafId = 0;
  private _onTick: ((time: number, percent: number) => void) | null = null;
  private _onEnd: (() => void) | null = null;

  get state(): PlaybackState {
    return this._state;
  }
  get pitchSemitones(): number {
    return this._pitchSemitones;
  }
  get tempo(): number {
    return this._tempo;
  }
  get duration(): number {
    return this._buffer?.duration ?? 0;
  }
  get context(): AudioContext | null {
    return this._context;
  }
  get buffer(): AudioBuffer | null {
    return this._buffer;
  }
  get isPlaying(): boolean {
    return this._state === "playing";
  }

  set onTick(cb: ((time: number, percent: number) => void) | null) {
    this._onTick = cb;
  }
  set onEnd(cb: (() => void) | null) {
    this._onEnd = cb;
  }

  private _ensureContext(): AudioContext {
    if (!this._context || this._context.state === "closed") {
      this._context = new AudioContext();
    }
    if (this._context.state === "suspended") {
      this._context.resume();
    }
    return this._context;
  }

  async loadFile(file: File): Promise<number> {
    const ctx = this._ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    this._buffer = await ctx.decodeAudioData(arrayBuffer);
    this._state = "idle";
    this._seekPosition = 0;
    return this._buffer.duration;
  }

  play(): void {
    if (!this._buffer) return;

    if (this._state === "paused") {
      this._resumeFromPosition(this._seekPosition);
      return;
    }

    this._startFromPosition(this._seekPosition);
  }

  pause(): void {
    if (this._state !== "playing") return;

    this._seekPosition = this._shifter ? this._shifter.timePlayed : this._seekPosition;
    this._destroyShifter();
    this._state = "paused";
    this._stopRaf();
  }

  stop(): void {
    this._destroyShifter();
    this._stopRaf();
    this._seekPosition = 0;
    this._state = "stopped";
  }

  seek(percent: number): void {
    const target = Math.max(0, Math.min(1, percent));

    if (this._state === "playing") {
      this._seekPosition = target * this.duration;
      this._destroyShifter();
      this._startFromPosition(this._seekPosition);
    } else {
      this._seekPosition = target * this.duration;
      if (this._shifter) {
        this._shifter.percentagePlayed = target;
      }
    }
  }

  seekTime(seconds: number): void {
    if (this.duration <= 0) return;
    this.seek(seconds / this.duration);
  }

  setPitch(semitones: number): void {
    const clamped = Math.max(-12, Math.min(12, semitones));
    this._pitchSemitones = clamped;

    if (this._state === "playing") {
      this._seekPosition = this._shifter ? this._shifter.timePlayed : this._seekPosition;
      this._destroyShifter();
      this._startFromPosition(this._seekPosition);
    }
  }

  setTempo(factor: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, factor));
    this._tempo = clamped;

    if (this._state === "playing") {
      this._seekPosition = this._shifter ? this._shifter.timePlayed : this._seekPosition;
      this._destroyShifter();
      this._startFromPosition(this._seekPosition);
    }
  }

  reset(): void {
    this._destroyShifter();
    this._stopRaf();
    this._pitchSemitones = 0;
    this._tempo = 1.0;
    this._seekPosition = 0;
    this._state = "stopped";
  }

  destroy(): void {
    this._destroyShifter();
    this._stopRaf();
    if (this._context && this._context.state !== "closed") {
      this._context.close();
    }
    this._context = null;
    this._buffer = null;
    this._state = "idle";
  }

  private _startFromPosition(time: number): void {
    const ctx = this._ensureContext();
    if (!this._buffer) return;

    this._destroyShifter();

    this._shifter = new PitchShifter(ctx, this._buffer, this._bufferSize, () => {
      this._onEnd?.();
      this.stop();
    });

    this._shifter.tempo = this._tempo;
    this._shifter.pitchSemitones = this._pitchSemitones;
    this._shifter.percentagePlayed = this.duration > 0 ? time / this.duration : 0;

    this._gainNode = ctx.createGain();
    this._gainNode.gain.value = 0.85;
    this._shifter.connect(this._gainNode);
    this._gainNode.connect(ctx.destination);

    this._state = "playing";
    this._startRaf();
  }

  private _resumeFromPosition(time: number): void {
    this._seekPosition = time;
    this._startFromPosition(time);
  }

  private _destroyShifter(): void {
    if (this._shifter) {
      try {
        this._shifter.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this._shifter = null;
    }
    if (this._gainNode) {
      try {
        this._gainNode.disconnect();
      } catch {
        // ignore
      }
      this._gainNode = null;
    }
  }

  private _startRaf(): void {
    this._stopRaf();
    const tick = () => {
      if (this._state !== "playing" || !this._shifter) return;
      const time = this._shifter.timePlayed;
      const percent = this.duration > 0 ? time / this.duration : 0;
      this._onTick?.(time, percent);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _stopRaf(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }
}
