"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Link,
  Music,
  Play,
  Pause,
  Loader2,
  Film,
  AlertCircle,
  Check,
  ExternalLink,
  Scissors,
  Upload,
  Shrink,
  FileAudio,
  Mic,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAudioPlayer } from "@/lib/audio-player";

interface DownloadResult {
  title: string;
  artist: string;
  filename: string;
  url: string;
  duration_secs: number;
  thumbnail: string;
}

interface CompressResult {
  original_size: number;
  compressed_size: number;
  reduction_pct: number;
  filename: string;
  url: string;
  sample_rate: number;
  duration_secs: number;
}

const SAMPLE_RATES = [
  { value: 22050, label: "22 kHz" },
  { value: 16000, label: "16 kHz" },
  { value: 11025, label: "11 kHz" },
  { value: 8000, label: "8 kHz" },
];

const BIT_DEPTHS = [
  { value: 16, label: "16-bit" },
  { value: 8, label: "8-bit" },
];

interface NoteEvent {
  start_time: number;
  end_time: number;
  pitch: number;
  note_name: string;
  velocity: number;
}

interface TranscribeResult {
  notes: NoteEvent[];
  duration_secs: number;
  note_count: number;
  method: string;
}

export default function ToolsPage() {
  const [url, setUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<DownloadResult[]>([]);
  const audioPlayer = useAudioPlayer();

  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressRate, setCompressRate] = useState(22050);
  const [compressDepth, setCompressDepth] = useState(16);
  const [compressMono, setCompressMono] = useState(true);
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState("");
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

  const [transcribeFile, setTranscribeFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || f?.name.endsWith(".wav")) {
      setCompressFile(f);
      setCompressResult(null);
      setCompressError("");
    }
  }, []);

  async function handleDownload() {
    if (!url.trim()) return;
    setDownloading(true);
    setError("");
    setResult(null);

    try {
      const cleanUrl = url.trim().split("&list=")[0].split("?si=")[0];
      const res = await fetch("/api/tools/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: cleanUrl }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !data.ok) {
        setError((data && data.detail) || `Server error (${res.status})`);
        return;
      }

      if (data.title) {
        setResult(data);
        setHistory((prev) => [data, ...prev.slice(0, 9)]);
        setUrl("");
      }
    } catch {
      setError("Network error");
    }
    setDownloading(false);
  }

  async function handleCompress() {
    if (!compressFile) return;
    setCompressing(true);
    setCompressError("");
    setCompressResult(null);

    try {
      const fd = new FormData();
      fd.append("file", compressFile);
      fd.append("sample_rate", String(compressRate));
      fd.append("bit_depth", String(compressDepth));
      fd.append("to_mono", String(compressMono));

      const res = await fetch("/api/tools/compress", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setCompressError((data && data.detail) || `Server error (${res.status})`);
        return;
      }

      setCompressResult(data);
    } catch {
      setCompressError("Network error");
    }
    setCompressing(false);
  }

  async function handleTranscribe() {
    if (!transcribeFile) return;
    setTranscribing(true);
    setTranscribeError("");
    setTranscribeResult(null);

    try {
      const fd = new FormData();
      fd.append("file", transcribeFile);

      const res = await fetch("/api/tools/transcribe", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        setTranscribeError((data && data.detail) || `Server error (${res.status})`);
        return;
      }

      setTranscribeResult(data);
    } catch {
      setTranscribeError("Network error");
    }
    setTranscribing(false);
  }

  const isPlaying = result && audioPlayer.isCurrentUrl(result.url) && audioPlayer.isPlaying;
  const isPlayingCompressed = compressResult && audioPlayer.isCurrentUrl(compressResult.url) && audioPlayer.isPlaying;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Film className="w-5 h-5 text-red-400" />
          YouTube Audio Extractor
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Paste a YouTube URL to extract audio. Use it for stem separation or editing.
        </p>
      </div>

      {/* URL Input */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-daw-text-dim" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDownload()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-daw-surface-3 border border-daw-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-red-400/50 transition-colors"
            />
          </div>
          <Button onClick={handleDownload} disabled={downloading || !url.trim()} className="shrink-0">
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Extract
          </Button>
        </div>

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
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-daw-accent/30 to-daw-cyan/30 flex items-center justify-center shrink-0 hover:from-daw-accent/50 hover:to-daw-cyan/50 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-daw-text truncate">{result.title}</p>
                <p className="text-xs text-daw-text-muted">
                  {result.artist} &middot; {formatDuration(result.duration_secs)}
                </p>
              </div>
              <Badge variant="green">
                <Check className="w-3 h-3" /> Ready
              </Badge>
            </div>

            <div className="flex gap-2">
              <a
                href={result.url}
                download={result.filename}
                className="daw-button daw-button-primary text-xs"
              >
                <Download className="w-3.5 h-3.5" /> Download Audio
              </a>
              <a
                href={`/generate`}
                className="daw-button text-xs"
              >
                <Scissors className="w-3.5 h-3.5" /> Separate Stems
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-daw-text">Recent Downloads</h3>
          <div className="space-y-1.5">
            {history.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-daw-surface-3 transition-colors group"
              >
                <button
                  onClick={() => audioPlayer.toggle(item.url)}
                  className="w-8 h-8 rounded-lg bg-daw-surface-3 flex items-center justify-center shrink-0 group-hover:bg-daw-accent/20 transition-colors"
                >
                  {audioPlayer.isCurrentUrl(item.url) && audioPlayer.isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-daw-accent" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-daw-text-muted ml-0.5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-daw-text truncate">{item.title}</p>
                  <p className="text-[10px] text-daw-text-dim">{item.artist}</p>
                </div>
                <span className="text-[10px] text-daw-text-dim">
                  {formatDuration(item.duration_secs)}
                </span>
                <a
                  href={item.url}
                  download={item.filename}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5 text-daw-text-muted hover:text-daw-text" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Note Transcriber */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-violet-400" />
          Instrument Note Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Analyze a separated instrument stem (guitar, piano, bass) to detect MIDI notes with timing.
          Works best with monophonic stems. Upload WAV.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith("audio/") || f?.name.endsWith(".wav")) {
              setTranscribeFile(f);
              setTranscribeResult(null);
              setTranscribeError("");
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("transcribe-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            transcribeFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-violet-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="transcribe-file-input"
            type="file"
            accept="audio/wav,.wav,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setTranscribeFile(f);
                setTranscribeResult(null);
                setTranscribeError("");
              }
            }}
          />
          {transcribeFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{transcribeFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a stem here (guitar, bass, piano) or click to browse</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleTranscribe}
          disabled={transcribing || !transcribeFile}
        >
          {transcribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing notes...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Detect Notes
            </>
          )}
        </Button>

        {transcribeError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {transcribeError}
          </div>
        )}
      </div>

      {/* Transcribe Result */}
      <AnimatePresence>
        {transcribeResult && transcribeResult.notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-violet-400/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  <Mic className="w-3 h-3" /> {transcribeResult.note_count} notes
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatDuration(transcribeResult.duration_secs)} &middot; {transcribeResult.method.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {transcribeResult.notes.slice(0, 50).map((note, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 text-xs"
                >
                  <span className="w-14 text-daw-text-dim tabular-nums">
                    {note.start_time.toFixed(2)}s
                  </span>
                  <span className="w-10 font-mono font-bold text-daw-accent">
                    {note.note_name}
                  </span>
                  <span className="text-daw-text-dim tabular-nums">
                    MIDI {note.pitch}
                  </span>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-daw-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 to-daw-accent transition-all"
                        style={{ width: `${(note.end_time - note.start_time) * 60}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-daw-text-dim tabular-nums w-10 text-right">
                    {(note.end_time - note.start_time).toFixed(2)}s
                  </span>
                </div>
              ))}
              {transcribeResult.notes.length > 50 && (
                <p className="text-[10px] text-daw-text-dim text-center py-1">
                  +{transcribeResult.notes.length - 50} more notes
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
