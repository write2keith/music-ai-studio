"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Square, SkipBack, ImageIcon, Film, Download, Loader2,
  AlertCircle, FileAudio, Type, ChevronDown, ChevronUp, Mic, Music,
  Edit3, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  KaraokeCanvas,
  formatTime,
  type LyricLine,
} from "@/components/studio/KaraokeCanvas";
import { LyricTimeline } from "@/components/studio/LyricTimeline";

const BG_COLORS = [
  { label: "Dark", value: "#0f0f23" },
  { label: "Midnight", value: "#1a1a2e" },
  { label: "Slate", value: "#1e293b" },
  { label: "Violet", value: "#2d1b69" },
  { label: "Black", value: "#000000" },
  { label: "Gradient", value: "linear" },
];

type SyncMode = "tap" | "manual";

interface SyncWord {
  text: string;
  start: number;
  end: number;
  synced: boolean;
}

const CANVAS_W = 640;
const CANVAS_H = 360;

export default function KaraokePage() {
  // Audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animRef = useRef<number>(0);

  // Time tracking (higher precision than timeupdate event)
  const rafTimeRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Lyrics
  const [lyricsText, setLyricsText] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("tap");
  const [syncWords, setSyncWords] = useState<SyncWord[]>([]);
  const [syncIndex, setSyncIndex] = useState(0);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);

  // Background
  const [bgColor, setBgColor] = useState("#0f0f23");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgVideo, setBgVideo] = useState<HTMLVideoElement | null>(null);
  const [bgType, setBgType] = useState<"color" | "image" | "video">("color");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // UI panels
  const [bgPanelOpen, setBgPanelOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState("");
  const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null);
  const [editWordValue, setEditWordValue] = useState("");

  // Sync with isPlaying ref
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // ── High-precision time tracking via RAF ──
  useEffect(() => {
    if (!isPlaying || !audioRef.current) return;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const t = audio.currentTime;
      setCurrentTime(t);
      if (!audio.paused) {
        rafTimeRef.current = requestAnimationFrame(tick);
      }
    };
    rafTimeRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafTimeRef.current) cancelAnimationFrame(rafTimeRef.current);
    };
  }, [isPlaying]);

  // ── Background video sync ──
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.play().catch(() => {});
      vid.currentTime = audioRef.current?.currentTime ?? 0;
    } else {
      vid.pause();
    }
  }, [isPlaying]);

  // ── Audio load ──
  const handleAudioLoad = useCallback(
    (file: File) => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(file);
      setAudioFile(file);
      setAudioUrl(url);
      setLyricLines([]);
      setSyncWords([]);
      setSyncIndex(0);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));
    },
    [audioUrl],
  );

  // ── Background handlers ──
  const handleBgImage = useCallback((file: File) => {
    const img = new window.Image();
    img.onload = () => {
      setBgImage(img);
      imgRef.current = img;
      setBgType("image");
      setBgColor("#0f0f23");
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const handleBgVideo = useCallback((file: File) => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.play().catch(() => {});
    videoRef.current = vid;
    setBgVideo(vid);
    setBgType("video");
    setBgColor("#000000");
  }, []);

  const handleBgColor = useCallback((color: string) => {
    setBgColor(color);
    setBgImage(null);
    imgRef.current = null;
    setBgType("color");
  }, []);

  // ── Playback controls ──
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(audioDuration, time));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, [audioDuration]);

  // ── Lyrics: parse + sync ──
  const parseLyrics = useCallback(() => {
    if (!lyricsText.trim()) return;
    const rawLines = lyricsText.split("\n");
    const words: SyncWord[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const lineWords = trimmed.split(/\s+/).filter((w) => w.length > 0);
      for (const w of lineWords) {
        words.push({ text: w, start: 0, end: 0, synced: false });
      }
    }
    setSyncWords(words);
    setSyncIndex(0);
    setLyricLines([]);
    setEditingWordIdx(null);
  }, [lyricsText]);

  const handleTap = useCallback(() => {
    if (syncIndex >= syncWords.length) return;
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setSyncWords((prev) => {
      const next = [...prev];
      next[syncIndex] = { ...next[syncIndex], start: t, synced: true };
      if (syncIndex > 0) {
        next[syncIndex - 1] = { ...next[syncIndex - 1], end: t };
      }
      return next;
    });
    if (syncIndex >= syncWords.length - 1) {
      setSyncWords((prev) => {
        const next = [...prev];
        next[prev.length - 1] = { ...next[prev.length - 1], end: audioDuration };
        return next;
      });
    }
    setSyncIndex((i) => i + 1);
  }, [syncIndex, syncWords, audioDuration]);

  // Build LyricLine[] from sync words, respecting original line breaks
  const buildLines = useCallback(() => {
    const rawLines = lyricsText.trim().split("\n").filter((l) => l.trim());
    const lines: LyricLine[] = [];

    let wordIdx = 0;
    for (const rawLine of rawLines) {
      const lineWords = rawLine.trim().split(/\s+/);
      const words: LyricLine["words"] = [];
      let lineStart = Infinity;
      let lineEnd = 0;

      for (let j = 0; j < lineWords.length && wordIdx < syncWords.length; j++) {
        const sw = syncWords[wordIdx];
        words.push({ text: sw.text, start: sw.start, end: sw.end });
        lineStart = Math.min(lineStart, sw.start);
        lineEnd = Math.max(lineEnd, sw.end);
        wordIdx++;
      }

      if (words.length > 0) {
        lines.push({ words, start: lineStart, end: lineEnd });
      }
    }

    setLyricLines(lines);
  }, [syncWords, lyricsText]);

  // Auto sync: equal time division weighted by word length
  const autoSync = useCallback(() => {
    if (!lyricsText.trim() || !audioDuration) return;
    const rawLines = lyricsText.split("\n").filter((l) => l.trim());
    if (rawLines.length === 0) return;

    const rawCharCounts = rawLines.map((l) => l.trim().length);
    const totalChars = rawCharCounts.reduce((a, b) => a + b, 0) || 1;

    let cursor = 0;
    const lines: LyricLine[] = [];

    for (let li = 0; li < rawLines.length; li++) {
      const rawChars = rawCharCounts[li];
      const lineDur = (rawChars / totalChars) * audioDuration;
      const lineStart = cursor;
      const lineEnd = cursor + lineDur;
      cursor = lineEnd;

      const wordTokens = rawLines[li].trim().split(/\s+/).filter((w) => w.length > 0);
      if (wordTokens.length === 0) continue;

      const wordChars = wordTokens.map((w) => w.length);
      const totalWordChars = wordChars.reduce((a, b) => a + b, 0) || 1;

      let wordCursor = lineStart;
      const words: LyricLine["words"] = [];

      for (let wi = 0; wi < wordTokens.length; wi++) {
        const wDur = (wordChars[wi] / totalWordChars) * lineDur;
        words.push({
          text: wordTokens[wi],
          start: wordCursor,
          end: wordCursor + wDur,
        });
        wordCursor += wDur;
      }

      lines.push({ words, start: lineStart, end: lineEnd });
    }

    setLyricLines(lines);
  }, [lyricsText, audioDuration]);

  // ── Timeline editing callbacks ──
  const handleUpdateWord = useCallback(
    (lineIdx: number, wordIdx: number, field: "start" | "end" | "text", value: number | string) => {
      setLyricLines((prev) => {
        const next = [...prev];
        if (next[lineIdx] && next[lineIdx].words[wordIdx]) {
          const words = [...next[lineIdx].words];
          if (field === "text") {
            words[wordIdx] = { ...words[wordIdx], text: value as string };
          } else {
            words[wordIdx] = { ...words[wordIdx], [field]: value as number };
          }
          next[lineIdx] = { ...next[lineIdx], words };
        }
        return next;
      });
    },
    [],
  );

  const handleUpdateLine = useCallback(
    (lineIdx: number, field: "start" | "end", value: number) => {
      setLyricLines((prev) => {
        const next = [...prev];
        if (next[lineIdx]) {
          next[lineIdx] = { ...next[lineIdx], [field]: value };
        }
        return next;
      });
    },
    [],
  );

  // ── Keyboard handler for tap sync ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && syncMode === "tap" && syncWords.length > 0 && isPlaying) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [syncMode, syncWords, isPlaying, handleTap]);

  // ── Export video ──
  const exportVideo = useCallback(async () => {
    if (!audioUrl || lyricLines.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    setError("");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d")!;

      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      const mediaEl = document.createElement("audio");
      mediaEl.src = audioUrl;
      const source = audioCtx.createMediaElementSource(mediaEl);
      source.connect(audioCtx.destination);
      source.connect(dest);

      const stream = canvas.captureStream(30);
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `karaoke-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        canvas.remove();
        audioCtx.close();
        setExporting(false);
        setExportProgress(100);
      };

      const totalFrames = Math.ceil(audioDuration * 30);
      const FONT = "'Inter', system-ui, -apple-system, sans-serif";

      let frame = 0;

      const drawExportFrame = () => {
        if (frame >= totalFrames) {
          recorder.stop();
          return;
        }
        const t = frame / 30;

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        if (bgImage) {
          const scale = Math.max(CANVAS_W / bgImage.width, CANVAS_H / bgImage.height);
          const sw = CANVAS_W / scale;
          const sh = CANVAS_H / scale;
          ctx.drawImage(
            bgImage,
            (bgImage.width - sw) / 2,
            (bgImage.height - sh) / 2,
            sw, sh,
            0, 0,
            CANVAS_W, CANVAS_H,
          );
        }
        if (bgColor === "linear") {
          const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
          grad.addColorStop(0, "#1a1a2e");
          grad.addColorStop(0.5, "#2d1b69");
          grad.addColorStop(1, "#0f0f23");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }

        // Overlay
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Lyrics
        let activeIdx = -1;
        for (let i = 0; i < lyricLines.length; i++) {
          if (t >= lyricLines[i].start && t <= lyricLines[i].end) {
            activeIdx = i;
            break;
          }
        }

        const vs = Math.max(0, activeIdx - 2);
        const ve = Math.min(lyricLines.length, vs + 5);
        const visible = lyricLines.slice(vs, ve);
        const cy = CANVAS_H / 2;

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        visible.forEach((line, vi) => {
          const li = vs + vi;
          const isActive = li === activeIdx;
          const y = cy + (vi - 1.5) * 52;

          if (line.words.length === 0) return;

          ctx.font = `bold 28px ${FONT}`;
          const wordWidths = line.words.map((w) => ctx.measureText(w.text).width);
          let totalW = wordWidths.reduce((a, b) => a + b, 0);
          totalW += (line.words.length - 1) * ctx.measureText(" ").width;
          let x = CANVAS_W / 2 - totalW / 2;

          for (let wi = 0; wi < line.words.length; wi++) {
            const word = line.words[wi];
            const wW = wordWidths[wi];
            const spaceW = wi < line.words.length - 1 ? ctx.measureText(" ").width : 0;
            const wordDur = word.end - word.start;
            const wordProgress = wordDur > 0
              ? Math.max(0, Math.min(1, (t - word.start) / wordDur))
              : (t >= word.start ? 1 : 0);

            if (li < activeIdx) {
              ctx.fillStyle = "rgba(168,85,247,0.6)";
              ctx.fillText(word.text, x, y);
            } else if (li > activeIdx) {
              ctx.fillStyle = "rgba(148,163,184,0.2)";
              ctx.fillText(word.text, x, y);
            } else if (wordProgress >= 1) {
              ctx.fillStyle = "#a855f7";
              ctx.fillText(word.text, x, y);
            } else if (wordProgress > 0) {
              const sungW = wW * wordProgress;
              // Sung portion
              ctx.save();
              ctx.beginPath();
              ctx.rect(x, cy + (vi - 1.5) * 52 - 28, sungW, 56);
              ctx.clip();
              ctx.fillStyle = "#a855f7";
              ctx.fillText(word.text, x, y);
              ctx.restore();
              // Unsung portion
              ctx.save();
              ctx.beginPath();
              ctx.rect(x + sungW, cy + (vi - 1.5) * 52 - 28, wW * (1 - wordProgress) + 2, 56);
              ctx.clip();
              ctx.fillStyle = "#22d3ee";
              ctx.fillText(word.text, x, y);
              ctx.restore();
            } else {
              ctx.fillStyle = "rgba(148,163,184,0.35)";
              ctx.fillText(word.text, x, y);
            }

            x += wW + spaceW;
          }
        });

        ctx.textBaseline = "alphabetic";

        setExportProgress(Math.round((frame / totalFrames) * 100));
        frame++;
        requestAnimationFrame(drawExportFrame);
      };

      mediaEl.play();
      drawExportFrame();
      recorder.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setExporting(false);
    }
  }, [audioUrl, lyricLines, bgColor, bgImage]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      videoRef.current?.pause();
    };
  }, [audioUrl]);

  return (
    <div className="max-w-3xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-cyan-400" />
          Karaoke Video Generator
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Sync lyrics to audio, preview in real-time, and export as a karaoke video.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-3">
        {/* ── Background Selector ── */}
        <div>
          <button
            onClick={() => setBgPanelOpen(!bgPanelOpen)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold hover:text-daw-text transition-colors w-full"
          >
            {bgPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Background
            <span className="text-[9px] text-daw-text-dim ml-2 normal-case tracking-normal">
              {bgType === "color" ? "solid color" : bgType === "image" ? "image" : "video"}
            </span>
          </button>
          {bgPanelOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 flex items-center gap-2 flex-wrap overflow-hidden"
            >
              <div className="flex gap-1">
                {BG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handleBgColor(c.value)}
                    className={cn(
                      "w-6 h-6 rounded border-2 transition-colors relative overflow-hidden",
                      bgColor === c.value && bgType === "color" ? "border-daw-accent" : "border-transparent",
                    )}
                    style={
                      c.value === "linear"
                        ? { background: "linear-gradient(135deg, #1a1a2e, #2d1b69, #0f0f23)" }
                        : { backgroundColor: c.value }
                    }
                    title={c.label}
                  />
                ))}
              </div>
              <div className="w-px h-6 bg-daw-border" />
              <button
                onClick={() => document.getElementById("bg-image-input")?.click()}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  bgType === "image"
                    ? "bg-daw-accent/20 text-daw-accent"
                    : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text",
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Image
              </button>
              <button
                onClick={() => document.getElementById("bg-video-input")?.click()}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  bgType === "video"
                    ? "bg-daw-accent/20 text-daw-accent"
                    : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text",
                )}
              >
                <Film className="w-3.5 h-3.5" /> Video
              </button>
              <input
                id="bg-image-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBgImage(f);
                }}
              />
              <input
                id="bg-video-input"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBgVideo(f);
                }}
              />
            </motion.div>
          )}
        </div>

        {/* ── Audio Upload ── */}
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleAudioLoad(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !audioFile && document.getElementById("karaoke-audio-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors",
            audioFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2",
          )}
        >
          <input
            id="karaoke-audio-input"
            type="file"
            accept=".wav,.mp3,.m4a,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAudioLoad(f);
            }}
          />
          {audioFile ? (
            <div className="flex items-center justify-center gap-2">
              <FileAudio className="w-4 h-4 text-daw-green" />
              <span className="text-sm">{audioFile.name}</span>
              <span className="text-xs text-daw-text-dim">{audioDuration.toFixed(1)}s</span>
            </div>
          ) : (
            <p className="text-sm text-daw-text-muted">
              <Music className="w-4 h-4 inline mr-1 opacity-40" />
              Drop an instrumental track here
            </p>
          )}
        </div>

        {/* Hidden audio element */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => { setIsPlaying(false); }}
            onPause={() => { setIsPlaying(false); }}
            className="hidden"
            preload="auto"
          />
        )}

        {/* ── Live Preview Canvas ── */}
        <div className="rounded-lg overflow-hidden border border-daw-border bg-black">
          <KaraokeCanvas
            lines={lyricLines}
            currentTime={isPlaying ? currentTime : 0}
            backgroundImage={imgRef.current}
            backgroundVideo={videoRef.current}
            backgroundColor={bgColor === "linear" ? "#0f0f23" : bgColor}
            width={CANVAS_W}
            height={CANVAS_H}
            isRecording={false}
            isPlaying={isPlaying}
            titleText={audioFile ? audioFile.name : undefined}
            className="w-full"
          />
        </div>

        {/* ── Audio Transport ── */}
        {audioUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={stopPlayback}
              className="p-1.5 rounded bg-daw-surface-2 text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              className={cn(
                "p-2 rounded-full transition-colors",
                isPlaying
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "bg-daw-accent/20 text-daw-accent border border-daw-accent/30",
              )}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={() => seekTo(0)}
              className="p-1.5 rounded hover:bg-daw-surface-2 text-daw-text-dim transition-colors"
              title="Restart"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={0}
              max={audioDuration || 1}
              step={0.05}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full accent-daw-accent cursor-pointer"
            />
            <span className="text-[10px] text-daw-text-dim font-mono w-16 text-right tabular-nums">
              {formatTime(currentTime)}
            </span>
          </div>
        )}

        {/* ── Lyrics Input + Sync ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold">
              Lyrics
            </label>
            <div className="flex gap-1">
              <button
                onClick={() => setSyncMode("tap")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] transition-colors",
                  syncMode === "tap"
                    ? "bg-daw-accent/20 text-daw-accent border border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-dim border border-daw-border",
                )}
              >
                Tap Sync (spacebar)
              </button>
              <button
                onClick={() => setSyncMode("manual")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] transition-colors",
                  syncMode === "manual"
                    ? "bg-daw-accent/20 text-daw-accent border border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-dim border border-daw-border",
                )}
              >
                Auto Split
              </button>
            </div>
          </div>

          <textarea
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder="Paste lyrics here, one line per phrase..."
            rows={4}
            className="w-full bg-daw-surface-2 text-daw-text text-sm rounded-lg p-3 outline-none border border-daw-border resize-none placeholder:text-daw-text-dim/50"
          />

          <div className="flex gap-2">
            {syncMode === "tap" ? (
              <>
                <Button
                  size="sm"
                  onClick={parseLyrics}
                  disabled={!lyricsText.trim()}
                >
                  <Type className="w-3.5 h-3.5 mr-1" />
                  Parse Lyrics
                </Button>
                {syncWords.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={buildLines}
                    disabled={syncWords.filter((w) => w.synced).length === 0}
                  >
                    Build Timeline
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                onClick={autoSync}
                disabled={!lyricsText.trim() || !audioDuration}
              >
                <Type className="w-3.5 h-3.5 mr-1" />
                Auto Sync
              </Button>
            )}
          </div>

          {/* Tap sync visual feedback */}
          <AnimatePresence>
            {syncMode === "tap" && syncWords.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-2 rounded-lg bg-daw-surface-2 border border-daw-border max-h-36 overflow-y-auto">
                  <div className="flex flex-wrap gap-1">
                    {syncWords.map((w, i) => (
                      <span key={i} className="contents">
                        {editingWordIdx === i ? (
                          <span className="inline-flex items-center gap-0.5">
                            <input
                              type="text"
                              value={editWordValue}
                              onChange={(e) => setEditWordValue(e.target.value)}
                              className="w-16 bg-daw-surface-1 text-daw-text text-[10px] rounded px-1 py-0.5 outline-none border border-daw-accent/30"
                              autoFocus
                              onBlur={() => {
                                if (editWordValue.trim()) {
                                  setSyncWords((prev) => {
                                    const next = [...prev];
                                    next[i] = { ...next[i], text: editWordValue.trim() };
                                    return next;
                                  });
                                }
                                setEditingWordIdx(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editWordValue.trim()) {
                                    setSyncWords((prev) => {
                                      const next = [...prev];
                                      next[i] = { ...next[i], text: editWordValue.trim() };
                                      return next;
                                    });
                                  }
                                  setEditingWordIdx(null);
                                }
                                if (e.key === "Escape") setEditingWordIdx(null);
                              }}
                            />
                            <Check className="w-3 h-3 text-daw-green" />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer select-none",
                              w.synced
                                ? "bg-daw-accent/20 text-daw-accent hover:bg-daw-accent/30"
                                : "bg-daw-surface-1 text-daw-text-dim hover:bg-daw-surface-3",
                              i === syncIndex && "ring-1 ring-daw-accent scale-110",
                            )}
                            onDoubleClick={() => {
                              setEditingWordIdx(i);
                              setEditWordValue(w.text);
                            }}
                            title="Double-click to edit"
                          >
                            {w.text}
                            {w.synced && (
                              <span className="ml-0.5 text-[8px] opacity-50">{w.start.toFixed(1)}s</span>
                            )}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  {isPlaying && syncIndex < syncWords.length && (
                    <p className="text-[10px] text-daw-accent mt-1.5 animate-pulse">
                      Tap SPACEBAR on each word ({syncIndex + 1}/{syncWords.length})
                    </p>
                  )}
                  {syncIndex >= syncWords.length && (
                    <p className="text-[10px] text-daw-green mt-1.5">
                      All words synced. Click "Build Timeline" above.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Timeline Drawer ── */}
        {lyricLines.length > 0 && (
          <div>
            <button
              onClick={() => setTimelineOpen(!timelineOpen)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold hover:text-daw-text transition-colors w-full"
            >
              {timelineOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Timeline Editor
              <span className="text-[9px] text-daw-text-dim ml-2 normal-case tracking-normal">
                {lyricLines.reduce((sum, l) => sum + l.words.length, 0)} words
              </span>
            </button>
            {timelineOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 overflow-hidden"
              >
                <LyricTimeline
                  lines={lyricLines}
                  currentTime={currentTime}
                  duration={audioDuration}
                  isPlaying={isPlaying}
                  onSeek={seekTo}
                  onUpdateWord={handleUpdateWord}
                  onUpdateLine={handleUpdateLine}
                />
              </motion.div>
            )}
          </div>
        )}

        {/* ── Export ── */}
        {lyricLines.length > 0 && (
          <div>
            <Button
              size="lg"
              className="w-full"
              onClick={exportVideo}
              disabled={exporting || !audioUrl}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Exporting {exportProgress}%
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Karaoke Video (WebM)
                </>
              )}
            </Button>
            <p className="text-[9px] text-daw-text-dim mt-1 text-center">
              Records {CANVAS_W}x{CANVAS_H} canvas + audio at 30fps via MediaRecorder API
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
