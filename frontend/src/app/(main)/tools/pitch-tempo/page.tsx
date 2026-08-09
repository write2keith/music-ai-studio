"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Download,
  Loader2,
  AlertCircle,
  Upload,
  Music,
  FileAudio,
  RotateCcw,
  Activity,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PitchTempoWaveform, formatTime } from "@/components/studio/PitchTempoWaveform";
import { PitchTempoEngine } from "@/lib/pitch-tempo-engine";
import { api } from "@/lib/api";

export default function PitchTempoPage() {
  const engineRef = useRef<PitchTempoEngine | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "paused" | "stopped">("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [playPercent, setPlayPercent] = useState(0);

  // Sliders
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1.0);
  const [pendingPitch, setPendingPitch] = useState(0);
  const [pendingTempo, setPendingTempo] = useState(1.0);
  const pitchCommittedRef = useRef(0);
  const tempoCommittedRef = useRef(1.0);

  // Backend export
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [exportFilename, setExportFilename] = useState("");

  // ── Engine init / cleanup ────────────────────────────────────

  const getEngine = useCallback((): PitchTempoEngine => {
    if (!engineRef.current) {
      engineRef.current = new PitchTempoEngine();
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  // ── Load file ────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (f: File) => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);

      setFile(f);
      setIsReady(false);
      setIsPlaying(false);
      setPlaybackState("idle");
      setCurrentTime(0);
      setPlayPercent(0);
      setPitchSemitones(0);
      setTempoFactor(1.0);
      setPendingPitch(0);
      setPendingTempo(1.0);
      pitchCommittedRef.current = 0;
      tempoCommittedRef.current = 1.0;
      setExportUrl("");
      setExportError("");

      const url = URL.createObjectURL(f);
      setAudioUrl(url);

      try {
        const eng = getEngine();
        const dur = await eng.loadFile(f);
        setDuration(dur);
        setIsReady(true);

        eng.onTick = (time, percent) => {
          setCurrentTime(time);
          setPlayPercent(percent);
        };
        eng.onEnd = () => {
          setIsPlaying(false);
          setPlaybackState("stopped");
          setCurrentTime(0);
          setPlayPercent(0);
        };
      } catch (err) {
        setExportError("Failed to load audio file");
      }
    },
    [audioUrl, getEngine]
  );

  // ── Controls ─────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    const eng = getEngine();
    eng.play();
    setIsPlaying(true);
    setPlaybackState("playing");
  }, [getEngine]);

  const handlePause = useCallback(() => {
    const eng = getEngine();
    eng.pause();
    setIsPlaying(false);
    setPlaybackState("paused");
  }, [getEngine]);

  const handleStop = useCallback(() => {
    const eng = getEngine();
    eng.stop();
    setIsPlaying(false);
    setPlaybackState("stopped");
    setCurrentTime(0);
    setPlayPercent(0);
  }, [getEngine]);

  const handleSeek = useCallback(
    (time: number) => {
      const eng = getEngine();
      eng.seekTime(time);
      setCurrentTime(time);
      setPlayPercent(duration > 0 ? time / duration : 0);
    },
    [getEngine, duration]
  );

  const handleSkip = useCallback(
    (delta: number) => {
      const eng = getEngine();
      const newTime = Math.max(0, Math.min(duration, currentTime + delta));
      eng.seekTime(newTime);
      setCurrentTime(newTime);
      setPlayPercent(duration > 0 ? newTime / duration : 0);
    },
    [getEngine, currentTime, duration]
  );

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause]);

  // ── Apply pitch / tempo (on slider release) ──────────────────

  const applyPitch = useCallback(
    (value: number) => {
      const clamped = Math.round(value);
      setPitchSemitones(clamped);
      setPendingPitch(clamped);
      pitchCommittedRef.current = clamped;

      const eng = getEngine();
      eng.setPitch(clamped);

      if (clamped === 0 && tempoFactor === 1.0) {
        // reset state in engine
      }
    },
    [getEngine, tempoFactor]
  );

  const applyTempo = useCallback(
    (value: number) => {
      const clamped = Math.round(value);
      setTempoFactor(clamped);
      setPendingTempo(clamped);
      tempoCommittedRef.current = clamped;

      const eng = getEngine();
      eng.setTempo(clamped);
    },
    [getEngine]
  );

  // ── Reset to default ─────────────────────────────────────────

  const handleReset = useCallback(() => {
    const eng = getEngine();

    const wasPlaying = isPlaying;
    const pos = currentTime;

    eng.stop();

    setPitchSemitones(0);
    setTempoFactor(1.0);
    setPendingPitch(0);
    setPendingTempo(1.0);
    pitchCommittedRef.current = 0;
    tempoCommittedRef.current = 1.0;
    setExportUrl("");
    setExportError("");

    eng.setPitch(0);
    eng.setTempo(1.0);

    if (wasPlaying) {
      eng.seekTime(pos);
      setCurrentTime(pos);
      setPlayPercent(duration > 0 ? pos / duration : 0);
      eng.play();
      setIsPlaying(true);
      setPlaybackState("playing");
    } else {
      setCurrentTime(pos);
      setPlayPercent(duration > 0 ? pos / duration : 0);
    }
  }, [getEngine, isPlaying, currentTime, duration]);

  // ── Export to backend (non-realtime, for download) ───────────

  const handleExport = useCallback(async () => {
    if (!file) return;
    setIsExporting(true);
    setExportError("");
    setExportUrl("");

    try {
      const result = await api.tools.pitchTempo(file, pitchSemitones, tempoFactor);
      setExportUrl(result.url);
      setExportFilename(result.filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    }
    setIsExporting(false);
  }, [file, pitchSemitones, tempoFactor]);

  // ── Keyboard shortcuts ───────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!isReady) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSkip(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkip(5);
          break;
        case "KeyR":
          if (e.ctrlKey || e.metaKey) break;
          e.preventDefault();
          handleReset();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isReady, togglePlayPause, handleSkip, handleReset]);

  // ── Render ───────────────────────────────────────────────────

  const pitchLabel =
    pitchSemitones === 0
      ? "0 st"
      : `${pitchSemitones > 0 ? "+" : ""}${pitchSemitones} st`;
  const tempoLabel = `${Math.round(tempoFactor * 100)}%`;
  const isDefault = pitchSemitones === 0 && tempoFactor === 1.0;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Activity className="w-5 h-5 text-daw-accent" />
          Pitch & Tempo Playground
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Real-time pitch shifting and time-stretching powered by SoundTouch. Drop an audio file,
          adjust sliders, and preview changes instantly. <kbd className="px-1 text-[10px] bg-daw-surface-2 rounded border border-daw-border">Space</kbd> to toggle playback, arrow keys to skip.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* ── Drop zone ─────────────────────────────────────── */}
        <div
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) handleFileSelect(f);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => document.getElementById("pt-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            file
              ? "border-daw-accent/50 bg-daw-accent/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="pt-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="w-5 h-5 text-daw-accent" />
              <span className="text-sm font-medium">{file.name}</span>
              {!isReady && (
                <Loader2 className="w-4 h-4 animate-spin text-daw-accent" />
              )}
              {isReady && (
                <Badge variant="green" className="text-[10px]">
                  {duration.toFixed(1)}s
                </Badge>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">
                Drop an audio file to start tweaking
              </p>
              <p className="text-[10px] text-daw-text-dim">
                WAV, MP3, FLAC, OGG, M4A
              </p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isReady && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* ── Master Playback Controller ──────────────── */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-daw-surface-2/60 border border-daw-border">
                {/* Stop */}
                <button
                  onClick={handleStop}
                  className="p-2 rounded-lg text-daw-text-dim hover:text-daw-red hover:bg-daw-red/10 transition-colors"
                  title="Stop [Esc]"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                {/* Skip back */}
                <button
                  onClick={() => handleSkip(-5)}
                  className="p-2 rounded-lg text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                  title="Skip back 5s"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                {/* Play / Pause */}
                <button
                  onClick={togglePlayPause}
                  className={cn(
                    "p-3 rounded-full transition-all duration-200",
                    isPlaying
                      ? "text-daw-cyan bg-daw-cyan/10 hover:bg-daw-cyan/20 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                      : "text-daw-text hover:text-daw-accent hover:bg-daw-accent/10"
                  )}
                  title="Play / Pause [Space]"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                {/* Skip forward */}
                <button
                  onClick={() => handleSkip(5)}
                  className="p-2 rounded-lg text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                  title="Skip forward 5s"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Time readout */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-daw-surface-3/80 font-daw-mono text-sm tabular-nums">
                  <span className="text-daw-text">
                    {formatTime(currentTime)}
                  </span>
                  <span className="text-daw-text-dim">/</span>
                  <span className="text-daw-text-dim">
                    {formatTime(duration)}
                  </span>
                </div>

                <div className="flex-1" />

                {/* Reset button */}
                <button
                  onClick={handleReset}
                  disabled={isDefault && currentTime === 0}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors",
                    isDefault && currentTime === 0
                      ? "text-daw-text-dim cursor-not-allowed"
                      : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3"
                  )}
                  title="Reset to default [R]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              {/* ── Waveform ────────────────────────────────── */}
              <PitchTempoWaveform
                buffer={getEngine().buffer}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onSeek={handleSeek}
              />

              {/* ── Controls Panel: Pitch + Tempo ───────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pitch Shift */}
                <div className="p-4 rounded-xl bg-daw-surface-2/60 border border-daw-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-daw-text-muted uppercase tracking-wider">
                      Pitch Shift
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold font-daw-mono tabular-nums transition-colors",
                        pitchSemitones !== 0
                          ? "text-daw-accent"
                          : "text-daw-text-dim"
                      )}
                    >
                      {pitchLabel}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={pendingPitch}
                      onChange={(e) => setPendingPitch(Number(e.target.value))}
                      onMouseUp={() => applyPitch(pendingPitch)}
                      onTouchEnd={() => applyPitch(pendingPitch)}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer bg-daw-surface-3
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-daw-accent
                        [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.4)] [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
                        accent-daw-accent"
                    />
                    {/* Tick marks */}
                    <div className="flex justify-between mt-1 px-1">
                      {[-12, -6, 0, 6, 12].map((v) => (
                        <span
                          key={v}
                          className="text-[9px] text-daw-text-dim tabular-nums"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tempo */}
                <div className="p-4 rounded-xl bg-daw-surface-2/60 border border-daw-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-daw-text-muted uppercase tracking-wider">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Tempo
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold font-daw-mono tabular-nums transition-colors",
                        tempoFactor !== 1.0
                          ? "text-daw-cyan"
                          : "text-daw-text-dim"
                      )}
                    >
                      {tempoLabel}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={1}
                      value={Math.round(pendingTempo * 100)}
                      onChange={(e) =>
                        setPendingTempo(Number(e.target.value) / 100)
                      }
                      onMouseUp={() => applyTempo(pendingTempo)}
                      onTouchEnd={() => applyTempo(pendingTempo)}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer bg-daw-surface-3
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-daw-cyan
                        [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.4)] [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
                        accent-daw-cyan"
                    />
                    <div className="flex justify-between mt-1 px-1">
                      {[50, 87, 125, 162, 200].map((v) => (
                        <span
                          key={v}
                          className="text-[9px] text-daw-text-dim tabular-nums"
                        >
                          {v}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Export section ───────────────────────────── */}
              <div className="flex items-center gap-3 pt-2 border-t border-daw-border">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleExport}
                  disabled={isExporting || !isReady}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export with Settings
                    </>
                  )}
                </Button>

                {exportUrl && (
                  <a
                    href={exportUrl}
                    download={exportFilename}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-daw-green/10 border border-daw-green/20 text-daw-green text-sm font-medium hover:bg-daw-green/20 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                )}
              </div>

              {exportError && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {exportError}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
