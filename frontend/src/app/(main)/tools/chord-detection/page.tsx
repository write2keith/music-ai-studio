"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  AlertCircle,
  Music,
  FileAudio,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { ChordDetectResult, ChordEvent, CalibrationResponse } from "@/lib/api";

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChordDetectionPage() {
  const [chordFile, setChordFile] = useState<File | null>(null);
  const [chordDetecting, setChordDetecting] = useState(false);
  const [chordError, setChordError] = useState("");
  const [chordResult, setChordResult] = useState<ChordDetectResult | null>(null);
  const [detectMethod, setDetectMethod] = useState<"harmonic" | "beat_sync" | "ensemble" | "cnn" | "resnet" | "template">("harmonic");

  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingChordIdx, setEditingChordIdx] = useState<number | null>(null);
  const [editChordValue, setEditChordValue] = useState("");

  const [audioUrl, setAudioUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chordListRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!chordFile) return;
    const url = URL.createObjectURL(chordFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [chordFile]);

  const activeChordIdx = useCallback((): number => {
    if (!chordResult) return -1;
    for (let i = chordResult.chords.length - 1; i >= 0; i--) {
      const c = chordResult.chords[i];
      if (currentTime >= c.start_time) return i;
    }
    return -1;
  }, [chordResult, currentTime]);

  const idx = activeChordIdx();

  useEffect(() => {
    if (idx < 0 || !chordListRef.current) return;
    const row = activeRowRef.current.get(idx);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [idx]);

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  }

  function handleSeek(time: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }

  function handlePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function handleSkip(offset: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + offset));
  }

  async function handleChordDetect() {
    if (!chordFile) return;
    setChordDetecting(true);
    setChordError("");
    setChordResult(null);
    try {
      const data = await api.tools.chordDetect(chordFile, detectMethod);
      setChordResult(data);
      setDuration(data.duration_secs);
    } catch (err) {
      setChordError(err instanceof Error ? err.message : String(err));
    }
    setChordDetecting(false);
  }

  async function submitChordCorrection(originalChord: string, correctedChord: string) {
    try {
      const cal = await api.tools.submitFeedback({
        store_id: "default",
        tool: "chord-detect",
        action: "corrected_chord",
        original_chord: originalChord,
        corrected_chord: correctedChord,
        detail: `User corrected chord ${originalChord} to ${correctedChord}`,
      });
      setCalibration(cal);
      setEditingChordIdx(null);
      setEditChordValue("");
    } catch {}
  }

  return (
    <div className="max-w-2xl">
      {audioUrl && <audio ref={audioRef} src={audioUrl} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} preload="auto" />}

      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Music className="w-5 h-5 text-cyan-400" />
          Chord Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Detect chords as the song plays. Ideal for learning songs, memorizing progressions, and teaching.
          Drop a separated instrument stem or a full mix.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) { setChordFile(f); setChordResult(null); setChordError(""); setCurrentTime(0); setIsPlaying(false); }
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("chord-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            chordFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2",
          )}
        >
          <input
            id="chord-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setChordFile(f); setChordResult(null); setChordError(""); setCurrentTime(0); setIsPlaying(false); }
            }}
          />
          {chordFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{chordFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a song or instrument stem here</p>
            </div>
          )}
        </div>

        {/* Detection method selector */}
        {chordFile && (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-daw-text-dim">Detection Method</label>
            <div className="grid grid-cols-3 gap-1">
              {([
                { value: "harmonic", label: "Harmonic", desc: "HPSS + CENS" },
                { value: "beat_sync", label: "Beat Sync", desc: "PYIN + beats" },
                { value: "ensemble", label: "Ensemble", desc: "3-way vote" },
                { value: "cnn", label: "CNN", desc: "Deep model" },
                { value: "resnet", label: "ResNet", desc: "Residual CNN" },
                { value: "template", label: "Template", desc: "CQT Viterbi" },
              ] as const).map((m) => (
                <button
                  key={m.value}
                  onClick={() => setDetectMethod(m.value)}
                  className={cn(
                    "px-2 py-1.5 rounded-md text-xs font-medium transition-all border text-center",
                    detectMethod === m.value
                      ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border",
                  )}
                >
                  <div>{m.label}</div>
                  <div className="text-[8px] opacity-60 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={handleChordDetect}
          disabled={chordDetecting || !chordFile}
        >
          {chordDetecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Detecting chords...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Detect Chords
            </>
          )}
        </Button>

        {chordError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {chordError}
          </div>
        )}

        <AnimatePresence>
          {chordResult && chordResult.chords.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-cyan-400/20 rounded-xl p-4"
            >
              {/* Transport bar */}
              <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-daw-surface-2">
                <button
                  onClick={() => handleSkip(-5)}
                  className="text-daw-text-dim hover:text-daw-text transition-colors"
                  title="Rewind 5s"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="p-1.5 rounded-full bg-daw-accent text-white hover:bg-daw-accent-glow transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  onClick={() => handleSkip(5)}
                  className="text-daw-text-dim hover:text-daw-text transition-colors"
                  title="Forward 5s"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <span className="text-xs text-daw-text tabular-nums w-12 text-right">
                  {formatTime(currentTime)}
                </span>

                <div className="flex-1 relative">
                  <input
                    type="range"
                    min={0}
                    max={duration || chordResult.duration_secs}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      handleSeek(t);
                    }}
                    className="w-full h-2 appearance-none bg-transparent cursor-pointer
                      [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-daw-surface-3
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-daw-surface-3
                      [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  />
                  <div
                    className="absolute top-0 h-1 rounded-full bg-cyan-400/30 pointer-events-none"
                    style={{ width: `${(currentTime / (duration || chordResult.duration_secs || 1)) * 100}%` }}
                  />
                </div>

                <span className="text-xs text-daw-text-dim tabular-nums w-12">
                  {formatTime(duration || chordResult.duration_secs)}
                </span>
              </div>

              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="accent" className="text-[10px]">
                  {chordResult.chord_count} chords
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatTime(chordResult.duration_secs)}
                </span>
                {chordResult.method && (
                  <span className="text-[9px] text-daw-text-dim bg-daw-surface-2 px-1.5 py-0.5 rounded">
                    {chordResult.method}
                  </span>
                )}
                {calibration && calibration.chord_corrections > 0 && (
                  <span className="text-[10px] text-daw-green">
                    chord accuracy {Math.round(calibration.chord_accuracy * 100)}%
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => setCorrectionMode(!correctionMode)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    correctionMode
                      ? "border-amber-400/50 text-amber-300 bg-amber-400/10"
                      : "border-daw-border text-daw-text-dim hover:text-daw-text",
                  )}
                >
                  {correctionMode ? "Done Correcting" : "Correct Chords"}
                </button>
              </div>

              {/* Chord list */}
              <div ref={chordListRef} className="max-h-72 overflow-y-auto space-y-1 pr-1 scroll-smooth">
                {chordResult.chords.map((c: ChordEvent, i: number) => {
                  const isActive = i === idx;
                  return (
                    <div
                      key={i}
                      ref={(el) => { if (el) activeRowRef.current.set(i, el); }}
                      onClick={() => handleSeek(c.start_time)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-xs cursor-pointer transition-all duration-150",
                        isActive
                          ? "bg-cyan-400/10 border border-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.15)]"
                          : "bg-daw-surface-3/50 hover:bg-daw-surface-3 border border-transparent",
                      )}
                    >
                      <span className={cn(
                        "w-14 tabular-nums shrink-0 transition-colors",
                        isActive ? "text-cyan-300 font-medium" : "text-daw-text-dim",
                      )}>
                        {c.start_time.toFixed(1)}s
                      </span>
                      {correctionMode && editingChordIdx === i ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitChordCorrection(c.chord, editChordValue);
                          }}
                          className="flex items-center gap-1 flex-1"
                        >
                          <input
                            type="text"
                            value={editChordValue}
                            onChange={(e) => setEditChordValue(e.target.value)}
                            placeholder={c.chord}
                            className="w-24 bg-daw-surface-2 border border-amber-400/30 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300 outline-none"
                            autoFocus
                          />
                          <button type="submit" className="text-[10px] text-daw-green hover:underline">ok</button>
                          <button type="button" onClick={() => { setEditingChordIdx(null); setEditChordValue(""); }} className="text-[10px] text-daw-text-dim hover:underline">cancel</button>
                        </form>
                      ) : (
                        <span className={cn(
                          "flex-1 font-mono font-bold transition-colors",
                          isActive ? "text-cyan-200" : "text-cyan-300",
                        )}>{c.chord}</span>
                      )}
                      <span className="text-[10px] text-daw-text-dim">{c.notes}</span>
                      <div className="w-12 shrink-0">
                        <div className="h-1 rounded-full bg-daw-surface-2 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isActive ? "bg-cyan-300" : "bg-cyan-400",
                            )}
                            style={{ width: `${c.confidence * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-daw-text-dim w-10 text-right tabular-nums">
                        {(c.end_time - c.start_time).toFixed(1)}s
                      </span>
                      {correctionMode && editingChordIdx !== i && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingChordIdx(i); setEditChordValue(c.chord); }}
                          className="text-[10px] text-amber-400 hover:text-amber-300 shrink-0"
                        >
                          edit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
