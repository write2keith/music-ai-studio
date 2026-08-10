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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { LyricTranscribeResult } from "@/lib/api";

export default function LyricsPage() {
  const [lyricFile, setLyricFile] = useState<File | null>(null);
  const [lyricJobId, setLyricJobId] = useState("");
  const [lyricPolling, setLyricPolling] = useState(false);
  const [lyricTranscribing, setLyricTranscribing] = useState(false);
  const [lyricError, setLyricError] = useState("");
  const [lyricResult, setLyricResult] = useState<LyricTranscribeResult | null>(null);
  const lyricPollId = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lyricAudioUrl, setLyricAudioUrl] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editedLines, setEditedLines] = useState<Record<number, string>>({});
  const [isolateVocals, setIsolateVocals] = useState(false);
  const rafRef = useRef<number>(0);
  const linesContainerRef = useRef<HTMLDivElement | null>(null);

  const handleFileSelect = useCallback((f: File) => {
    if (lyricAudioUrl) URL.revokeObjectURL(lyricAudioUrl);
    setLyricFile(f);
    setLyricResult(null);
    setLyricError("");
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setEditedLines({});
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

  const pollLyrics = useCallback((jobId: string) => {
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      try {
        const data = await api.tools.lyricTranscribeStatus(jobId) as LyricTranscribeResult & { error?: string };
        if (data.status === "completed" || (data.status === "failed" && data.full_text)) {
          setLyricResult(data);
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
          if (data.status === "failed") {
            setLyricError(data.error || "Transcription completed with errors");
          }
        } else if (data.status === "failed") {
          setLyricError(data.error || "Transcription failed");
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
        } else if (attempts >= 300) {
          setLyricError("Transcription timed out after 10 minutes");
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
        }
      } catch (err) {
        if (attempts >= 5) {
          const msg = err instanceof Error ? err.message : String(err);
          setLyricError(msg || "Transcription failed");
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
        }
      }
    }, 2000);
    lyricPollId.current = t;
  }, []);

  const handleLyricTranscribe = useCallback(async () => {
    if (!lyricFile) return;
    setLyricTranscribing(true);
    setLyricError("");
    setLyricResult(null);
    try {
      const data = await api.tools.lyricTranscribe(lyricFile, "auto", isolateVocals);
      setLyricJobId(data.job_id);
      setLyricPolling(true);
      pollLyrics(data.job_id);
    } catch (err) {
      setLyricError(err instanceof Error ? err.message : String(err));
      setLyricTranscribing(false);
    }
  }, [lyricFile, pollLyrics]);

  useEffect(() => {
    return () => {
      if (lyricPollId.current) clearInterval(lyricPollId.current);
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

  const activeLineIndex = (() => {
    if (!lyricResult?.lines?.length) return -1;
    const lines = lyricResult.lines;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime < lines[i].start) return Math.max(0, i - 1);
    }
    return lines.length - 1;
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

  const allLines = lyricResult?.lines ?? [];

  return (
    <div className="max-w-3xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-400" />
          Lyric Transcription
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Auto-transcribe lyrics with word-level timestamps. VAD strips silence, Whisper generates
          word-aligned lyrics for karaoke sync. Click any word to jump to that moment.
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
              {lyricPolling && (
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

        {/* Option: Demucs vocal isolation */}
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
              <div className="flex items-center justify-between">
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
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (lyricResult.txt_path) {
                        const a = document.createElement("a");
                        a.href = `/api/tools/lyrics/download/${encodeURIComponent(lyricResult.txt_path.split("/").pop() || "lyrics.txt")}`;
                        a.download = "lyrics.txt";
                        a.click();
                      } else {
                        const text = allLines
                          .map((line) => line.words.map((w) => w.word).join(" "))
                          .join("\n");
                        const blob = new Blob([text], { type: "text/plain" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = "lyrics.txt";
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }
                    }}
                    className="flex items-center gap-1 text-[10px] text-daw-text-dim hover:text-daw-text transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Save .txt
                  </button>
                  {lyricResult.lrc_path && (
                    <button
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/tools/lyrics/download/${encodeURIComponent(lyricResult.lrc_path.split("/").pop() || "lyrics.lrc")}`;
                        a.download = "lyrics.lrc";
                        a.click();
                      }}
                      className="flex items-center gap-1 text-[10px] text-daw-text-dim hover:text-daw-text transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Save .lrc
                    </button>
                  )}
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
      </div>
    </div>
  );
}
