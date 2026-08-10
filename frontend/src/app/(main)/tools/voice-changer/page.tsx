"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Sparkles, FileAudio,
  Upload, Check, Play, Pause, ArrowUp, ArrowDown, Volume2,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, VoiceChangeResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

function formatSecs(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VoiceChangeResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Real-time preview state
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [autoPreview, setAutoPreview] = useState(true);
  const previewStartRef = useRef(0);
  const previewRafRef = useRef(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopPreview();
    };
  }, [previewUrl]);

  function stopPreview() {
    const src = previewSourceRef.current;
    if (src) {
      try { src.stop(); } catch {}
      previewSourceRef.current = null;
    }
    setIsPreviewing(false);
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
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
    const preFilter = ctx.createBiquadFilter();
    const postFilter = ctx.createBiquadFilter();

    // Formant shift via spectral tilt: high formant = emphasize highs, low = emphasize lows
    if (formantShift > 0) {
      preFilter.type = "highshelf";
      preFilter.frequency.value = 800;
      preFilter.gain.value = formantShift * 5;
      postFilter.type = "lowshelf";
      postFilter.frequency.value = 400;
      postFilter.gain.value = -formantShift * 2;
    } else if (formantShift < 0) {
      preFilter.type = "lowshelf";
      preFilter.frequency.value = 500;
      preFilter.gain.value = -formantShift * 4;
      postFilter.type = "highshelf";
      postFilter.frequency.value = 1500;
      postFilter.gain.value = formantShift * 3;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch shift via playback rate (duration changes — fine for preview)
    const pitchFactor = 2 ** (semitones / 12);
    source.playbackRate.value = pitchFactor;

    if (formantShift !== 0) {
      source.connect(preFilter);
      preFilter.connect(postFilter);
      postFilter.connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }

    source.start(0, start);
    previewSourceRef.current = source;
    previewStartRef.current = start;

    // Track playback position
    let lastUpdate = performance.now();
    const tick = () => {
      if (!previewSourceRef.current) return;
      const now = performance.now();
      const dt = (now - lastUpdate) / 1000;
      lastUpdate = now;
      setPreviewTime((t) => t + dt);
      previewRafRef.current = requestAnimationFrame(tick);
    };
    setIsPreviewing(true);
    previewRafRef.current = requestAnimationFrame(tick);

    source.onended = () => {
      previewSourceRef.current = null;
      setIsPreviewing(false);
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    };
  }

  function togglePreview() {
    if (isPreviewing) {
      stopPreview();
    } else {
      setPreviewTime(previewStartRef.current);
      startPreview();
    }
  }

  // Debounced preview update on slider change
  const previewTimeoutRef = useRef<number | null>(null);
  function schedulePreviewUpdate() {
    if (!autoPreview || !audioBufferRef.current) return;
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(() => {
      if (isPreviewing) {
        startPreview(previewStartRef.current);
      }
    }, 200);
  }

  const handleSemitones = useCallback((v: number) => {
    setSemitones(v);
    schedulePreviewUpdate();
  }, [isPreviewing, autoPreview]);

  const handleFormant = useCallback((v: number) => {
    setFormantShift(v);
    schedulePreviewUpdate();
  }, [isPreviewing, autoPreview]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) {
      loadFile(f);
    }
  }, [previewUrl]);

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
    previewTimeoutRef.current = setTimeout(() => {
      if (isPreviewing && audioBufferRef.current) {
        startPreview(previewStartRef.current);
      }
    }, 200);
  }

  async function handleChange() {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const data = await api.tools.voiceChange(file, semitones, formantShift);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setProcessing(false);
  }

  const isPlaying = result && audioPlayer.isCurrentUrl(result.url) && audioPlayer.isPlaying;
  const hasAudio = audioBufferRef.current !== null;

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
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
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
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-3">
                <FileAudio className="w-5 h-5 text-daw-green" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-daw-text-dim">({formatSize(file.size)})</span>
                {hasAudio && (
                  <Badge variant="green" className="text-[9px]">
                    <Check className="w-2.5 h-2.5" /> Ready
                  </Badge>
                )}
              </div>

              {/* Preview transport bar */}
              {hasAudio && (
                <div className="flex items-center gap-2 max-w-xs mx-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePreview(); }}
                    className={cn(
                      "p-1.5 rounded-full transition-colors",
                      isPreviewing
                        ? "bg-pink-500/20 text-pink-400"
                        : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text",
                    )}
                  >
                    {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={audioBufferRef.current?.duration ?? 1}
                    step={0.05}
                    value={previewTime}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      setPreviewTime(t);
                      previewStartRef.current = t;
                      if (isPreviewing) startPreview(t);
                    }}
                    className="flex-1 h-1 rounded-full bg-daw-surface-2 accent-pink-400 cursor-pointer"
                  />
                  <span className="text-[9px] text-daw-text-dim font-mono w-12 text-right tabular-nums">
                    {formatSecs(previewTime)}
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={autoPreview}
                      onChange={(e) => setAutoPreview(e.target.checked)}
                      className="w-3 h-3 rounded accent-pink-400"
                    />
                    <span className="text-[9px] text-daw-text-dim">auto</span>
                  </label>
                </div>
              )}
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
