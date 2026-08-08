"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Link,
  Loader2,
  Film,
  AlertCircle,
  Check,
  Play,
  ExternalLink,
  Pause,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAudioPlayer } from "@/lib/audio-player";
import { api } from "@/lib/api";

interface DownloadResult {
  title: string;
  artist: string;
  filename: string;
  url: string;
  duration_secs: number;
  thumbnail: string;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function YouTubePage() {
  const [url, setUrl] = useState("");
  const [youtubeMp3, setYoutubeMp3] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<DownloadResult[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const downloadStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPlayer = useAudioPlayer();

  const isPlaying = result && audioPlayer.isCurrentUrl(result.url) && audioPlayer.isPlaying;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || f?.name.endsWith(".wav")) {
      return;
    }
  }, []);

  async function handleDownload() {
    if (!url.trim()) return;
    setDownloading(true);
    setError("");
    setResult(null);
    setElapsed(0);
    downloadStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - downloadStartRef.current) / 1000));
    }, 1000);

    try {
      const cleanUrl = url.trim().split("&list=")[0].split("?si=")[0];
      const data = await api.tools.youtube(cleanUrl, youtubeMp3);

      clearInterval(timerRef.current!);
      if (data.title) {
        setResult(data);
        setHistory((prev) => [data, ...prev.slice(0, 9)]);
        setUrl("");
      }
    } catch (err) {
      clearInterval(timerRef.current!);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setDownloading(false);
  }

  return (
    <div className="max-w-2xl">
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
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {elapsed}s
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Extract
              </>
            )}
          </Button>
          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={youtubeMp3}
              onChange={(e) => setYoutubeMp3(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-daw-border bg-daw-surface-3 accent-daw-green"
            />
            <span className="text-[11px] text-daw-text-dim">MP3</span>
          </label>
        </div>

        {downloading && (
          <p className="text-[11px] text-daw-text-dim text-center animate-pulse">
            {elapsed < 5
              ? "Connecting to YouTube..."
              : elapsed < 15
              ? "Extracting audio stream..."
              : elapsed < 40
              ? "Downloading audio... still working"
              : "Still working... YouTube may be slow"}
          </p>
        )}

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
    </div>
  );
}
