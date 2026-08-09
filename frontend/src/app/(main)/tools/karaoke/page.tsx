"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, Mic, ImageIcon, Film, Download, Loader2,
  AlertCircle, FileAudio, Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { KaraokeCanvas, type LyricLine } from "@/components/studio/KaraokeCanvas";

const BG_COLORS = [
  { label: "Dark", value: "#0f0f23" },
  { label: "Midnight", value: "#1a1a2e" },
  { label: "Slate", value: "#1e293b" },
  { label: "Violet", value: "#2d1b69" },
  { label: "Black", value: "#000000" },
];

type SyncMode = "tap" | "manual";

interface SyncWord { text: string; start: number; end: number; synced: boolean; }

export default function KaraokePage() {
  // Audio
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const animRef = useRef<number>(0);

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

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState("");

  // Canvas dimensions
  const canvasW = 640;
  const canvasH = 360;

  // ── Audio playback ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", update);
    return () => audio.removeEventListener("timeupdate", update);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play(); setIsPlaying(true); }
    else { audio.pause(); setIsPlaying(false); }
  }, []);

  const handleAudioLoad = useCallback((file: File) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(url);
    setLyricLines([]);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));
  }, [audioUrl]);

  // ── Background ──
  const handleBgImage = useCallback((file: File) => {
    const img = new window.Image();
    img.onload = () => { setBgImage(img); imgRef.current = img; setBgType("image"); };
    img.src = URL.createObjectURL(file);
  }, []);

  const handleBgVideo = useCallback((file: File) => {
    const vid = document.createElement("video");
    vid.src = URL.createObjectURL(file);
    vid.loop = true;
    vid.muted = true;
    vid.play();
    videoRef.current = vid;
    setBgVideo(vid);
    setBgType("video");
  }, []);

  // ── Lyrics parsing ──
  const parseLyrics = useCallback(() => {
    if (!lyricsText.trim()) return;
    const lines = lyricsText.trim().split("\n").filter((l) => l.trim());
    const words: SyncWord[] = [];
    for (const line of lines) {
      const lineWords = line.trim().split(/\s+/);
      for (const w of lineWords) {
        words.push({ text: w, start: 0, end: 0, synced: false });
      }
    }
    setSyncWords(words);
    setSyncIndex(0);
    setLyricLines([]);
  }, [lyricsText]);

  // ── Tap sync ──
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
    setSyncIndex((i) => i + 1);
    if (syncIndex >= syncWords.length - 1) {
      setSyncWords((prev) => {
        const next = [...prev];
        next[prev.length - 1] = { ...next[prev.length - 1], end: audioDuration };
        return next;
      });
    }
  }, [syncIndex, syncWords, audioDuration]);

  // ── Build lyric lines from sync words ──
  const buildLines = useCallback(() => {
    const lines: LyricLine[] = [];
    let line: LyricLine = { words: [], start: 0, end: 0 };
    for (let i = 0; i < syncWords.length; i++) {
      const w = syncWords[i];
      if (line.words.length === 0) line.start = w.start;
      line.words.push({ text: w.text, start: w.start, end: w.end });
      line.end = w.end;
      // Break on line boundaries from original text
      if (lyricsText.trim().split("\n").some((l) => {
        const words = l.trim().split(/\s+/);
        const wordStart = lyricsText.trim().split("\n").slice(0, syncWords.indexOf(w)).join(" ").split(/\s+/).length;
        return wordStart + words.length === i + 1;
      })) {
        lines.push(line);
        line = { words: [], start: 0, end: 0 };
      }
    }
    if (line.words.length > 0) lines.push(line);
    setLyricLines(lines);
  }, [syncWords, lyricsText]);

  // Simple line-based sync (each line = fixed interval)
  const manualSync = useCallback(() => {
    if (!lyricsText.trim() || !audioDuration) return;
    const rawLines = lyricsText.trim().split("\n").filter((l) => l.trim());
    const durationPerLine = audioDuration / rawLines.length;
    const lines: LyricLine[] = rawLines.map((raw, i) => {
      const words = raw.trim().split(/\s+/);
      const lineStart = i * durationPerLine;
      const lineEnd = (i + 1) * durationPerLine;
      const durPerWord = (lineEnd - lineStart) / words.length;
      return {
        words: words.map((text, wi) => ({
          text,
          start: lineStart + wi * durPerWord,
          end: lineStart + (wi + 1) * durPerWord,
        })),
        start: lineStart,
        end: lineEnd,
      };
    });
    setLyricLines(lines);
  }, [lyricsText, audioDuration]);

  // ── Keyboard handler for tap sync ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && syncMode === "tap" && isPlaying) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [syncMode, isPlaying, handleTap]);

  // ── Export video ──
  const exportVideo = useCallback(async () => {
    if (!audioUrl || lyricLines.length === 0) return;
    setExporting(true);
    setExportProgress(0);
    setError("");

    try {
      // Create hidden canvas
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.display = "none";
      document.body.appendChild(canvas);

      const ctx = canvas.getContext("2d")!;
      const audio = new Audio(audioUrl);
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamDestination();

      // Create media element source
      const mediaEl = document.createElement("audio");
      mediaEl.src = audioUrl;
      const mediaSource = audioCtx.createMediaElementSource(mediaEl);
      mediaSource.connect(audioCtx.destination);
      mediaSource.connect(source);

      const stream = canvas.captureStream(30);
      const audioTrack = source.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "karaoke.webm"; a.click();
        URL.revokeObjectURL(url);
        canvas.remove();
        audioCtx.close();
        setExporting(false);
        setExportProgress(100);
      };

      // Render frames
      const totalFrames = Math.ceil(audioDuration * 30);
      let frame = 0;
      recorder.start();

      const renderFrame = () => {
        if (frame >= totalFrames) { recorder.stop(); return; }
        const t = frame / 30;

        // Draw frame
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
        if (bgImage) {
          const scale = Math.max(canvasW / bgImage.width, canvasH / bgImage.height);
          const sw = canvasW / scale, sh = canvasH / scale;
          ctx.drawImage(bgImage, (bgImage.width - sw) / 2, (bgImage.height - sh) / 2, sw, sh, 0, 0, canvasW, canvasH);
        }
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Draw lyrics (simple version for export)
        let activeLineIdx = -1;
        for (let i = 0; i < lyricLines.length; i++) {
          if (t >= lyricLines[i].start && t <= lyricLines[i].end) { activeLineIdx = i; break; }
        }
        const visibleStart = Math.max(0, activeLineIdx - 2);
        const visibleLines = lyricLines.slice(visibleStart, visibleStart + 5);
        const centerY = canvasH / 2;

        ctx.textAlign = "center";
        visibleLines.forEach((line, vi) => {
          const lineIdx = visibleStart + vi;
          const isActive = lineIdx === activeLineIdx;
          const y = centerY + (vi - 1.5) * 52;
          const text = line.words.map((w) => w.text).join(" ");

          if (isActive) {
            const progress = line.end > line.start ? (t - line.start) / (line.end - line.start) : 0;
            ctx.font = "bold 28px Inter, system-ui, sans-serif";
            const totalW = ctx.measureText(text).width;
            let x = canvasW / 2 - totalW / 2;

            for (let wi = 0; wi < line.words.length; wi++) {
              const w = line.words[wi];
              const wW = ctx.measureText(w.text).width;
              const spaceW = wi < line.words.length - 1 ? ctx.measureText(" ").width : 0;
              const wordProgress = progress * line.words.length;
              if (wi < Math.floor(wordProgress)) {
                ctx.fillStyle = "#a855f7";
                ctx.fillText(w.text, x + wW / 2, y);
              } else if (wi === Math.floor(wordProgress)) {
                const frac = wordProgress - Math.floor(wordProgress);
                ctx.save();
                ctx.beginPath(); ctx.rect(x, y - 28, wW * frac, 36); ctx.clip();
                ctx.fillStyle = "#a855f7"; ctx.fillText(w.text, x + wW / 2, y);
                ctx.restore();
                ctx.save();
                ctx.beginPath(); ctx.rect(x + wW * frac, y - 28, wW * (1 - frac), 36); ctx.clip();
                ctx.fillStyle = "#22d3ee"; ctx.fillText(w.text, x + wW / 2, y);
                ctx.restore();
              } else {
                ctx.fillStyle = "rgba(148,163,184,0.35)";
                ctx.fillText(w.text, x + wW / 2, y);
              }
              x += wW + spaceW;
            }
          } else {
            ctx.font = "bold 28px Inter, system-ui, sans-serif";
            ctx.fillStyle = lineIdx < activeLineIdx ? "rgba(168,85,247,0.6)" : "rgba(148,163,184,0.35)";
            ctx.fillText(text, canvasW / 2, y);
          }
        });

        setExportProgress(Math.round((frame / totalFrames) * 100));
        frame++;
        requestAnimationFrame(renderFrame);
      };

      mediaEl.play();
      renderFrame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setExporting(false);
    }
  }, [audioUrl, lyricLines, bgColor, bgImage, canvasW, canvasH]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60); const s = Math.floor(t % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String((t % 1).toFixed(2).split(".")[1])}`;
  };

  return (
    <div className="max-w-3xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-cyan-400" />
          Karaoke Video Generator
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Sync lyrics to audio, choose a background, and export as a karaoke video.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* 1. Audio upload */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">1. Load audio track (instrumental/vocal removed)</p>
          <div
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleAudioLoad(f); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => document.getElementById("karaoke-audio-input")?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
              audioFile ? "border-daw-green/50 bg-daw-green/5" : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2"
            )}
          >
            <input id="karaoke-audio-input" type="file" accept=".wav,.mp3,.m4a,audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioLoad(f); }} />
            {audioFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileAudio className="w-4 h-4 text-daw-green" />
                <span className="text-sm">{audioFile.name}</span>
                <span className="text-xs text-daw-text-dim">{audioDuration.toFixed(1)}s</span>
              </div>
            ) : (
              <p className="text-sm text-daw-text-muted">Drop instrumental track here</p>
            )}
          </div>
          {audioUrl && (
            <>
              <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} onPause={() => setIsPlaying(false)} className="hidden" />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={togglePlay} className="p-1.5 rounded bg-daw-accent/20 text-daw-accent hover:bg-daw-accent/30">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button onClick={() => { if (audioRef.current) audioRef.current.currentTime = 0; }} className="p-1.5 rounded hover:bg-daw-surface-2 text-daw-text-dim">
                  <SkipBack className="w-4 h-4" />
                </button>
                <input
                  type="range" min={0} max={audioDuration || 1} step={0.1} value={currentTime}
                  onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); }}
                  className="flex-1 h-1 rounded-full accent-daw-accent cursor-pointer"
                />
                <span className="text-[10px] text-daw-text-dim font-mono w-16 text-right">{formatTime(currentTime)}</span>
              </div>
            </>
          )}
        </div>

        {/* 2. Lyrics */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">2. Enter lyrics & sync</p>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setSyncMode("tap")} className={cn("px-3 py-1 rounded text-xs", syncMode === "tap" ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-2 text-daw-text-dim")}>
              Tap Sync (spacebar)
            </button>
            <button onClick={() => setSyncMode("manual")} className={cn("px-3 py-1 rounded text-xs", syncMode === "manual" ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-2 text-daw-text-dim")}>
              Auto (time split)
            </button>
          </div>

          <textarea
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder="Paste lyrics here, one line per phrase..."
            rows={6}
            className="w-full bg-daw-surface-2 text-daw-text text-sm rounded-lg p-3 outline-none border border-daw-border resize-none placeholder:text-daw-text-dim/50"
          />

          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={syncMode === "tap" ? parseLyrics : manualSync} disabled={!lyricsText.trim() || (syncMode === "manual" && !audioDuration)}>
              <Type className="w-3.5 h-3.5 mr-1" />
              {syncMode === "tap" ? "Parse & Start Sync" : "Auto Sync"}
            </Button>
            {syncMode === "tap" && syncWords.length > 0 && (
              <Button size="sm" variant="secondary" onClick={buildLines} disabled={syncWords.filter(w => w.synced).length === 0}>
                Build Timeline
              </Button>
            )}
          </div>

          {/* Tap sync display */}
          {syncMode === "tap" && syncWords.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-daw-surface-2 max-h-32 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {syncWords.map((w, i) => (
                  <span key={i} className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    w.synced ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-1 text-daw-text-dim",
                    i === syncIndex && "ring-1 ring-daw-accent"
                  )}>
                    {w.text}
                    {w.synced && <span className="ml-1 text-[9px] opacity-60">{w.start.toFixed(1)}s</span>}
                  </span>
                ))}
              </div>
              {isPlaying && syncIndex < syncWords.length && (
                <p className="text-[10px] text-daw-accent mt-1">Tap SPACEBAR on each word as it's sung ({syncIndex + 1}/{syncWords.length})</p>
              )}
            </div>
          )}
        </div>

        {/* 3. Background */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">3. Choose background</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {BG_COLORS.map((c) => (
                <button key={c.value} onClick={() => { setBgColor(c.value); setBgType("color"); }}
                  className="w-6 h-6 rounded border-2 transition-colors"
                  style={{ backgroundColor: c.value, borderColor: bgColor === c.value && bgType === "color" ? "#a855f7" : "transparent" }}
                  title={c.label} />
              ))}
            </div>
            <div className="w-px h-6 bg-daw-border" />
            <button onClick={() => document.getElementById("bg-image-input")?.click()}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs", bgType === "image" ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text")}>
              <ImageIcon className="w-3.5 h-3.5" /> Image
            </button>
            <button onClick={() => document.getElementById("bg-video-input")?.click()}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs", bgType === "video" ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text")}>
              <Film className="w-3.5 h-3.5" /> Video
            </button>
            <input id="bg-image-input" type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgImage(f); }} />
            <input id="bg-video-input" type="file" accept="video/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgVideo(f); }} />
          </div>
        </div>

        {/* 4. Preview */}
        {lyricLines.length > 0 && (
          <div>
            <p className="text-xs text-daw-text-dim mb-2">4. Preview</p>
            <div className="rounded-lg overflow-hidden border border-daw-border">
              <KaraokeCanvas
                lines={lyricLines}
                currentTime={isPlaying ? currentTime : 0}
                backgroundImage={imgRef.current}
                backgroundVideo={videoRef.current}
                backgroundColor={bgColor}
                width={canvasW}
                height={canvasH}
                isRecording={false}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* 5. Export */}
        {lyricLines.length > 0 && (
          <div>
            <p className="text-xs text-daw-text-dim mb-2">5. Export video</p>
            <Button size="lg" className="w-full" onClick={exportVideo} disabled={exporting || !audioUrl}>
              {exporting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Exporting {exportProgress}%</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Export Karaoke Video (WebM)</>
              )}
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
      </div>
    </div>
  );
}
