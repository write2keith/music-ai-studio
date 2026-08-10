"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, Square, SkipBack, ImageIcon, Film, Download, Loader2,
  AlertCircle, FileAudio, Type, ChevronDown, ChevronUp, Mic, Music,
  Wand2, Guitar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
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
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

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

  // Creation mode
  type CreationMode = "song" | "instrumental" | null;
  const [creationMode, setCreationMode] = useState<CreationMode>(null);
  const [separating, setSeparating] = useState(false);
  const [sepProgress, setSepProgress] = useState("");

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
      setAudioBuffer(null);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));

      file.arrayBuffer().then((ab) => {
        const ctx = new AudioContext();
        ctx.decodeAudioData(ab).then((buf) => {
          setAudioBuffer(buf);
          ctx.close();
        }).catch(() => ctx.close());
      });
    },
    [audioUrl],
  );

  const handleCreateFromSong = useCallback(
    async (file: File) => {
      setAudioFile(file);
      setSeparating(true);
      setSepProgress("Separating vocals...");
      setError("");
      try {
        const result = await api.tools.vocalRemove(file);
        if (!result.ok || !result.instrumental_url) {
          throw new Error("Vocal separation failed");
        }
        setSepProgress("Loading instrumental...");
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const instUrl = result.instrumental_url;
        setAudioUrl(instUrl);
        setLyricLines([]);
        setSyncWords([]);
        setSyncIndex(0);
        setAudioBuffer(null);

        const audio = new Audio(instUrl);
        audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));

        const resp = await fetch(instUrl);
        const ab = await resp.arrayBuffer();
        const ctx = new AudioContext();
        try {
          const buf = await ctx.decodeAudioData(ab);
          setAudioBuffer(buf);
        } finally {
          ctx.close();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Separation failed");
        setAudioFile(null);
      }
      setSeparating(false);
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
        {/* ── Creation Mode ── */}
        {!creationMode && !audioFile && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setCreationMode("song")}
              className="p-4 rounded-xl border border-daw-border bg-daw-surface-2/60 hover:bg-daw-surface-2 hover:border-daw-accent/40 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center mb-2 group-hover:bg-violet-500/20 transition-colors">
                <Wand2 className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-daw-text mb-0.5">From a song</h3>
              <p className="text-[10px] text-daw-text-dim leading-relaxed">
                Upload a song with vocals. We'll separate vocals, build the instrumental, and generate synced karaoke lyrics.
              </p>
            </button>
            <button
              onClick={() => setCreationMode("instrumental")}
              className="p-4 rounded-xl border border-daw-border bg-daw-surface-2/60 hover:bg-daw-surface-2 hover:border-cyan-400/40 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-2 group-hover:bg-cyan-500/20 transition-colors">
                <Guitar className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-sm font-semibold text-daw-text mb-0.5">From instrumental</h3>
              <p className="text-[10px] text-daw-text-dim leading-relaxed">
                Already have a karaoke track? Upload your instrumental and sync lyrics directly.
              </p>
            </button>
          </div>
        )}

        {creationMode && !audioFile && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-daw-text-dim">
              {creationMode === "song" ? "From a song" : "From instrumental"}
            </span>
            <button
              onClick={() => setCreationMode(null)}
              className="text-[10px] text-daw-text-dim hover:text-daw-text underline"
            >
              change
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
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
        {creationMode && (
          <div
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f && !separating) {
                creationMode === "song" ? handleCreateFromSong(f) : handleAudioLoad(f);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => !audioFile && !separating && document.getElementById("karaoke-audio-input")?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors",
              separating
                ? "border-amber-500/50 bg-amber-500/5 cursor-wait"
                : audioFile
                ? "border-daw-green/50 bg-daw-green/5"
                : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2",
            )}
          >
            <input
              id="karaoke-audio-input"
              type="file"
              accept=".wav,.mp3,.m4a,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && !separating) {
                  creationMode === "song" ? handleCreateFromSong(f) : handleAudioLoad(f);
                }
              }}
            />
            {separating ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span className="text-sm text-amber-300">{sepProgress}</span>
              </div>
            ) : audioFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileAudio className="w-4 h-4 text-daw-green" />
                <span className="text-sm">{audioFile.name}</span>
                <span className="text-xs text-daw-text-dim">{audioDuration.toFixed(1)}s</span>
              </div>
            ) : (
              <p className="text-sm text-daw-text-muted">
                <Music className="w-4 h-4 inline mr-1 opacity-40" />
                {creationMode === "song"
                  ? "Drop a song here (vocals will be separated)"
                  : "Drop an instrumental track here"}
              </p>
            )}
          </div>
        )}

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
        {audioUrl && (
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
        )}

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
        {creationMode && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold">
              Lyrics
            </label>
            <div className="flex ml-auto gap-1">
              <button
                onClick={() => { setSyncMode("tap"); setLyricLines([]); setSyncWords([]); setSyncIndex(0); }}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] transition-colors",
                  syncMode === "tap"
                    ? "bg-daw-accent/20 text-daw-accent border border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-dim border border-daw-border",
                )}
              >
                Tap Sync
              </button>
              <button
                onClick={() => { setSyncMode("manual"); setSyncWords([]); setSyncIndex(0); }}
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
            className="w-full bg-daw-surface-2 text-daw-text text-sm rounded-lg p-3 outline-none border border-daw-border resize-none placeholder:text-daw-text-dim/50 font-mono"
          />

          {syncMode === "tap" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={parseLyrics} disabled={!lyricsText.trim()}>
                  <Type className="w-3.5 h-3.5 mr-1" /> Parse Words
                </Button>
                {syncWords.length > 0 && syncIndex >= syncWords.length && (
                  <Button size="sm" variant="secondary" onClick={buildLines}>
                    Apply to Timeline
                  </Button>
                )}
              </div>

              {/* Tap sync word grid */}
              {syncWords.length > 0 && (
                <div className="p-3 rounded-lg bg-daw-surface-2 border border-daw-border">
                  {isPlaying && syncIndex < syncWords.length ? (
                    <div className="text-center py-2">
                      <div className={cn(
                        "text-2xl font-bold mb-1 transition-colors",
                        "text-daw-accent",
                      )}>
                        {syncWords[syncIndex]?.text || ""}
                      </div>
                      <p className="text-xs text-daw-text-dim mb-1">
                        Word {syncIndex + 1} of {syncWords.length}
                      </p>
                      <div className="w-full bg-daw-surface-1 rounded-full h-1.5">
                        <div
                          className="bg-daw-accent h-1.5 rounded-full transition-all duration-75"
                          style={{ width: `${((syncIndex) / syncWords.length) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-daw-accent mt-1.5 animate-pulse font-bold">
                        Tap SPACEBAR now
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
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
                                  if (e.key === "Enter" || e.key === "Escape") {
                                    if (editWordValue.trim() && e.key === "Enter") {
                                      setSyncWords((prev) => {
                                        const next = [...prev];
                                        next[i] = { ...next[i], text: editWordValue.trim() };
                                        return next;
                                      });
                                    }
                                    setEditingWordIdx(null);
                                  }
                                }}
                              />
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer select-none",
                                i < syncIndex
                                  ? "bg-daw-accent/20 text-daw-accent"
                                  : i === syncIndex && isPlaying
                                  ? "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-400/50"
                                  : "bg-daw-surface-1 text-daw-text-dim",
                              )}
                              onDoubleClick={() => {
                                setEditingWordIdx(i);
                                setEditWordValue(w.text);
                              }}
                              title="Double-click to edit"
                            >
                              {w.text}
                              {i < syncIndex && (
                                <span className="ml-0.5 text-[8px] opacity-50">{syncWords[i].start.toFixed(1)}s</span>
                              )}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-daw-text-dim">
                      {syncIndex} / {syncWords.length} synced
                    </span>
                    {syncIndex > 0 && (
                      <button
                        onClick={() => {
                          setSyncWords((prev) => {
                            const next = [...prev];
                            for (let i = syncIndex - 1; i >= 0; i--) {
                              next[i] = { ...next[i], synced: false, start: 0, end: 0 };
                            }
                            return next;
                          });
                          setSyncIndex(0);
                        }}
                        className="text-[9px] text-red-400 hover:text-red-300"
                      >
                        Reset taps
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Button
                size="sm"
                onClick={autoSync}
                disabled={!lyricsText.trim() || !audioDuration}
              >
                <Type className="w-3.5 h-3.5 mr-1" />
                Auto Distribute
              </Button>
            </div>
          )}
        </div>
        )}

        {/* ── Timeline Editor (always visible when synced) ── */}
        {lyricLines.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold">
              Timeline
              <span className="text-[9px] ml-2 normal-case tracking-normal">
                {lyricLines.reduce((sum, l) => sum + l.words.length, 0)} words
              </span>
            </div>
            <LyricTimeline
              lines={lyricLines}
              currentTime={currentTime}
              duration={audioDuration}
              isPlaying={isPlaying}
              onSeek={seekTo}
              onUpdateWord={handleUpdateWord}
              onUpdateLine={handleUpdateLine}
              audioBuffer={audioBuffer}
            />
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
              Records {CANVAS_W}x{CANVAS_H} + audio at 30fps
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
