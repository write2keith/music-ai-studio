"use client";

let _instance: MasterClock | null = null;

export class MasterClock {
  ctx!: AudioContext;
  masterBus!: GainNode;

  // Effects chain
  reverbNode!: ConvolverNode;
  reverbWetGain!: GainNode;
  compressorNode!: DynamicsCompressorNode;
  private _effectsReady = false;

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

  ensureEffects() {
    this._ensureInit();
    if (this._effectsReady) return;

    // Generate reverb impulse response: noise burst with exponential decay
    const irDuration = 2.0;
    const irLength = Math.floor(this.ctx.sampleRate * irDuration);
    const ir = this.ctx.createBuffer(2, irLength, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLength; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 3);
      }
    }

    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = ir;
    this.reverbNode.normalize = true;

    this.reverbWetGain = this.ctx.createGain();
    this.reverbWetGain.gain.value = 0.25;
    this.reverbWetGain.connect(this.reverbNode);

    this.compressorNode = this.ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24;
    this.compressorNode.knee.value = 30;
    this.compressorNode.ratio.value = 12;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.25;

    // Re-route: masterBus → compressor → destination (was masterBus → destination)
    this.masterBus.disconnect();
    this.masterBus.connect(this.compressorNode);
    this.compressorNode.connect(this.ctx.destination);

    // Reverb goes through compressor too
    this.reverbNode.connect(this.compressorNode);

    this._effectsReady = true;
  }

  get effectsReady(): boolean {
    return this._effectsReady;
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
