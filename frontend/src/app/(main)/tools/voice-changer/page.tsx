"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Sparkles, FileAudio,
  Upload, Check, Play, Pause, ArrowUp, ArrowDown, Volume2,
  Repeat, SkipBack, Cpu, Zap, Brain,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, VoiceChangeResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

const SNIPPET_OPTIONS = [5, 8, 10, 0] as const;

function formatSecs(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PRESETS = [
  { semitones: -5, formant: 0, label: "Deep Voice", icon: ArrowDown },
  { semitones: -2, formant: 2, label: "Robotic Deep", icon: ArrowDown },
  { semitones: 3, formant: -2, label: "Chipmunk", icon: ArrowUp },
  { semitones: 5, formant: 3, label: "Alien", icon: ArrowUp },
  { semitones: 0, formant: 4, label: "Giant", icon: Sparkles },
  { semitones: 0, formant: -4, label: "Tiny", icon: Sparkles },
];

export default function VoiceChangerPage() {
  const audioPlayer = useAudioPlayer();

  const [file, setFile] = useState<File | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [formantShift, setFormantShift] = useState(0);
  const [method, setMethod] = useState<"auto" | "spectral" | "crepe" | "rvc">("auto");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VoiceChangeResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Real-time preview state
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewFilterRef = useRef<{
    pre: BiquadFilterNode;
    post: BiquadFilterNode;
  } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [autoPreview, setAutoPreview] = useState(true);
  const previewStartRef = useRef(0);
  const previewRafRef = useRef(0);
  const [snippetLength, setSnippetLength] = useState<number>(8);
  const [snippetLoop, setSnippetLoop] = useState(true);
  const loopRef = useRef(false);

  // WebSocket streaming preview (low-latency CREPE pipeline)
  const [streamingPreview, setStreamingPreview] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamCtxRef = useRef<AudioContext | null>(null);
  const streamSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const streamBufRef = useRef<AudioBuffer | null>(null);
  const streamQueueRef = useRef<Float32Array[]>([]);
  const streamPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopPreview();
    };
  }, [previewUrl]);

  function stopPreview() {
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = 0;
    loopRef.current = false;
    const src = previewSourceRef.current;
    if (src) {
      src.onended = null;
      try { src.stop(); } catch {}
      previewSourceRef.current = null;
    }
    stopStreamingPreview();
    setIsPreviewing(false);
  }

  function togglePreview() {
    if (isPreviewing) {
      stopPreview();
    } else if (streamingPreview && audioBufferRef.current) {
      startStreamingPreview(audioBufferRef.current);
      setIsPreviewing(true);
    } else {
      setPreviewTime(previewStartRef.current);
      startPreview();
    }
  }

  function buildPreviewChain(ctx: AudioContext, source: AudioBufferSourceNode) {
    if (previewFilterRef.current) {
      try { previewFilterRef.current.pre.disconnect(); } catch {}
      try { previewFilterRef.current.post.disconnect(); } catch {}
      previewFilterRef.current = null;
    }

    const pre = ctx.createBiquadFilter();
    const post = ctx.createBiquadFilter();

    if (formantShift > 0) {
      pre.type = "highshelf";
      pre.frequency.value = 800;
      pre.gain.value = formantShift * 5;
      post.type = "lowshelf";
      post.frequency.value = 400;
      post.gain.value = -formantShift * 2;
    } else if (formantShift < 0) {
      pre.type = "lowshelf";
      pre.frequency.value = 500;
      pre.gain.value = -formantShift * 4;
      post.type = "highshelf";
      post.frequency.value = 1500;
      post.gain.value = formantShift * 3;
    }

    if (formantShift !== 0) {
      source.connect(pre);
      pre.connect(post);
      post.connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }

    previewFilterRef.current = { pre, post };
  }

  function startPreview(seekTo?: number) {
    const buffer = audioBufferRef.current;
    if (!buffer) return;

    stopPreview();

    let ctx = previewCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      previewCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") ctx.resume();

    const start = seekTo ?? previewStartRef.current;
    const end =
      snippetLength > 0 && snippetLoop
        ? Math.min(start + snippetLength, buffer.duration)
        : buffer.duration;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const pitchFactor = 2 ** (semitones / 12);
    source.playbackRate.value = pitchFactor;

    buildPreviewChain(ctx, source);

    source.start(0, start);
    previewSourceRef.current = source;
    previewStartRef.current = start;

    let lastUpdate = performance.now();
    let accumulated = start;
    const tick = () => {
      if (!previewSourceRef.current) return;
      const now = performance.now();
      const dt = (now - lastUpdate) / 1000 / pitchFactor;
      lastUpdate = now;
      accumulated += dt;
      setPreviewTime(accumulated);
      previewRafRef.current = requestAnimationFrame(tick);
    };
    setIsPreviewing(true);
    previewRafRef.current = requestAnimationFrame(tick);

    source.onended = () => {
      previewSourceRef.current = null;
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);

      if (snippetLoop && snippetLength > 0 && end < buffer.duration) {
        setIsPreviewing(false);
        previewStartRef.current = start;
        setPreviewTime(start);
        setTimeout(() => startPreview(start), 120);
      } else {
        setIsPreviewing(false);
        if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      }
    };
  }

  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function schedulePreviewUpdate() {
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(() => {
      if (autoPreview && isPreviewing && audioBufferRef.current) {
        startPreview(previewStartRef.current);
      }
    }, 200);
  }

  // ── WebSocket Streaming Preview ──────────────────────────────

  function stopStreamingPreview() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamSrcRef.current) {
      try { streamSrcRef.current.stop(); } catch {}
      streamSrcRef.current = null;
    }
    streamQueueRef.current = [];
    streamPlayingRef.current = false;
    streamBufRef.current = null;
  }

  function startStreamingPreview(sourceBuffer: AudioBuffer, seekTo?: number) {
    stopStreamingPreview();

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${window.location.host}/api/tools/ws/voice-change-preview`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const ctx = new AudioContext();
    streamCtxRef.current = ctx;

    const sr = sourceBuffer.sampleRate;
    const channels = sourceBuffer.numberOfChannels;
    const fullData = sourceBuffer.getChannelData(0);
    if (channels > 1) {
      const right = sourceBuffer.getChannelData(1);
      for (let i = 0; i < fullData.length; i++) fullData[i] = (fullData[i] + right[i]) / 2;
    }

    // Resample to 16kHz for CREPE
    let audio16k = fullData;
    if (sr !== 16000 && sr > 0) {
      const ratio = 16000 / sr;
      const outLen = Math.round(fullData.length * ratio);
      const resampled = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcIdx = i / ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, fullData.length - 1);
        const frac = srcIdx - lo;
        resampled[i] = fullData[lo] * (1 - frac) + fullData[hi] * frac;
      }
      audio16k = resampled;
    }

    const CHUNK = 1024;
    const chunks: Float32Array[] = [];
    for (let i = 0; i < audio16k.length; i += CHUNK) {
      chunks.push(audio16k.slice(i, i + CHUNK));
    }

    // Send params
    ws.onopen = () => {
      ws.send(JSON.stringify({
        cmd: "params",
        semitones,
        formant_shift: formantShift,
      }));
      ws.send(JSON.stringify({ cmd: "reset" }));

      // Stream all chunks
      for (const chunk of chunks) {
        ws.send(chunk.buffer);
      }
      ws.send(JSON.stringify({
        cmd: "process",
        semitones,
        formant_shift: formantShift,
      }));
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const processed = new Float32Array(ev.data);
        streamQueueRef.current.push(processed);
        if (!streamPlayingRef.current) {
          _playStreamQueue(ctx);
        }
      }
    };

    ws.onerror = () => {
      stopStreamingPreview();
    };

    ws.onclose = () => {
      streamPlayingRef.current = false;
    };
  }

  function _playStreamQueue(ctx: AudioContext) {
    const queue = streamQueueRef.current;
    if (queue.length === 0) {
      streamPlayingRef.current = false;
      return;
    }
    streamPlayingRef.current = true;

    const chunk = queue.shift()!;
    const buf = ctx.createBuffer(1, chunk.length, 16000);
    buf.getChannelData(0).set(chunk);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    streamSrcRef.current = src;

    src.onended = () => {
      _playStreamQueue(ctx);
    };
    src.start();
  }

  const handleSemitones = useCallback((v: number) => {
    setSemitones(v);
    schedulePreviewUpdate();
  }, []);

  const handleFormant = useCallback((v: number) => {
    setFormantShift(v);
    schedulePreviewUpdate();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) {
      loadFile(f);
    }
  }, []);

  const handleFileInput = (f: File) => {
    loadFile(f);
  };

  async function loadFile(f: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopPreview();
    setFile(f);
    setResult(null);
    setError("");
    setPreviewTime(0);
    previewStartRef.current = 0;
    audioBufferRef.current = null;

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    try {
      const ab = await f.arrayBuffer();
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(ab);
      audioBufferRef.current = buf;
      ctx.close();
    } catch {}
  }

  function applyPreset(s: number, f: number) {
    setSemitones(s);
    setFormantShift(f);
    if (autoPreview && isPreviewing && audioBufferRef.current) {
      // Restart preview after state updates
      const restart = () => {
        previewStartRef.current = 0;
        startPreview(0);
      };
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = setTimeout(restart, 200);
    }
  }

  async function handleChange() {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const data = await api.tools.voiceChange(file, semitones, formantShift, method);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setProcessing(false);
  }

  const isPlaying = result && audioPlayer.isCurrentUrl(result.url) && audioPlayer.isPlaying;
  const hasAudio = audioBufferRef.current !== null;
  const bufferDuration = audioBufferRef.current?.duration ?? 0;
  const waveformProgress = bufferDuration > 0 ? (previewTime / bufferDuration) * 100 : 0;

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Voice Changer
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Transform voice with pitch shifting and formant preservation. Preview effects in real-time,
          then process the full file when satisfied.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Drop */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => !file && document.getElementById("vg-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors",
            file
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="vg-file-input"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileInput(f);
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="w-5 h-5 text-daw-green shrink-0" />
              <span className="text-sm font-medium truncate max-w-[240px]">{file.name}</span>
              <span className="text-xs text-daw-text-dim shrink-0">({formatSize(file.size)})</span>
              {hasAudio ? (
                <Badge variant="green" className="text-[9px]">
                  <Check className="w-2.5 h-2.5" /> Ready
                </Badge>
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-daw-accent" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadFile(file);
                }}
                className="text-[9px] text-daw-text-dim hover:text-daw-accent underline underline-offset-2"
              >
                reload
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop voice audio here or click to browse</p>
            </div>
          )}
        </div>

        {/* Pitch */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-daw-text-dim">Pitch Shift</label>
            <span className="text-xs text-daw-accent font-mono">{semitones > 0 ? "+" : ""}{semitones} semitones</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSemitones(Math.max(-12, semitones - 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >-</button>
            <input
              type="range"
              min={-12}
              max={12}
              value={semitones}
              onChange={(e) => handleSemitones(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full bg-daw-surface-2 appearance-none cursor-pointer accent-daw-accent"
            />
            <button
              onClick={() => handleSemitones(Math.min(12, semitones + 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >+</button>
            <input
              type="number"
              min={-12}
              max={12}
              value={semitones}
              onChange={(e) => handleSemitones(Math.max(-12, Math.min(12, Number(e.target.value) || 0)))}
              className="w-12 bg-daw-surface-1 text-daw-text text-xs text-center rounded px-1 py-0.5 outline-none border border-daw-border [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex justify-between text-[9px] text-daw-text-dim mt-0.5">
            <span>-12 (deep)</span>
            <span>0 (original)</span>
            <span>+12 (high)</span>
          </div>
        </div>

        {/* Formant */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-daw-text-dim">Formant Shift</label>
            <span className="text-xs text-cyan-400 font-mono">{formantShift > 0 ? "+" : ""}{formantShift}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFormant(Math.max(-6, formantShift - 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >-</button>
            <input
              type="range"
              min={-6}
              max={6}
              value={formantShift}
              onChange={(e) => handleFormant(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full bg-daw-surface-2 appearance-none cursor-pointer accent-cyan-400"
            />
            <button
              onClick={() => handleFormant(Math.min(6, formantShift + 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >+</button>
            <input
              type="number"
              min={-6}
              max={6}
              value={formantShift}
              onChange={(e) => handleFormant(Math.max(-6, Math.min(6, Number(e.target.value) || 0)))}
              className="w-12 bg-daw-surface-1 text-daw-text text-xs text-center rounded px-1 py-0.5 outline-none border border-daw-border [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex justify-between text-[9px] text-daw-text-dim mt-0.5">
            <span>-6 (smaller)</span>
            <span>0 (original)</span>
            <span>+6 (larger)</span>
          </div>
        </div>

        {/* Method Selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Engine</label>
          <div className="grid grid-cols-4 gap-1">
            {([
              { k: "auto", label: "Auto", icon: Zap, desc: "Best available" },
              { k: "spectral", label: "Spectral", icon: Cpu, desc: "Legacy FFT" },
              { k: "crepe", label: "CREPE", icon: Brain, desc: "Neural F0" },
              { k: "rvc", label: "RVC", icon: Sparkles, desc: "Voice clone" },
            ] as const).map(({ k, label, icon: Icon, desc }) => (
              <button
                key={k}
                onClick={() => setMethod(k)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2 rounded-md text-xs font-medium transition-all border",
                  method === k
                    ? "bg-pink-500/10 text-pink-400 border-pink-400/30"
                    : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span className="text-[8px] text-daw-text-dim leading-none">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Quick Presets</label>
          <div className="grid grid-cols-3 gap-1">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.semitones, p.formant)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    semitones === p.semitones && formantShift === p.formant
                      ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Preview Mini-Player */}
        <AnimatePresence>
          {hasAudio && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl bg-daw-surface-1 border border-pink-400/15 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-[10px] uppercase tracking-wider text-pink-400/80 font-semibold">
                    Live Preview
                  </span>
                  {isPreviewing && (
                    <span className="flex items-center gap-1 text-[9px] text-daw-green">
                      <span className="w-1.5 h-1.5 rounded-full bg-daw-green animate-pulse" />
                      playing
                    </span>
                  )}
                </div>

                {/* Transport controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePreview(); }}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all",
                      isPreviewing
                        ? "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30"
                        : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3",
                    )}
                  >
                    {isPreviewing ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1.5">
                    {/* Waveform-style progress bar */}
                    <div className="relative h-6 rounded-md bg-daw-surface-3/60 overflow-hidden cursor-pointer group"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const t = ratio * bufferDuration;
                        setPreviewTime(t);
                        previewStartRef.current = t;
                        if (isPreviewing) startPreview(t);
                      }}
                    >
                      {/* Played region */}
                      <div
                        className="absolute inset-y-0 left-0 bg-pink-400/10 transition-[width] duration-75"
                        style={{ width: `${waveformProgress}%` }}
                      />
                      {/* Snippet region highlight */}
                      {snippetLoop && snippetLength > 0 && (
                        <div
                          className="absolute inset-y-0 bg-pink-400/5 border-l border-r border-pink-400/20"
                          style={{
                            left: `${(previewStartRef.current / bufferDuration) * 100}%`,
                            width: `${Math.min((snippetLength / bufferDuration) * 100, 100 - (previewStartRef.current / bufferDuration) * 100)}%`,
                          }}
                        />
                      )}
                      {/* Playhead */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-pink-400 shadow-[0_0_6px_rgba(244,114,182,0.5)] transition-[left] duration-75"
                        style={{ left: `${waveformProgress}%` }}
                      />
                      {/* Mini waveform ticks */}
                      <div className="absolute inset-0 flex items-center justify-around pointer-events-none opacity-20">
                        {Array.from({ length: 24 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-px bg-daw-text-dim"
                            style={{ height: `${12 + Math.sin(i * 1.7) * 8}px` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Time display */}
                    <div className="flex justify-between text-[9px] text-daw-text-dim font-mono">
                      <span>{formatSecs(previewTime)}</span>
                      <span>{formatSecs(bufferDuration)}</span>
                    </div>
                  </div>

                  {/* Restart button */}
                  <button
                    onClick={() => {
                      previewStartRef.current = 0;
                      setPreviewTime(0);
                      if (isPreviewing) startPreview(0);
                    }}
                    className="w-7 h-7 rounded-full bg-daw-surface-2 text-daw-text-dim hover:text-daw-text flex items-center justify-center"
                    title="Restart"
                  >
                    <SkipBack className="w-3 h-3" />
                  </button>
                </div>

                {/* Options row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Snippet length selector */}
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-daw-text-dim mr-1">Snippet:</span>
                    {SNIPPET_OPTIONS.map((len) => (
                      <button
                        key={len}
                        onClick={() => {
                          setSnippetLength(len);
                          if (len === 0) setSnippetLoop(false);
                        }}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                          snippetLength === len
                            ? "bg-pink-500/15 text-pink-400"
                            : "bg-daw-surface-3 text-daw-text-dim hover:text-daw-text",
                        )}
                      >
                        {len === 0 ? "Full" : `${len}s`}
                      </button>
                    ))}
                  </div>

                  <span className="text-daw-border">|</span>

                  {/* Loop toggle */}
                  <label
                    className={cn(
                      "flex items-center gap-1.5 cursor-pointer select-none",
                      snippetLength === 0 && "opacity-30 pointer-events-none",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={snippetLoop}
                      onChange={(e) => setSnippetLoop(e.target.checked)}
                      className="w-3 h-3 rounded accent-pink-400"
                    />
                    <Repeat className="w-3 h-3 text-daw-text-dim" />
                    <span className="text-[9px] text-daw-text-dim">Loop</span>
                  </label>

                  <span className="text-daw-border">|</span>

                  {/* Auto-preview toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoPreview}
                      onChange={(e) => setAutoPreview(e.target.checked)}
                      className="w-3 h-3 rounded accent-pink-400"
                    />
                    <span className="text-[9px] text-daw-text-dim">Auto-update</span>
                  </label>

                  <span className="text-daw-border">|</span>

                  {/* Streaming preview toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={streamingPreview}
                      onChange={(e) => {
                        setStreamingPreview(e.target.checked);
                        stopPreview();
                      }}
                      className="w-3 h-3 rounded accent-pink-400"
                    />
                    <Brain className="w-3 h-3 text-daw-text-dim" />
                    <span className="text-[9px] text-daw-text-dim">CREPE stream</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-2">
          {hasAudio && (
            <Button
              size="lg"
              variant="secondary"
              onClick={togglePreview}
              className="flex-1"
            >
              {isPreviewing ? (
                <><Pause className="w-4 h-4 mr-1" /> Stop Preview</>
              ) : (
                <><Volume2 className="w-4 h-4 mr-1" /> Preview Effect</>
              )}
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            onClick={handleChange}
            disabled={processing || !file}
          >
            {processing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-1" /> Transform Voice</>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-daw-green/20"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => audioPlayer.toggle(result.url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center shrink-0 hover:from-pink-500/40 hover:to-rose-500/40 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-pink-400" />
                ) : (
                  <Play className="w-5 h-5 text-pink-400 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Transformed Voice</span>
                  <Badge variant="green"><Check className="w-3 h-3" /> Ready</Badge>
                  {result.method && (
                    <Badge variant="default" className="text-[9px] bg-pink-500/10 text-pink-400">
                      {result.method}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-daw-text-dim">
                  <span>{formatSecs(result.duration)}</span>
                  <span className="text-daw-accent">Pitch: {result.semitones > 0 ? "+" : ""}{result.semitones} st</span>
                  <span className="text-cyan-400">Formant: {result.formant_shift > 0 ? "+" : ""}{result.formant_shift}</span>
                </div>
              </div>
            </div>
            <a
              href={result.url}
              download={result.filename}
              className="daw-button daw-button-primary text-xs inline-flex"
            >
              <Download className="w-3.5 h-3.5" /> Download Transformed
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
