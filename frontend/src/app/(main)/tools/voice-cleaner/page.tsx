"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Mic, FileAudio,
  Upload, Check, Play, Pause, Volume2,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, VoiceCleanResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

function formatSecs(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const NOISE_LEVELS = [
  { value: 0.3, label: "Light" },
  { value: 0.5, label: "Medium" },
  { value: 0.7, label: "Strong" },
  { value: 0.9, label: "Max" },
];

export default function VoiceCleanerPage() {
  const audioPlayer = useAudioPlayer();

  const [file, setFile] = useState<File | null>(null);
  const [noiseReduction, setNoiseReduction] = useState(0.7);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VoiceCleanResult | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) {
      setFile(f);
      setResult(null);
      setError("");
    }
  }, []);

  async function handleClean() {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const data = await api.tools.voiceClean(file, noiseReduction);
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
          <Mic className="w-5 h-5 text-emerald-400" />
          Voice Cleaner
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Remove background noise, mic rumble, plosives, and hiss using spectral subtraction.
          Best for cleaning up vocal recordings and podcasts.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Drop */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("vc-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            file
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="vc-file-input"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setResult(null); setError(""); }
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-daw-text-dim">({formatSize(file.size)})</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop an audio file here or click to browse</p>
            </div>
          )}
        </div>

        {/* Noise Reduction */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Noise Reduction Strength</label>
          <div className="flex gap-1">
            {NOISE_LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setNoiseReduction(l.value)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                  noiseReduction === l.value
                    ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Process Button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleClean}
          disabled={processing || !file}
        >
          {processing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Cleaning Audio...</>
          ) : (
            <><Volume2 className="w-4 h-4" /> Clean Voice</>
          )}
        </Button>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Result */}
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
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center shrink-0 hover:from-emerald-500/40 hover:to-green-500/40 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Play className="w-5 h-5 text-emerald-400 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Cleaned Voice</span>
                  <Badge variant="green"><Check className="w-3 h-3" /> Ready</Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-daw-text-dim">
                  <span>{formatSecs(result.duration)}</span>
                  <span>{result.noise_frames} noise frames profiled</span>
                </div>
              </div>
            </div>
            <a
              href={result.url}
              download={result.filename}
              className="daw-button daw-button-primary text-xs inline-flex"
            >
              <Download className="w-3.5 h-3.5" /> Download Cleaned
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
