"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Loader2,
  AlertCircle,
  Mic,
  Music,
  FileAudio,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Video,
  Film,
  Check,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { LyricTranscribeResult, LyricLineDetailed } from "@/lib/api";
import { LyricTimelineEditor } from "@/components/studio/LyricTimelineEditor";
import FullscreenLyrics from "@/components/studio/FullscreenLyrics";
import LyricsEditorModal from "@/components/studio/LyricsEditorModal";
import { useProgress } from "@/hooks/use-progress";

export default function LyricsPage() {
  const [lyricFile, setLyricFile] = useState<File | null>(null);
  const [lyricTranscribing, setLyricTranscribing] = useState(false);
  const [lyricError, setLyricError] = useState("");
  const [lyricResult, setLyricResult] = useState<LyricTranscribeResult | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lyricAudioUrl, setLyricAudioUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editedLines, setEditedLines] = useState<Record<number, string>>({});
  const [isolateVocals, setIsolateVocals] = useState(false);
  const [adjustedLines, setAdjustedLines] = useState<LyricLineDetailed[] | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [videoExporting, setVideoExporting] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showLrcEditor, setShowLrcEditor] = useState(false);
  const [progressSession, setProgressSession] = useState("");
  const progress = useProgress(progressSession);
  const rafRef = useRef<number>(0);
  const linesContainerRef = useRef<HTMLDivElement | null>(null);
  const karaokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  const handleFileSelect = useCallback((f: File) => {
    if (lyricAudioUrl) URL.revokeObjectURL(lyricAudioUrl);
    setLyricFile(f);
    setLyricResult(null);
    setLyricError("");
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setEditedLines({});
    setAdjustedLines(null);
    setShowTimeline(false);
    const url = URL.createObjectURL(f);
    setLyricAudioUrl(url);
  }, [lyricAudioUrl]);

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

  const skipTime = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleLyricTranscribe = useCallback(async () => {
    if (!lyricFile) return;
    setLyricTranscribing(true);
    setLyricError("");
    setLyricResult(null);
    setAdjustedLines(null);
    const session = `lyric_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setProgressSession(session);
    try {
      const data = await api.tools.lyricTranscribe(lyricFile, "auto", isolateVocals, progressSession) as LyricTranscribeResult & { error?: string };
      setLyricResult(data);
      if (data.status === "failed") {
        setLyricError(data.error || "Transcription completed with errors");
      }
    } catch (err) {
      setLyricError(err instanceof Error ? err.message : String(err));
    } finally {
      setLyricTranscribing(false);
    }
  }, [lyricFile, isolateVocals]);

  useEffect(() => {
    return () => {
      if (lyricAudioUrl) URL.revokeObjectURL(lyricAudioUrl);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [lyricAudioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!audio) return;
      rafRef.current = requestAnimationFrame(() => {
        setCurrentTime(audio.currentTime);
      });
    };
    const onLoadedMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
    };
  }, [lyricAudioUrl]);

  const allLines = adjustedLines ?? lyricResult?.lines ?? [];

  const activeLineIndex = (() => {
    if (!allLines.length) return -1;
    for (let i = 0; i < allLines.length; i++) {
      if (currentTime < allLines[i].start) return Math.max(0, i - 1);
    }
    return allLines.length - 1;
  })();

  useEffect(() => {
    if (activeLineIndex < 0 || !linesContainerRef.current) return;
    const activeEl = linesContainerRef.current.querySelector(`[data-line-idx="${activeLineIndex}"]`);
    if (activeEl) {
      const container = linesContainerRef.current;
      const rect = activeEl.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      if (rect.top < cRect.top || rect.bottom > cRect.bottom) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLineIndex]);

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  };

  const startEdit = (lineIdx: number, lineText: string) => {
    setEditingLine(lineIdx);
    setEditText(editedLines[lineIdx] ?? lineText);
  };

  const commitEdit = (lineIdx: number) => {
    if (editText.trim()) {
      setEditedLines((prev) => ({ ...prev, [lineIdx]: editText.trim() }));
    }
    setEditingLine(null);
  };

  const handleLinesUpdate = useCallback((updated: LyricLineDetailed[]) => {
    setAdjustedLines(updated);
  }, []);

  const downloadFile = useCallback((path: string | undefined, fallbackName: string, fallbackContent: string) => {
    if (path) {
      const a = document.createElement("a");
      a.href = `/api/tools/lyrics/download/${encodeURIComponent(path.split("/").pop() || fallbackName)}`;
      a.download = fallbackName;
      a.click();
    } else {
      const blob = new Blob([fallbackContent], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fallbackName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }, []);

  const buildLyricsContent = useCallback((format: "txt" | "lrc" | "srt" | "json") => {
    const lines = adjustedLines ?? lyricResult?.lines ?? [];
    switch (format) {
      case "txt":
        return lines.map((l) => l.words.map((w) => w.word).join(" ")).join("\n");
      case "lrc": {
        let out = "";
        for (const line of lines) {
          const startM = Math.floor(line.start / 60);
          const startS = line.start % 60;
          const text = line.words.map((w) => w.word).join(" ");
          if (text) out += `[${String(startM).padStart(2, "0")}:${startS.toFixed(2).padStart(5, "0")}] ${text}\n`;
        }
        return out;
      }
      case "srt": {
        let out = "", idx = 1;
        for (const line of lines) {
          const text = line.words.map((w) => w.word).join(" ");
          if (!text.trim()) continue;
          out += `${idx}\n${fmtSrt(line.start)} --> ${fmtSrt(line.end)}\n${text}\n\n`;
          idx++;
        }
        return out;
      }
      case "json":
        return JSON.stringify({
          language: lyricResult?.language ?? "",
          lang_code: lyricResult?.lang_code ?? "",
          duration_secs: lyricResult?.duration_secs ?? 0,
          word_count: lyricResult?.word_count ?? 0,
          lines: lines.map((ln) => ({
            start: ln.start,
            end: ln.end,
            text: ln.words.map((w) => w.word).join(" "),
            words: ln.words.map((w) => ({ word: w.word, start: w.start, end: w.end, confidence: (w as any).confidence ?? 0.8 })),
          })),
        }, null, 2);
    }
  }, [adjustedLines, lyricResult]);

  const exportWithAdjusted = useCallback((format: string) => {
    const content = buildLyricsContent(format as "txt" | "lrc" | "srt" | "json");
    const ext = format;
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lyrics_adjusted.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [buildLyricsContent]);

  // ── Video Export via MediaRecorder + Canvas ──
  const exportVideo = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !allLines.length) return;
    setVideoExporting(true);
    setVideoProgress(0);
    videoChunksRef.current = [];

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audio);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination);
    const combined = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const recorder = new MediaRecorder(combined, { mimeType: "video/webm;codecs=vp9" });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "karaoke.webm";
      a.click();
      URL.revokeObjectURL(url);
      setVideoExporting(false);
      setVideoProgress(100);
      audioCtx.close();
    };

    recorder.start(100);
    audio.currentTime = 0;
    audio.play();

    const totalDur = audio.duration || lyricResult?.duration_secs || 0;
    const startTime = performance.now();
    const renderFrame = () => {
      if (!recorder || recorder.state === "inactive") return;
      const elapsed = (performance.now() - startTime) / 1000;
      setVideoProgress(Math.min(100, Math.round((elapsed / totalDur) * 100)));
      drawKaraokeFrame(ctx, canvas.width, canvas.height, audio.currentTime, totalDur, allLines, editedLines);
      if (elapsed >= totalDur) {
        recorder.stop();
        audio.pause();
        return;
      }
      requestAnimationFrame(renderFrame);
    };
    requestAnimationFrame(renderFrame);
  }, [allLines, editedLines, lyricResult]);

  const cancelVideoExport = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    audioRef.current?.pause();
    setVideoExporting(false);
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-400" />
          Lyric Transcription
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Auto-transcribe lyrics with word-level timestamps. VAD strips silence, Whisper generates
          word-aligned lyrics for karaoke sync. Edit, recalibrate, or export as video.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* Drop zone */}
        <div
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) handleFileSelect(f);
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("lyric-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            lyricFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-emerald-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="lyric-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
          {lyricFile ? (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <FileAudio className="w-5 h-5 text-daw-green" />
              <span className="text-sm font-medium">{lyricFile.name}</span>
              {lyricTranscribing && (
                <span className="flex items-center gap-1 text-yellow-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Transcribing...
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a vocal stem or full song here</p>
            </div>
          )}
        </div>

        {lyricAudioUrl && (
          <audio ref={audioRef} src={lyricAudioUrl} className="hidden" />
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isolateVocals}
            onChange={(e) => setIsolateVocals(e.target.checked)}
            className="w-4 h-4 rounded border-daw-border bg-daw-surface-2 accent-emerald-500"
          />
          <span className="text-xs text-daw-text-muted">
            Isolate vocals first (Demucs) -- best for songs with heavy instrumental backing
          </span>
        </label>

        <Button
          size="lg"
          className="w-full"
          onClick={handleLyricTranscribe}
          disabled={lyricTranscribing || !lyricFile}
        >
          {lyricTranscribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribing lyrics...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Transcribe Lyrics
            </>
          )}
        </Button>

        {lyricError && (
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-lg text-sm",
            lyricResult?.full_text
              ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          )}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {lyricError}
          </div>
        )}

        <AnimatePresence>
          {lyricResult && allLines.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3"
            >
              {/* Header + download */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="green">{allLines.length} lines</Badge>
                  <span className="text-xs text-daw-text-dim">
                    {lyricResult.word_count ?? 0} words
                  </span>
                  {lyricResult.language && (
                    <span className="text-xs text-daw-text-dim">
                      {lyricResult.language}
                    </span>
                  )}
                  {adjustedLines && (
                    <Badge variant="accent" className="text-[9px]">edited</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Export dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-daw-border text-daw-text-dim hover:text-daw-text transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                    {showExportMenu && (
                      <div
                        className="absolute right-0 top-full mt-1 z-20 bg-daw-surface-2 border border-daw-border rounded-lg shadow-lg p-1.5 space-y-0.5 min-w-[140px]"
                        onMouseLeave={() => setShowExportMenu(false)}
                      >
                        {(["txt", "lrc", "srt", "json"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => {
                              if (adjustedLines) {
                                exportWithAdjusted(fmt);
                              } else {
                                downloadFile(
                                  lyricResult[`${fmt}_path` as keyof typeof lyricResult] as string | undefined,
                                  `lyrics.${fmt}`,
                                  buildLyricsContent(fmt),
                                );
                              }
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left text-[10px] px-2 py-1 rounded text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                          >
                            .{fmt} {adjustedLines ? "(edited)" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Video export */}
                  {videoExporting ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={cancelVideoExport}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        Cancel
                      </button>
                      <span className="text-[10px] text-daw-text-dim tabular-nums w-8 text-right">{videoProgress}%</span>
                      <div className="w-16 h-1 bg-daw-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${videoProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={exportVideo}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 transition-colors"
                    >
                      <Video className="w-3 h-3" />
                      Export Video
                    </button>
                  )}

                  {/* Timeline toggle */}
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className={cn(
                      "flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
                      showTimeline
                        ? "border-violet-400/50 text-violet-300 bg-violet-400/10"
                        : "border-daw-border text-daw-text-dim hover:text-daw-text"
                    )}
                  >
                    <Film className="w-3 h-3" />
                    Timeline
                  </button>
                </div>
              </div>

              {/* Audio transport bar */}
              <div className="flex items-center gap-3 p-2 rounded-lg bg-daw-surface-2/60 border border-daw-border">
                <button
                  onClick={() => skipTime(-5)}
                  className="p-1.5 rounded text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePlay}
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    isPlaying
                      ? "text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20"
                      : "text-daw-text hover:text-cyan-400 hover:bg-cyan-400/10"
                  )}
                >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                {/* Transcribing progress */}
                {lyricTranscribing && progress && (
                  <div className="flex items-center gap-2 text-[10px] text-daw-text-dim">
                    <span className="text-cyan-400">{progress.stage === "demucs" ? "Isolating vocals" : progress.stage === "vad" ? "Detecting speech" : progress.stage === "whisper" ? "Transcribing" : progress.stage === "grouping" ? "Formatting" : progress.stage}</span>
                    <div className="w-20 h-1 bg-daw-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full transition-all duration-300" style={{ width: `${progress.progress}%` }} />
                    </div>
                    <span>{progress.progress}%</span>
                  </div>
                )}

                {/* Mode buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFullscreen(true)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 transition-colors"
                  >
                    <Maximize2 className="w-3 h-3" />
                    Fullscreen
                  </button>
                  <button
                    onClick={() => setShowLrcEditor(true)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-violet-400/30 text-violet-300 hover:bg-violet-400/10 transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Edit LRC
                  </button>
                </div>

                <button
                  onClick={() => skipTime(5)}
                  className="p-1.5 rounded text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-daw-text-dim tabular-nums w-20 text-center">
                  {formatTimestamp(currentTime)} / {formatTimestamp(duration || lyricResult.duration_secs || 0)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || lyricResult.duration_secs || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="flex-1 h-1 accent-cyan-400 cursor-pointer"
                />
                <Maximize2 className="w-3.5 h-3.5 text-daw-text-dim" />
              </div>

              {/* Timeline Editor */}
              <AnimatePresence>
                {showTimeline && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl border border-violet-400/20 bg-daw-surface-2/30">
                      <LyricTimelineEditor
                        lines={allLines}
                        currentTime={currentTime}
                        isPlaying={isPlaying}
                        duration={duration || lyricResult.duration_secs || 0}
                        onLinesUpdate={handleLinesUpdate}
                        onSeek={seekTo}
                        canRecalibrate={isPlaying && lyricAudioUrl !== ""}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Karaoke word viewer */}
              <div
                ref={linesContainerRef}
                className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-emerald-400/20 p-3"
              >
                {allLines.map((line, lineIdx) => {
                  const isActive = lineIdx === activeLineIndex;
                  const lineText = editedLines[lineIdx] ?? line.words.map((w) => w.word).join(" ");
                  const isEditing = editingLine === lineIdx;

                  return (
                    <div
                      key={lineIdx}
                      data-line-idx={lineIdx}
                      onClick={() => seekTo(line.start)}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2 rounded-md cursor-pointer transition-all duration-150",
                        isActive
                          ? "bg-cyan-400/10 border border-cyan-400/30 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                          : "bg-daw-surface-3/40 hover:bg-daw-surface-3/80 border border-transparent"
                      )}
                    >
                      <span className="w-14 text-[11px] text-daw-text-dim tabular-nums shrink-0 pt-0.5">
                        {formatTimestamp(line.start).slice(0, 5)}
                      </span>

                      {isEditing ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => commitEdit(lineIdx)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(lineIdx); if (e.key === "Escape") setEditingLine(null); }}
                          className="flex-1 bg-daw-surface-2 border border-cyan-400/40 rounded px-2 py-0.5 text-xs text-daw-text outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex-1 text-xs flex flex-wrap gap-x-1.5">
                          {line.words.map((word, wIdx) => {
                            const isWordActive =
                              isPlaying &&
                              currentTime >= word.start &&
                              currentTime < word.end;

                            let colorFraction = 0;
                            if (isWordActive) {
                              const dur = word.end - word.start || 0.01;
                              colorFraction = Math.min(1, (currentTime - word.start) / dur);
                            } else if (currentTime >= word.end) {
                              colorFraction = 1;
                            }

                            return (
                              <span
                                key={wIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  seekTo(word.start);
                                }}
                                className={cn(
                                  "relative cursor-pointer rounded-sm px-0.5 transition-colors duration-75",
                                  isWordActive ? "text-white font-medium" : "text-daw-text/80",
                                )}
                                style={{
                                  background: `linear-gradient(90deg, rgba(34,211,238,0.35) ${colorFraction * 100}%, transparent ${colorFraction * 100}%)`,
                                }}
                              >
                                {word.word}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(lineIdx, lineText);
                          }}
                          className="text-[10px] text-daw-text-dim hover:text-daw-text transition-colors px-1 py-0.5"
                          title="Edit line"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full text fallback */}
              {lyricResult.full_text && (
                <details className="p-3 rounded-lg bg-daw-surface-2/50 text-sm text-daw-text leading-relaxed border-l-2 border-emerald-400/30">
                  <summary className="cursor-pointer text-xs text-daw-text-dim">Full text</summary>
                  <p className="mt-2 italic whitespace-pre-wrap">{lyricResult.full_text}</p>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fullscreen karaoke overlay */}
        {showFullscreen && (
          <FullscreenLyrics
          lines={allLines}
          currentTime={currentTime}
          duration={duration || lyricResult?.duration_secs || 0}
          isPlaying={isPlaying}
          title={lyricFile?.name || "Karaoke"}
          artist={lyricResult?.language || "Lyrics"}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onExit={() => setShowFullscreen(false)}
        />
        )}

        {/* LRC editor modal */}
        <LyricsEditorModal
          isOpen={showLrcEditor}
          initialLrc={buildLyricsContent("lrc")}
          title={lyricFile?.name || "Karaoke"}
          artist={lyricResult?.language || "Lyrics"}
          onSave={async (lrcText: string) => {
            const parsed = parseLrcToLines(lrcText);
            if (parsed.length > 0) {
              setAdjustedLines(parsed);
            }
            setShowLrcEditor(false);
          }}
          onClose={() => setShowLrcEditor(false)}
        />
      </div>
    </div>
  );
}

function parseLrcToLines(lrc: string): LyricLineDetailed[] {
  const lines: LyricLineDetailed[] = [];
  const regex = /^\[(\d+):(\d+)\.(\d+)\]\s*(.+)$/;
  for (const raw of lrc.split("\n")) {
    const match = raw.trim().match(regex);
    if (!match) continue;
    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const frac = parseInt(match[3]);
    const text = match[4].trim();
    const start = mins * 60 + secs + frac / 100;
    const words = text.split(/\s+/).map((word, i) => ({
      word,
      start: start + i * 0.3,
      end: start + (i + 1) * 0.3 + 0.2,
    }));
    const end = words.length > 0 ? words[words.length - 1].end : start + 2;
    lines.push({ start, end, words });
  }
  return lines;
}

function fmtSrt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  currentTime: number,
  totalDur: number,
  lines: LyricLineDetailed[],
  editedLines: Record<number, string>,
) {
  ctx.fillStyle = "#0f0f1a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#22d3ee20";
  ctx.fillRect(0, 0, w, 60);
  ctx.strokeStyle = "#22d3ee40";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(w, 60);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Karaoke Export", w / 2, 38);

  const progress = totalDur > 0 ? currentTime / totalDur : 0;
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(0, 58, w * progress, 2);

  if (lines.length === 0) return;

  const maxLines = 10;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].start && currentTime < lines[i].end) {
      activeIdx = i;
      break;
    }
    if (currentTime < lines[i].start) {
      activeIdx = Math.max(0, i - 1);
      break;
    }
  }
  if (activeIdx < 0) activeIdx = lines.length - 1;

  const startIdx = Math.max(0, Math.min(activeIdx - 2, lines.length - maxLines));
  const visibleLines = lines.slice(startIdx, startIdx + maxLines);
  const lineHeight = 42;
  const topY = 100;

  visibleLines.forEach((line, vi) => {
    const actualIdx = startIdx + vi;
    const y = topY + vi * lineHeight;

    if (actualIdx === activeIdx) {
      const lineDur = line.end - line.start || 0.01;
      const frac = Math.min(1, (currentTime - line.start) / lineDur);

      ctx.fillStyle = "#22d3ee20";
      ctx.fillRect(40, y - 4, w - 80, lineHeight - 4);

      const text = editedLines[actualIdx] ?? line.words.map((w) => w.word).join(" ");
      ctx.textAlign = "center";

      const words = line.words;
      let wordActiveIdx = -1;
      for (let wi = 0; wi < words.length; wi++) {
        if (currentTime >= words[wi].start && currentTime < words[wi].end) {
          wordActiveIdx = wi;
          break;
        }
      }

      ctx.font = "bold 28px Inter, sans-serif";
      if (wordActiveIdx >= 0) {
        const before = words.slice(0, wordActiveIdx).map((w) => w.word).join(" ");
        const active = words[wordActiveIdx].word;
        const after = words.slice(wordActiveIdx + 1).map((w) => w.word).join(" ");
        ctx.fillStyle = "#22d3ee";
        ctx.fillText(`${before} ${active} ${after}`, w / 2, y + 22);
      } else {
        ctx.fillStyle = "#22d3ee";
        ctx.fillText(text, w / 2, y + 22);
      }
    } else {
      const text = editedLines[actualIdx] ?? line.words.map((w) => w.word).join(" ");
      ctx.textAlign = "center";
      ctx.font = "20px Inter, sans-serif";
      ctx.fillStyle = actualIdx < activeIdx ? "#6b7280" : "#374151";
      ctx.fillText(text, w / 2, y + 18);
    }
  });
}
