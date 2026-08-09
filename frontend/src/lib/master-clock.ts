"use client";

let _instance: MasterClock | null = null;

export class MasterClock {
  ctx!: AudioContext;
  masterBus!: GainNode;
  private _startTime = 0;
  private _startOffset = 0;
  private _playing = false;
  onTick: ((time: number) => void) | null = null;
  private _raf = 0;
  private _init = false;

  private constructor() {}

  static get instance(): MasterClock {
    if (!_instance) _instance = new MasterClock();
    return _instance;
  }

  static getOrNull(): MasterClock | null {
    if (typeof window === "undefined") return null;
    try {
      return MasterClock.instance;
    } catch {
      return null;
    }
  }

  private _ensureInit() {
    if (this._init) return;
    this.ctx = new AudioContext();
    this.masterBus = this.ctx.createGain();
    this.masterBus.gain.value = 0.85;
    this.masterBus.connect(this.ctx.destination);
    this._init = true;
  }

  get playing(): boolean {
    return this._playing;
  }

  get currentTime(): number {
    if (!this._playing) return this._startOffset;
    return this._startOffset + (performance.now() - this._startTime) / 1000;
  }

  set currentTime(t: number) {
    this._startOffset = t;
    if (this._playing) this._startTime = performance.now();
  }

  play(from?: number) {
    this._ensureInit();
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (from !== undefined) this._startOffset = from;
    this._startTime = performance.now();
    this._playing = true;
    this._tick();
  }

  pause() {
    this._startOffset = this.currentTime;
    this._playing = false;
    this.halt();
  }

  stop() {
    this._startOffset = 0;
    this._playing = false;
    this.halt();
  }

  halt() {
    cancelAnimationFrame(this._raf);
  }

  seekTo(time: number) {
    this._startOffset = Math.max(0, time);
    if (this._playing) this._startTime = performance.now();
  }

  private _tick() {
    if (!this._playing) return;
    this.onTick?.(this.currentTime);
    this._raf = requestAnimationFrame(() => this._tick());
  }

  createTrackGain(volume = 0.8): GainNode {
    this._ensureInit();
    const g = this.ctx.createGain();
    g.gain.value = volume;
    g.connect(this.masterBus);
    return g;
  }

  createTrackPanner(pan = 0): StereoPannerNode {
    this._ensureInit();
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  destroy() {
    this.halt();
    if (this._init) {
      this.ctx.close().catch(() => {});
    }
    _instance = null;
  }
}
