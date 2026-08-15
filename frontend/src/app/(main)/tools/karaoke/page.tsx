"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Square, SkipBack, ImageIcon, Film, Download, Loader2,
  AlertCircle, FileAudio, Type, ChevronRight, ChevronLeft, Mic, Music,
  Wand2, Guitar, Check, RefreshCw, Sparkles, Sliders, Layers
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

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function KaraokePage() {
  // Wizard Step (1: Track, 2: Lyrics & Design, 3: Sync & Fine-tune, 4: Preview & Export)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // Time tracking
  const rafTimeRef = useRef(0);

  // Lyrics
  const [lyricsText, setLyricsText] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("tap");
  const [syncWords, setSyncWords] = useState<SyncWord[]>([]);
  const [syncIndex, setSyncIndex] = useState(0);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);

  // Background & Theme
  const [bgColor, setBgColor] = useState("#0f0f23");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgVideo, setBgVideo] = useState<HTMLVideoElement | null>(null);
  const [bgType, setBgType] = useState<"color" | "image" | "video">("color");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Creation mode
  type CreationMode = "song" | "instrumental" | "youtube";
  const [creationMode, setCreationMode] = useState<CreationMode>("song");
  const [separating, setSeparating] = useState(false);
  const [sepProgress, setSepProgress] = useState("");
  const [autoTranscribing, setAutoTranscribing] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytLoading, setYtLoading] = useState(false);

  // Export & Editing State
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResolution, setExportResolution] = useState<"1080p" | "720p">("1080p");
  const [error, setError] = useState("");
  const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null);
  const [editWordValue, setEditWordValue] = useState("");

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
      setSepProgress("Separating vocals from song...");
      setError("");
      try {
        const result = await api.tools.vocalRemove(file);
        if (!result.ok || !result.instrumental_url) {
          throw new Error("Vocal separation failed");
        }

        // Poll until separation job completes
        if (result.job_id) {
          for (let i = 0; i < 1200; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const status = await api.tools.vocalRemoveStatus(result.job_id);
              if (status.status === "completed") break;
              if (status.status === "failed") throw new Error("Separation job failed");
              const progressPct = Math.min(99, Math.round((i / 90) * 100));
              setSepProgress(`Separating vocals... (${progressPct}%)`);
            } catch (e) {
              if (e instanceof Error && e.message.includes("failed")) throw e;
            }
          }
        }

        setSepProgress("Loading separated instrumental...");
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
        if (ab.byteLength === 0) throw new Error("Empty audio data received");

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

  const handleYoutubeDownload = useCallback(
    async (urlToFetch: string) => {
      if (!urlToFetch.trim()) return;
      setYtLoading(true);
      setError("");
      try {
        const result = await api.tools.youtube(urlToFetch.trim(), false);
        if (!result.ok || !result.url) {
          throw new Error("YouTube download failed");
        }
        const audioFetchUrl = result.url.startsWith("http")
          ? result.url
          : `${process.env.NEXT_PUBLIC_API_URL || ""}${result.url}`;
        const resp = await fetch(audioFetchUrl);
        const blob = await resp.blob();
        const downloadedFile = new File([blob], `${result.title || "youtube"}.m4a`, { type: blob.type || "audio/m4a" });
        await handleCreateFromSong(downloadedFile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "YouTube download failed");
      } finally {
        setYtLoading(false);
      }
    },
    [handleCreateFromSong],
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

  // Build LyricLine[] automatically from synced words
  const buildLinesFromSyncWords = useCallback((updatedSyncWords: SyncWord[]) => {
    const rawLines = lyricsText.trim().split("\n").filter((l) => l.trim());
    const lines: LyricLine[] = [];

    let wordIdx = 0;
    for (const rawLine of rawLines) {
      const lineWords = rawLine.trim().split(/\s+/);
      const words: LyricLine["words"] = [];
      let lineStart = Infinity;
      let lineEnd = 0;

      for (let j = 0; j < lineWords.length && wordIdx < updatedSyncWords.length; j++) {
        const sw = updatedSyncWords[wordIdx];
        if (sw.synced || sw.start > 0 || sw.end > 0) {
          words.push({ text: sw.text, start: sw.start, end: sw.end });
          lineStart = Math.min(lineStart, sw.start);
          lineEnd = Math.max(lineEnd, sw.end);
        }
        wordIdx++;
      }

      if (words.length > 0) {
        lines.push({ words, start: isFinite(lineStart) ? lineStart : 0, end: lineEnd });
      }
    }

    setLyricLines(lines);
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
      if (syncIndex >= syncWords.length - 1) {
        next[next.length - 1] = { ...next[next.length - 1], end: Math.max(t + 1, audioDuration) };
      }
      buildLinesFromSyncWords(next);
      return next;
    });

    setSyncIndex((i) => i + 1);
  }, [syncIndex, syncWords, audioDuration, buildLinesFromSyncWords]);

  // Auto sync: equal time division weighted by word length
  const autoSync = useCallback(() => {
    if (!lyricsText.trim() || !audioDuration) return;
    const rawLines = lyricsText.split("\n").filter((l) => l.trim());
    if (rawLines.length === 0) return;

    const rawCharCounts = rawLines.map((l) => l.trim().length);
    const totalChars = rawCharCounts.reduce((a, b) => a + b, 0) || 1;

    let cursor = 0;
    const lines: LyricLine[] = [];
    const generatedSyncWords: SyncWord[] = [];

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
        const wStart = wordCursor;
        const wEnd = wordCursor + wDur;
        words.push({ text: wordTokens[wi], start: wStart, end: wEnd });
        generatedSyncWords.push({ text: wordTokens[wi], start: wStart, end: wEnd, synced: true });
        wordCursor += wDur;
      }

      lines.push({ words, start: lineStart, end: lineEnd });
    }

    setSyncWords(generatedSyncWords);
    setSyncIndex(generatedSyncWords.length);
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

  // ── Syllable / Line End Trigger (inspired by KaddaOKTools) ──
  const handleLineEndTap = useCallback(() => {
    if (syncIndex === 0 || syncIndex > syncWords.length) return;
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;

    setSyncWords((prev) => {
      const next = [...prev];
      if (syncIndex > 0 && next[syncIndex - 1]) {
        next[syncIndex - 1] = { ...next[syncIndex - 1], end: t };
      }
      buildLinesFromSyncWords(next);
      return next;
    });
  }, [syncIndex, syncWords.length, buildLinesFromSyncWords]);

  // ── Keyboard handler for tap sync ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (syncMode === "tap" && syncWords.length > 0 && isPlaying && currentStep === 3) {
        if (e.code === "Space" || e.code === "ArrowRight") {
          e.preventDefault();
          handleTap();
        } else if (e.code === "ArrowDown" || e.code === "KeyE") {
          e.preventDefault();
          handleLineEndTap();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [syncMode, syncWords, isPlaying, handleTap, handleLineEndTap, currentStep]);


  // ── Export video ──
  const exportVideo = useCallback(async () => {
    if (!audioUrl || lyricLines.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    setError("");

    const targetW = exportResolution === "1080p" ? 1920 : 1280;
    const targetH = exportResolution === "1080p" ? 1080 : 720;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
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
      const isMp4 = MediaRecorder.isTypeSupported("video/mp4");
      const mimeType = isMp4 ? "video/mp4" : (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm");
      const fileExt = isMp4 ? "mp4" : "webm";
      const blobType = isMp4 ? "video/mp4" : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: blobType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `karaoke-${exportResolution}-${Date.now()}.${fileExt}`;
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

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetW, targetH);

        if (bgImage) {
          const scale = Math.max(targetW / bgImage.width, targetH / bgImage.height);
          const sw = targetW / scale;
          const sh = targetH / scale;
          ctx.drawImage(
            bgImage,
            (bgImage.width - sw) / 2,
            (bgImage.height - sh) / 2,
            sw, sh,
            0, 0,
            targetW, targetH,
          );
        }
        if (bgColor === "linear") {
          const grad = ctx.createLinearGradient(0, 0, targetW, targetH);
          grad.addColorStop(0, "#1a1a2e");
          grad.addColorStop(0.5, "#2d1b69");
          grad.addColorStop(1, "#0f0f23");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, targetW, targetH);
        }

        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, targetW, targetH);

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
        const cy = targetH / 2;

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        visible.forEach((line, vi) => {
          const li = vs + vi;
          const y = cy + (vi - 1.5) * (targetH * 0.052);

          if (line.words.length === 0) return;

          ctx.font = `bold ${Math.round(targetH * 0.028)}px ${FONT}`;
          const wordWidths = line.words.map((w) => ctx.measureText(w.text).width);
          let totalW = wordWidths.reduce((a, b) => a + b, 0);
          totalW += (line.words.length - 1) * ctx.measureText(" ").width;
          let x = targetW / 2 - totalW / 2;

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
              ctx.save();
              ctx.beginPath();
              ctx.rect(x, y - 28, sungW, 56);
              ctx.clip();
              ctx.fillStyle = "#a855f7";
              ctx.fillText(word.text, x, y);
              ctx.restore();
              ctx.save();
              ctx.beginPath();
              ctx.rect(x + sungW, y - 28, wW * (1 - wordProgress) + 2, 56);
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
  }, [audioUrl, lyricLines, bgColor, bgImage, audioDuration, exportResolution]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      videoRef.current?.pause();
    };
  }, [audioUrl]);

  const steps = [
    { id: 1, title: "Audio & Mode", desc: "Select audio source" },
    { id: 2, title: "Lyrics & Theme", desc: "Set text & styling" },
    { id: 3, title: "Sync & Fine-tune", desc: "Align timing" },
    { id: 4, title: "Preview & Export", desc: "Render video" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header & Title */}
      <div className="pt-4 border-b border-daw-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-daw-text flex items-center gap-2">
            <Mic className="w-6 h-6 text-cyan-400" />
            Karaoke Studio
          </h1>
          <p className="text-xs text-daw-text-muted mt-1">
            Create professional synced karaoke videos with AI vocal separation and interactive timing.
          </p>
        </div>
        {audioUrl && (
          <div className="flex items-center gap-2 bg-daw-surface-2 px-3 py-1.5 rounded-lg border border-daw-border">
            <FileAudio className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono text-daw-text truncate max-w-[140px]">
              {audioFile?.name || "Track Loaded"}
            </span>
            <span className="text-[10px] text-daw-text-dim font-mono">
              {formatTime(audioDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Stepper Navigation */}
      <div className="grid grid-cols-4 gap-2">
        {steps.map((step) => {
          const isDone = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => {
                if (step.id === 1 || audioUrl) {
                  setCurrentStep(step.id);
                }
              }}
              disabled={step.id > 1 && !audioUrl}
              className={cn(
                "p-3 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between",
                isCurrent
                  ? "border-cyan-400/60 bg-cyan-500/10 text-daw-text shadow-lg shadow-cyan-500/5"
                  : isDone
                  ? "border-daw-accent/40 bg-daw-accent/5 text-daw-text"
                  : "border-daw-border/60 bg-daw-surface-2/40 text-daw-text-dim opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                    isCurrent
                      ? "bg-cyan-400 text-black"
                      : isDone
                      ? "bg-daw-accent text-white"
                      : "bg-daw-surface-3 text-daw-text-dim"
                  )}
                >
                  {isDone ? <Check className="w-3 h-3" /> : step.id}
                </span>
                {isCurrent && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold">{step.title}</div>
                <div className="text-[10px] text-daw-text-dim">{step.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Wizard Content Panels */}
      <div className="glass rounded-xl p-6 border border-daw-border">
        {/* STEP 1: Audio Setup */}
        {currentStep === 1 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-daw-text">1. Choose Creation Mode</h2>
              <p className="text-xs text-daw-text-dim mt-0.5">
                Start with a full song to automatically extract vocals, or upload an existing instrumental track.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setCreationMode("song")}
                className={cn(
                  "p-5 rounded-xl border transition-all text-left group relative",
                  creationMode === "song"
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-daw-border bg-daw-surface-2/60 hover:bg-daw-surface-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center mb-3 text-violet-400">
                  <Wand2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-daw-text mb-1">From a Song (AI Removal)</h3>
                <p className="text-xs text-daw-text-dim leading-relaxed">
                  Upload an audio file. Our AI will isolate the instrumental backing track automatically.
                </p>
              </button>

              <button
                onClick={() => setCreationMode("youtube")}
                className={cn(
                  "p-5 rounded-xl border transition-all text-left group relative",
                  creationMode === "youtube"
                    ? "border-red-500 bg-red-500/10"
                    : "border-daw-border bg-daw-surface-2/60 hover:bg-daw-surface-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center mb-3 text-red-400">
                  <Film className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-daw-text mb-1">From YouTube URL</h3>
                <p className="text-xs text-daw-text-dim leading-relaxed">
                  Paste any YouTube song link to download the track and extract the backing instrumental.
                </p>
              </button>

              <button
                onClick={() => setCreationMode("instrumental")}
                className={cn(
                  "p-5 rounded-xl border transition-all text-left group relative",
                  creationMode === "instrumental"
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-daw-border bg-daw-surface-2/60 hover:bg-daw-surface-2"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-3 text-cyan-400">
                  <Guitar className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-daw-text mb-1">From Instrumental</h3>
                <p className="text-xs text-daw-text-dim leading-relaxed">
                  Already have a karaoke track? Upload directly to sync lyrics without stem separation.
                </p>
              </button>
            </div>

            {/* YouTube Link Input or File Drop Zone */}
            {creationMode === "youtube" ? (
              <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/5 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-red-400 font-bold flex items-center gap-1.5">
                    <Film className="w-4 h-4" /> YouTube Song URL
                  </label>
                  <p className="text-xs text-daw-text-dim">
                    Paste a YouTube link (e.g. https://www.youtube.com/watch?v=...)
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 bg-daw-surface-2 text-daw-text text-sm rounded-lg px-3 py-2.5 outline-none border border-daw-border font-mono placeholder:text-daw-text-dim/40"
                  />
                  <Button
                    disabled={!ytUrl.trim() || ytLoading || separating}
                    onClick={() => handleYoutubeDownload(ytUrl)}
                    className="bg-red-500 text-white hover:bg-red-600 font-bold px-5"
                  >
                    {ytLoading || separating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {separating ? sepProgress : "Downloading YouTube..."}
                      </>
                    ) : (
                      "Import & Extract Vocals"
                    )}
                  </Button>
                </div>
                {audioFile && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                    <FileAudio className="w-4 h-4" />
                    <span>Loaded YouTube Track: <strong>{audioFile.name}</strong> ({formatTime(audioDuration)})</span>
                  </div>
                )}
              </div>
            ) : (
              <div
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f && !separating) {
                    creationMode === "song" ? handleCreateFromSong(f) : handleAudioLoad(f);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => !separating && document.getElementById("karaoke-audio-input")?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3",
                  separating
                    ? "border-amber-500/50 bg-amber-500/5 cursor-wait"
                    : audioFile
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2"
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
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                    <span className="text-sm font-medium text-amber-300">{sepProgress}</span>
                  </div>
                ) : audioFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileAudio className="w-10 h-10 text-emerald-400" />
                    <span className="text-base font-bold text-daw-text">{audioFile.name}</span>
                    <span className="text-xs text-daw-text-dim">Duration: {formatTime(audioDuration)}</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 mt-1">
                      ✓ Track Ready
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-daw-surface-2 flex items-center justify-center text-daw-text-dim">
                      <Music className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-daw-text">
                        {creationMode === "song"
                          ? "Click or drag your song here to remove vocals"
                          : "Click or drag your instrumental track here"}
                      </p>
                      <p className="text-xs text-daw-text-dim mt-1">Supports MP3, WAV, M4A up to 100MB</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Next Button */}
            <div className="flex justify-end pt-4">
              <Button
                disabled={!audioUrl || separating}
                onClick={() => setCurrentStep(2)}
                className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold px-6"
              >
                Next: Lyrics & Theme <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 2: Lyrics & Theme */}
        {currentStep === 2 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-daw-text">2. Lyrics & Canvas Theme</h2>
              <p className="text-xs text-daw-text-dim mt-0.5">
                Paste your song lyrics line by line and customize your video background aesthetics.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lyrics Input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-widest text-daw-text-dim font-bold flex items-center gap-1.5">
                    <Type className="w-4 h-4 text-cyan-400" />
                    Song Lyrics
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={autoTranscribing || !audioFile}
                      onClick={async () => {
                        if (!audioFile) return;
                        setAutoTranscribing(true);
                        setError("");
                        try {
                          const res = await api.tools.lyricTranscribe(audioFile, "auto", true);
                          if (res.ok && res.lines && res.lines.length > 0) {
                            // Extract full text for editor
                            const text = res.full_text || res.lines.map((l) => l.words.map((w) => w.word).join(" ")).join("\n");
                            setLyricsText(text);

                            // Convert detailed lines directly into timed LyricLine[]
                            const formattedLines: LyricLine[] = res.lines.map((l) => ({
                              start: l.start,
                              end: l.end,
                              words: l.words.map((w) => ({
                                text: w.word,
                                start: w.start,
                                end: w.end,
                              })),
                            }));

                            const flatWords: SyncWord[] = [];
                            formattedLines.forEach((l) => {
                              l.words.forEach((w) => {
                                flatWords.push({
                                  text: w.text,
                                  start: w.start,
                                  end: w.end,
                                  synced: true,
                                });
                              });
                            });

                            setLyricLines(formattedLines);
                            setSyncWords(flatWords);
                            setSyncIndex(flatWords.length);
                          } else {
                            setError(res.error || "No vocal speech detected for auto-transcription.");
                          }
                        } catch (err) {
                          setError("AI Lyric Detection failed: " + (err instanceof Error ? err.message : String(err)));
                        } finally {
                          setAutoTranscribing(false);
                        }
                      }}
                      className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-md border border-amber-500/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {autoTranscribing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Detecting AI Lyrics...
                        </>
                      ) : (
                        <>✨ Auto-Detect & Sync (AI)</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) setLyricsText(text);
                        } catch (err) {
                          setError("Clipboard access denied. Please paste manually using Ctrl+V / Cmd+V.");
                        }
                      }}
                      className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-md border border-cyan-500/30 transition-all flex items-center gap-1"
                    >
                      📋 Paste Clipboard
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const songName = audioFile?.name?.replace(/\.[^.]+$/, "") || "";
                        const query = prompt("Enter Artist and Song Title to search lyrics online:", songName);
                        if (!query) return;
                        try {
                          const searchRes = await api.tools.searchLyrics("", query);
                          if (searchRes.ok && searchRes.results.length > 0) {
                            const first = searchRes.results[0];
                            const fetchRes = await api.tools.lyricsFetch(first.url, first.source);
                            if (fetchRes.text) {
                              setLyricsText(fetchRes.text);
                            }
                          } else {
                            alert("No online lyrics found for query.");
                          }
                        } catch (e) {
                          setError("Online lyrics search failed: " + String(e));
                        }
                      }}
                      className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 rounded-md border border-violet-500/30 transition-all flex items-center gap-1"
                    >
                      🔍 Search Online
                    </button>
                  </div>
                </div>

                <textarea
                  value={lyricsText}
                  onChange={(e) => setLyricsText(e.target.value)}
                  placeholder={"Line 1 of song\nLine 2 of song\nAnother phrase here..."}
                  rows={10}
                  className="w-full bg-daw-surface-2 text-daw-text text-sm rounded-lg p-3 outline-none border border-daw-border resize-none placeholder:text-daw-text-dim/40 font-mono"
                />
                <p className="text-[10px] text-daw-text-dim">
                  Tip: Use Ctrl+V (or Cmd+V) to paste lyrics, or click "Paste Clipboard" / "Search Online".
                </p>
              </div>

              {/* Theme & Background Customizer */}
              <div className="space-y-4">
                <label className="text-xs uppercase tracking-widest text-daw-text-dim font-bold flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-violet-400" />
                  Background Theme
                </label>

                <div className="space-y-3 bg-daw-surface-2/50 p-4 rounded-lg border border-daw-border">
                  <div>
                    <span className="text-xs text-daw-text font-medium block mb-2">Preset Colors</span>
                    <div className="flex gap-2 flex-wrap">
                      {BG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => handleBgColor(c.value)}
                          className={cn(
                            "w-8 h-8 rounded-lg border-2 transition-all overflow-hidden relative",
                            bgColor === c.value && bgType === "color" ? "border-cyan-400 scale-105" : "border-transparent"
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
                  </div>

                  <div className="pt-2 border-t border-daw-border">
                    <span className="text-xs text-daw-text font-medium block mb-2">Custom Media</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => document.getElementById("bg-image-input")?.click()}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex-1 justify-center",
                          bgType === "image"
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-400"
                            : "bg-daw-surface-2 border-daw-border text-daw-text hover:bg-daw-surface-3"
                        )}
                      >
                        <ImageIcon className="w-4 h-4" /> Image Background
                      </button>
                      <button
                        onClick={() => document.getElementById("bg-video-input")?.click()}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex-1 justify-center",
                          bgType === "video"
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-400"
                            : "bg-daw-surface-2 border-daw-border text-daw-text hover:bg-daw-surface-3"
                        )}
                      >
                        <Film className="w-4 h-4" /> Video Background
                      </button>
                    </div>
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
                  </div>
                </div>

                {/* Quick Style Preview Box */}
                <div className="h-28 rounded-lg overflow-hidden border border-daw-border relative bg-black flex items-center justify-center">
                  <KaraokeCanvas
                    lines={[
                      {
                        words: [
                          { text: "Preview", start: 0, end: 5 },
                          { text: "Karaoke", start: 0, end: 5 },
                          { text: "Theme", start: 0, end: 5 },
                        ],
                        start: 0,
                        end: 5,
                      },
                    ]}
                    currentTime={0}
                    backgroundImage={imgRef.current}
                    backgroundVideo={videoRef.current}
                    backgroundColor={bgColor === "linear" ? "#0f0f23" : bgColor}
                    width={400}
                    height={150}
                    isRecording={false}
                    isPlaying={false}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-white">
                    Preview Frame
                  </div>
                </div>
              </div>
            </div>

            {/* Step Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="secondary" onClick={() => setCurrentStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                disabled={!lyricsText.trim()}
                onClick={() => {
                  parseLyrics();
                  setCurrentStep(3);
                }}
                className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold px-6"
              >
                Next: Sync & Fine-tune <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Sync & Timeline */}
        {currentStep === 3 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-daw-text">3. Sync Timing & Fine-tune</h2>
                <p className="text-xs text-daw-text-dim mt-0.5">
                  Use auto-distribution or press Spacebar to tap along with playback.
                </p>
              </div>
              <div className="flex bg-daw-surface-2 p-1 rounded-lg border border-daw-border">
                <button
                  onClick={() => setSyncMode("tap")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    syncMode === "tap" ? "bg-cyan-400 text-black shadow" : "text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  Tap Sync (Spacebar)
                </button>
                <button
                  onClick={() => {
                    setSyncMode("manual");
                    autoSync();
                  }}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    syncMode === "manual" ? "bg-cyan-400 text-black shadow" : "text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  Auto-Distribute
                </button>
              </div>
            </div>

            {/* Audio Transport Controls */}
            <div className="bg-daw-surface-2 p-4 rounded-xl border border-daw-border flex items-center gap-3">
              <button
                onClick={stopPlayback}
                className="p-2 rounded-lg bg-daw-surface-3 text-daw-text-dim hover:text-daw-text transition-colors"
                title="Stop"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className={cn(
                  "p-3 rounded-full transition-all shadow-md",
                  isPlaying
                    ? "bg-amber-400 text-black hover:bg-amber-300"
                    : "bg-cyan-400 text-black hover:bg-cyan-300"
                )}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={() => seekTo(0)}
                className="p-2 rounded-lg hover:bg-daw-surface-3 text-daw-text-dim transition-colors"
                title="Restart"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <div className="flex-1 space-y-1">
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 1}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="w-full h-2 rounded-full accent-cyan-400 cursor-pointer bg-daw-surface-1"
                />
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold tabular-nums">
                {formatTime(currentTime)}
              </span>
            </div>

            {/* Tap Sync Display Card */}
            {syncMode === "tap" && (
              <div className="p-4 rounded-xl bg-daw-surface-2 border border-daw-border space-y-3">
                {isPlaying && syncIndex < syncWords.length ? (
                  <div className="text-center py-4 bg-black/40 rounded-lg border border-cyan-400/20">
                    <div className="text-3xl font-extrabold text-cyan-400 mb-1 animate-pulse">
                      {syncWords[syncIndex]?.text || ""}
                    </div>
                    <p className="text-xs text-daw-text-dim mb-2">
                      Word {syncIndex + 1} of {syncWords.length}
                    </p>
                    <div className="max-w-md mx-auto bg-daw-surface-1 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full transition-all duration-75"
                        style={{ width: `${(syncIndex / syncWords.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-cyan-400 font-bold mt-3 uppercase tracking-wider animate-bounce">
                      Press SPACEBAR or RIGHT-ARROW (→) to sync word • DOWN-ARROW (↓) to cut phrase
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-daw-text-dim font-mono">
                        Synced {syncIndex} / {syncWords.length} words
                      </span>
                      {syncIndex > 0 && (
                        <button
                          onClick={() => {
                            setSyncWords((prev) => prev.map((w) => ({ ...w, synced: false, start: 0, end: 0 })));
                            setSyncIndex(0);
                            setLyricLines([]);
                          }}
                          className="text-xs text-red-400 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Reset Taps
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-daw-surface-1 rounded-lg border border-daw-border">
                      {syncWords.map((w, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-xs px-2 py-1 rounded font-medium transition-all select-none",
                            i < syncIndex
                              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-400/30"
                              : i === syncIndex && isPlaying
                              ? "bg-amber-400/20 text-amber-300 border border-amber-400/50"
                              : "bg-daw-surface-2 text-daw-text-dim"
                          )}
                        >
                          {w.text}
                          {i < syncIndex && (
                            <span className="ml-1 text-[9px] opacity-70 font-mono">{w.start.toFixed(1)}s</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Timeline Waveform Editor */}
            {lyricLines.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-daw-text-dim font-bold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Interactive Word Timeline
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

            {/* Step Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="secondary" onClick={() => setCurrentStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                disabled={lyricLines.length === 0}
                onClick={() => setCurrentStep(4)}
                className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold px-6"
              >
                Next: Preview & Export <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP 4: Preview & Export */}
        {currentStep === 4 && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-daw-text">4. Live Preview & Video Export</h2>
              <p className="text-xs text-daw-text-dim mt-0.5">
                Review your synchronized karaoke video live and render the high quality video file.
              </p>
            </div>

            {/* Canvas Live Preview */}
            <div className="rounded-xl overflow-hidden border border-daw-border bg-black shadow-2xl relative">
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
                titleText={audioFile ? audioFile.name : "Karaoke Track"}
                className="w-full"
              />
            </div>

            {/* Transport controls in preview */}
            <div className="flex items-center gap-3 bg-daw-surface-2 p-3 rounded-lg border border-daw-border">
              <button
                onClick={togglePlay}
                className="p-2 rounded-full bg-cyan-400 text-black hover:bg-cyan-300 font-bold"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={audioDuration || 1}
                step={0.05}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="flex-1 h-2 rounded-full accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono text-cyan-400 font-bold tabular-nums">
                {formatTime(currentTime)} / {formatTime(audioDuration)}
              </span>
            </div>

            {/* Export Settings */}
            <div className="p-4 rounded-xl bg-daw-surface-2 border border-daw-border space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-daw-text uppercase tracking-wider flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" /> Video Quality
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportResolution("1080p")}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-semibold border transition-all",
                      exportResolution === "1080p"
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-400"
                        : "bg-daw-surface-3 border-daw-border text-daw-text-dim"
                    )}
                  >
                    1080p Full HD
                  </button>
                  <button
                    onClick={() => setExportResolution("720p")}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-semibold border transition-all",
                      exportResolution === "720p"
                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-400"
                        : "bg-daw-surface-3 border-daw-border text-daw-text-dim"
                    )}
                  >
                    720p HD
                  </button>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white font-bold py-6 text-base shadow-lg shadow-cyan-500/20"
                onClick={exportVideo}
                disabled={exporting || !audioUrl}
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Rendering Video... {exportProgress}%
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Export Karaoke Video ({exportResolution})
                  </>
                )}
              </Button>
            </div>

            {/* Back Button */}
            <div className="flex justify-start">
              <Button variant="secondary" onClick={() => setCurrentStep(3)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back to Sync Editor
              </Button>
            </div>
          </motion.div>
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
    </div>
  );
}

