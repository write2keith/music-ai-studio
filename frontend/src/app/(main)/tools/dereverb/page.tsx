"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Waves, FileAudio,
  Upload, Check, Play, Pause,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, DereverbResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

function formatSecs(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STRENGTHS = [
  { value: 0.3, label: "Light" },
  { value: 0.5, label: "Medium" },
  { value: 0.7, label: "Strong" },
  { value: 0.9, label: "Max" },
];

export default function DereverbPage() {
  const audioPlayer = useAudioPlayer();

  const [file, setFile] = useState<File | null>(null);
  const [strength, setStrength] = useState(0.7);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DereverbResult | null>(null);
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

  async function handleDereverb() {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const data = await api.tools.dereverb(file, strength);
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
          <Waves className="w-5 h-5 text-sky-400" />
          Echo / Reverb Remover
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Reduce echo, room reverb, and ambient reflections using envelope-based
          dereverberation. Works best on speech and vocal recordings.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Drop */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("dr-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            file
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="dr-file-input"
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
                className="p-1.5 rounded-full bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors"
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
              <p className="text-sm text-daw-text-muted">Drop audio with echo/reverb here or click to browse</p>
            </div>
          )}
        </div>

        <audio
          ref={previewRef}
          src={previewUrl}
          onEnded={() => setIsPreviewing(false)}
          onPause={() => setIsPreviewing(false)}
          className="hidden"
        />

        {/* Strength */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-daw-text-dim">Dereverb Strength</label>
            <span className="text-xs font-mono text-daw-accent">{(strength * 100).toFixed(0)}%</span>
          </div>
          <div className="flex gap-1">
            {STRENGTHS.map((l) => (
              <button
                key={l.value}
                onClick={() => setStrength(l.value)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                  strength === l.value
                    ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-daw-text-dim mt-1">
            Higher values cut more reverb tail but may affect voice clarity.
          </p>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleDereverb}
          disabled={processing || !file}
        >
          {processing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Removing Reverb...</>
          ) : (
            <><Waves className="w-4 h-4" /> Remove Echo/Reverb</>
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
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center shrink-0 hover:from-sky-500/40 hover:to-blue-500/40 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-sky-400" />
                ) : (
                  <Play className="w-5 h-5 text-sky-400 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Dereverbed Audio</span>
                  <Badge variant="green"><Check className="w-3 h-3" /> Ready</Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-daw-text-dim">
                  <span>{formatSecs(result.duration)}</span>
                  <span>Strength: {(result.strength * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
            <a
              href={result.url}
              download={result.filename}
              className="daw-button daw-button-primary text-xs inline-flex"
            >
              <Download className="w-3.5 h-3.5" /> Download Dereverbed
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
