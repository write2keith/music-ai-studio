"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Loader2,
  AlertCircle,
  Mic,
  Upload,
  Check,
  Music,
  FileAudio,
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

  const pollLyrics = useCallback((jobId: string) => {
    const t = setInterval(async () => {
      try {
        const data = await api.tools.lyricTranscribeStatus(jobId);
        if (data.status === "completed") {
          setLyricResult(data);
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
        }
      } catch {
        setLyricError("Transcription failed");
        setLyricPolling(false);
        setLyricTranscribing(false);
        clearInterval(t);
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
      const data = await api.tools.lyricTranscribe(lyricFile);
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
      if (lyricPollId.current) {
        clearInterval(lyricPollId.current);
      }
    };
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-400" />
          Lyric Transcription
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Auto-transcribe lyrics from any track using Whisper speech-to-text.
          Upload a separated vocal stem or a full song (vocals auto-separated).
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setLyricFile(f); setLyricResult(null); setLyricError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
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
              if (f) { setLyricFile(f); setLyricResult(null); setLyricError(""); }
            }}
          />
          {lyricFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
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
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {lyricError}
          </div>
        )}

        <AnimatePresence>
          {lyricResult && lyricResult.lyrics.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-emerald-400/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <Badge variant="green">
                  {lyricResult.lyrics.length} lines
                </Badge>
                {lyricResult.language && (
                  <span className="text-xs text-daw-text-dim">Language: {lyricResult.language}</span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {lyricResult.lyrics.map((line, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 hover:bg-daw-surface-3/80 transition-colors text-xs"
                  >
                    <span className="w-14 text-daw-text-dim tabular-nums shrink-0 pt-0.5">
                      {line.start.toFixed(1)}s
                    </span>
                    <span className="flex-1 text-daw-text">{line.text}</span>
                    <span className="text-[10px] text-daw-text-dim shrink-0">
                      {Math.round(line.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              {lyricResult.full_text && (
                <div className="p-3 rounded-lg bg-daw-surface-2/50 text-sm text-daw-text leading-relaxed italic border-l-2 border-emerald-400/30">
                  {lyricResult.full_text}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
