"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Sparkles, FileAudio,
  Upload, Check, Play, Pause, ArrowUp, ArrowDown,
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
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setResult(null);
      setError("");
      setPreviewUrl(URL.createObjectURL(f));
    }
  }, [previewUrl]);

  const handleFileInput = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setResult(null);
    setError("");
    setPreviewUrl(URL.createObjectURL(f));
  };

  function togglePreview(e: React.MouseEvent) {
    e.stopPropagation();
    const a = previewRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setIsPreviewing(true); }
    else { a.pause(); setIsPreviewing(false); }
  }

  function applyPreset(s: number, f: number) {
    setSemitones(s);
    setFormantShift(f);
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

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          Voice Changer
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Transform voice with pitch shifting and formant preservation. Change gender, create
          character voices, or experiment with robotic and chipmunk effects.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Drop */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("vg-file-input")?.click()}
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
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={togglePreview}
                className="p-1.5 rounded-full bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 transition-colors"
              >
                {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <FileAudio className="w-5 h-5 text-daw-green" />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-daw-text-dim">({formatSize(file.size)})</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop voice audio here or click to browse</p>
            </div>
          )}
        </div>

        {previewUrl && (
        <audio
          ref={previewRef}
          src={previewUrl}
          onEnded={() => setIsPreviewing(false)}
          onPause={() => setIsPreviewing(false)}
          className="hidden"
        />
        )}

        {/* Pitch */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-daw-text-dim">Pitch Shift</label>
            <span className="text-xs text-daw-accent font-mono">{semitones > 0 ? "+" : ""}{semitones} semitones</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSemitones(Math.max(-12, semitones - 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >-</button>
            <input
              type="range"
              min={-12}
              max={12}
              value={semitones}
              onChange={(e) => setSemitones(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full bg-daw-surface-2 appearance-none cursor-pointer accent-daw-accent"
            />
            <button
              onClick={() => setSemitones(Math.min(12, semitones + 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >+</button>
            <input
              type="number"
              min={-12}
              max={12}
              value={semitones}
              onChange={(e) => setSemitones(Math.max(-12, Math.min(12, Number(e.target.value) || 0)))}
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
              onClick={() => setFormantShift(Math.max(-6, formantShift - 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >-</button>
            <input
              type="range"
              min={-6}
              max={6}
              value={formantShift}
              onChange={(e) => setFormantShift(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full bg-daw-surface-2 appearance-none cursor-pointer accent-cyan-400"
            />
            <button
              onClick={() => setFormantShift(Math.min(6, formantShift + 1))}
              className="w-5 h-5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text text-xs flex items-center justify-center"
            >+</button>
            <input
              type="number"
              min={-6}
              max={6}
              value={formantShift}
              onChange={(e) => setFormantShift(Math.max(-6, Math.min(6, Number(e.target.value) || 0)))}
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

        <Button
          size="lg"
          className="w-full"
          onClick={handleChange}
          disabled={processing || !file}
        >
          {processing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Transforming Voice...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Transform Voice</>
          )}
        </Button>

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
