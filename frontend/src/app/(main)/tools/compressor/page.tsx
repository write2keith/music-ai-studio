"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Loader2,
  AlertCircle,
  Shrink,
  FileAudio,
  Upload,
  Check,
  Play,
  Pause,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { CompressResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

const SAMPLE_RATES = [
  { value: 44100, label: "44.1k" },
  { value: 22050, label: "22k" },
  { value: 16000, label: "16k" },
  { value: 11025, label: "11k" },
  { value: 8000, label: "8k" },
];

const BIT_DEPTHS = [
  { value: 16, label: "16-bit" },
  { value: 8, label: "8-bit" },
];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CompressorPage() {
  const audioPlayer = useAudioPlayer();

  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressRate, setCompressRate] = useState(22050);
  const [compressDepth, setCompressDepth] = useState(16);
  const [compressMono, setCompressMono] = useState(true);
  const [compressFormat, setCompressFormat] = useState<"wav" | "mp3">("wav");
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState("");
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || f?.name.endsWith(".wav")) {
      setCompressFile(f);
      setCompressResult(null);
      setCompressError("");
    }
  }, []);

  async function handleCompress() {
    if (!compressFile) return;
    setCompressing(true);
    setCompressError("");
    setCompressResult(null);

    try {
      const data = await api.tools.compress(compressFile, compressRate, compressDepth, compressMono, compressFormat);
      setCompressResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCompressError(msg || "Network error");
    }
    setCompressing(false);
  }

  const isPlayingCompressed = compressResult && audioPlayer.isCurrentUrl(compressResult.url) && audioPlayer.isPlaying;

  return (
    <div className="max-w-2xl">
      {/* Audio Compressor */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Shrink className="w-5 h-5 text-amber-400" />
          Audio Compressor
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Reduce audio file size by lowering sample rate, bit depth, or converting to mono.
          Supports WAV files.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("compress-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            compressFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="compress-file-input"
            type="file"
            accept="audio/wav,.wav,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCompressFile(f);
                setCompressResult(null);
                setCompressError("");
              }
            }}
          />
          {compressFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{compressFile.name}</span>
              <span className="text-xs text-daw-text-dim">({formatSize(compressFile.size)})</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop WAV file here or click to browse</p>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Sample Rate</label>
            <div className="flex gap-1">
              {SAMPLE_RATES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setCompressRate(r.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    compressRate === r.value
                      ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Bit Depth</label>
            <div className="flex gap-1">
              {BIT_DEPTHS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setCompressDepth(d.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    compressDepth === d.value
                      ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mono Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compressMono}
            onChange={(e) => setCompressMono(e.target.checked)}
            className="w-4 h-4 rounded border-daw-border bg-daw-surface-2 accent-daw-accent"
          />
          <span className="text-xs text-daw-text-muted">Convert to mono (halves size for stereo files)</span>
        </label>

        {/* Output Format */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-daw-text-muted w-20">Format:</span>
          <div className="flex gap-1 p-0.5 rounded-lg bg-daw-surface-2">
            {(["wav", "mp3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCompressFormat(f)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                  compressFormat === f
                    ? "bg-daw-accent/20 text-daw-accent"
                    : "text-daw-text-muted hover:text-daw-text"
                )}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </label>

        {/* Compress Button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleCompress}
          disabled={compressing || !compressFile}
        >
          {compressing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Compressing...
            </>
          ) : (
            <>
              <Shrink className="w-4 h-4" />
              Compress Audio
            </>
          )}
        </Button>

        {compressError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {compressError}
          </div>
        )}
      </div>

      {/* Compress Result */}
      <AnimatePresence>
        {compressResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-daw-green/20"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => audioPlayer.toggle(compressResult.url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center shrink-0 hover:from-amber-500/40 hover:to-orange-500/40 transition-all"
              >
                {isPlayingCompressed ? (
                  <Pause className="w-5 h-5 text-amber-400" />
                ) : (
                  <Play className="w-5 h-5 text-amber-400 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Compressed Audio</span>
                  <Badge variant="green">
                    <Check className="w-3 h-3" /> Ready
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-daw-text-dim">
                  <span>{formatSize(compressResult.original_size)} &rarr; {formatSize(compressResult.compressed_size)}</span>
                  <span className="text-daw-green font-medium">-{compressResult.reduction_pct}%</span>
                  <span>{compressResult.sample_rate / 1000}kHz</span>
                  <span>{formatDuration(compressResult.duration_secs)}</span>
                </div>
              </div>
            </div>
            <a
              href={compressResult.url}
              download={compressResult.filename}
              className="daw-button daw-button-primary text-xs inline-flex"
            >
              <Download className="w-3.5 h-3.5" /> Download Compressed
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
