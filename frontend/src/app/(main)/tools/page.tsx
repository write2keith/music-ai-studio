"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { api } from "@/lib/api";
import { PitchGraph } from "@/components/PitchGraph";

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
  const [compressFormat, setCompressFormat] = useState<"wav" | "mp3">("wav");
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState("");
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

  const [transcribeFile, setTranscribeFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMethod, setTranscribeMethod] = useState<"fft" | "polyphonic">("fft");
  const [transcribeError, setTranscribeError] = useState("");
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);

  const [vocalRefFile, setVocalRefFile] = useState<File | null>(null);
  const [vocalRecording, setVocalRecording] = useState<File | null>(null);
  const [vocalRecordingUrl, setVocalRecordingUrl] = useState<string>("");
  const [vocalRefUrl, setVocalRefUrl] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [vocalScore, setVocalScore] = useState<any>(null);
  const [vocalError, setVocalError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
      const data = await api.tools.youtube(cleanUrl);

      if (data.title) {
        setResult(data);
        setHistory((prev) => [data, ...prev.slice(0, 9)]);
        setUrl("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setDownloading(false);
  }

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

  async function handleTranscribe() {
    if (!transcribeFile) return;
    setTranscribing(true);
    setTranscribeError("");
    setTranscribeResult(null);

    try {
      const data = await api.tools.transcribe(transcribeFile, transcribeMethod);
      setTranscribeResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTranscribeError(msg || "Network error");
    }
    setTranscribing(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setVocalRecordingUrl(url);
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setVocalRecording(file);
        stream.getTracks().forEach((t) => t.stop());
      };

      setRecordTime(0);
      timerRef.current = setInterval(() => {
        setRecordTime((t) => t + 1);
      }, 1000);

      recorder.start();
      setIsRecording(true);
    } catch {
      setVocalError("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleVocalScore() {
    if (!vocalRefFile || !vocalRecording) return;
    setScoring(true);
    setVocalError("");
    setVocalScore(null);

    try {
      const data = await api.tools.vocalScore(vocalRefFile, vocalRecording);
      setVocalScore(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVocalError(msg || "Scoring failed");
    }
    setScoring(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (vocalRecordingUrl) URL.revokeObjectURL(vocalRecordingUrl);
      if (vocalRefUrl) URL.revokeObjectURL(vocalRefUrl);
    };
  }, [vocalRecordingUrl, vocalRefUrl]);

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

      {/* Note Transcriber */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-violet-400" />
          Instrument Note Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Analyze an instrument stem to detect MIDI notes with timing.
          FFT for single-note lines, Polyphonic for chords. Supports WAV, MP3, M4A, FLAC, OGG.
        </p>

        <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-daw-surface-2 w-fit">
          {(["fft", "polyphonic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setTranscribeMethod(m);
                setTranscribeResult(null);
                setTranscribeError("");
              }}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                transcribeMethod === m
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-daw-text-muted hover:text-daw-text"
              )}
            >
              {m === "fft" ? "Mono (FFT)" : "Polyphonic"}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith("audio/") || /\.(wav|mp3|m4a|flac|ogg)$/i.test(f.name)) {
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
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
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

      {/* Vocal Coach */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-rose-400" />
          Vocal Coach
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Upload a reference vocal track, record yourself singing, then compare pitch accuracy.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* Reference Upload */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">1. Upload reference vocals (separated vocal stem)</p>
          <div
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) {
                setVocalRefFile(f);
                setVocalRefUrl(URL.createObjectURL(f));
                setVocalScore(null);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("vocal-ref-input")?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
              vocalRefFile
                ? "border-daw-green/50 bg-daw-green/5"
                : "border-daw-border hover:border-rose-400/40 hover:bg-daw-surface-2"
            )}
          >
            <input
              id="vocal-ref-input"
              type="file"
              accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setVocalRefFile(f);
                  setVocalRefUrl(URL.createObjectURL(f));
                  setVocalScore(null);
                }
              }}
            />
            {vocalRefFile ? (
              <div className="flex items-center justify-center gap-2 text-daw-green text-sm">
                <FileAudio className="w-4 h-4" />
                {vocalRefFile.name}
                {vocalRefUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); audioPlayer.play(vocalRefUrl); }}
                    className="p-1 rounded hover:bg-daw-surface-2"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-daw-text-muted">Drop reference vocal stem here</p>
            )}
          </div>
        </div>

        {/* Recording */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">2. Record your voice</p>
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                disabled={!!vocalRecording}
                className="flex items-center gap-2"
                variant="secondary"
              >
                <div className="w-3 h-3 rounded-full bg-red-500" />
                {vocalRecording ? "Recorded" : "Start Recording"}
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                className="flex items-center gap-2"
                variant="secondary"
              >
                <div className="w-3 h-3 rounded-sm bg-red-500 animate-pulse" />
                Stop ({recordTime}s)
              </Button>
            )}
            {vocalRecording && (
              <>
                <button
                  onClick={() => audioPlayer.play(vocalRecordingUrl)}
                  className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors"
                >
                  <Play className="w-4 h-4" />
                </button>
                <span className="text-xs text-daw-text-dim">
                  {vocalRecording.size > 0 ? formatSize(vocalRecording.size) : ""}
                </span>
                <button
                  onClick={() => {
                    setVocalRecording(null);
                    setVocalRecordingUrl("");
                  }}
                  className="text-xs text-daw-text-dim hover:text-daw-text"
                >
                  re-record
                </button>
              </>
            )}
          </div>
        </div>

        {/* Score Button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleVocalScore}
          disabled={scoring || !vocalRefFile || !vocalRecording}
        >
          {scoring ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing pitch...
            </>
          ) : (
            "Score My Performance"
          )}
        </Button>

        {vocalError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {vocalError}
          </div>
        )}

        {/* Score Result */}
        <AnimatePresence>
          {vocalScore && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2a2a3e" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke={vocalScore.score >= 85 ? "#22c55e" : vocalScore.score >= 55 ? "#eab308" : "#ef4444"}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(vocalScore.score / 100) * 97.4} 97.4`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-daw-text">{vocalScore.score}</span>
                    <span className="text-[10px] text-daw-text-dim">/100</span>
                  </div>
                </div>
                <div>
                  <div className={cn(
                    "text-2xl font-bold",
                    vocalScore.grade === "S" || vocalScore.grade === "A" ? "text-green-400" :
                    vocalScore.grade === "B" || vocalScore.grade === "C" ? "text-yellow-400" : "text-red-400"
                  )}>
                    Grade {vocalScore.grade}
                  </div>
                  <p className="text-xs text-daw-text-dim">
                    {vocalScore.matched_frames}/{vocalScore.total_frames} frames in pitch
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-daw-border overflow-hidden">
                <PitchGraph
                  refPitch={vocalScore.ref_pitch}
                  userPitch={vocalScore.user_pitch}
                  width={568}
                  height={200}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
