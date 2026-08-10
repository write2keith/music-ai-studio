"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Loader2, AlertCircle, Music, FileAudio, Play, Pause, Square, SkipForward, SkipBack, ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { GuitarTabResult, TabNote, CalibrationResponse } from "@/lib/api";
import TabRenderer from "@/components/TabRenderer";
import { FretboardView } from "@/components/studio/FretboardView";
import { PianoView } from "@/components/studio/PianoView";
import { getNotesAtTime } from "@/lib/note-synth";

const StaveRenderer = dynamic(
  () => import("@/components/studio/StaveRenderer").then((m) => m.StaveRenderer),
  { ssr: false, loading: () => <div className="h-40 rounded-lg bg-daw-surface-3/30 animate-pulse" /> },
);

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

type ViewMode = "tab" | "staff";

function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "00:00.00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function nameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(\d+)$/i);
  if (!match) return -1;
  const noteIdx = NOTE_NAMES_SHORT.findIndex((n) => n.toUpperCase() === match[1].toUpperCase());
  if (noteIdx < 0) return -1;
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIdx;
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  currentTime: number,
  isPlaying: boolean,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#181825";
  ctx.fillRect(0, 0, w, h);

  const channelData = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / w));
  const midY = h / 2;
  const ampScale = h * 0.45;

  for (let i = 0; i < w; i++) {
    const start = i * step;
    let maxVal = 0;
    let minVal = 0;
    for (let j = 0; j < step && start + j < channelData.length; j++) {
      const v = channelData[start + j];
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    }
    const barH = (maxVal - minVal) * ampScale;
    const barTop = midY - maxVal * ampScale;
    ctx.fillStyle = "#a855f7";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(i, barTop, 1, Math.max(1, barH));
  }
  ctx.globalAlpha = 1;

  const duration = buffer.duration;
  if (duration > 0) {
    const playedX = (currentTime / duration) * w;
    ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
    ctx.fillRect(0, 0, playedX, h);

    const playheadX = (currentTime / duration) * w;
    ctx.strokeStyle = isPlaying ? "#22d3ee" : "#22d3ee88";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(playheadX, 6, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function GuitarTabPage() {
  // Upload state
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [tabFileUrl, setTabFileUrl] = useState<string>("");
  const [tabTuning, setTabTuning] = useState("standard");
  const [tabGenerating, setTabGenerating] = useState(false);
  const [tabError, setTabError] = useState("");
  const [tabResult, setTabResult] = useState<GuitarTabResult | null>(null);

  // Correction mode
  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editNoteValue, setEditNoteValue] = useState("");
  const [midiExportUrl, setMidiExportUrl] = useState("");

  // Playback engine
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tab");

  // Refs for playback (avoids stale closures in RAF)
  const isPlayingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const rafRef = useRef(0);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDragging = useRef(false);

  const notes = (tabResult?.notes ?? []) as TabNote[];
  const duration = audioBuffer ? audioBuffer.duration : (tabResult?.duration_secs ?? 0);
  const activeNotes = getNotesAtTime(notes, currentTime);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // ── Decode original audio file for playback ──
  const decodeAudio = useCallback(async (file: File): Promise<AudioBuffer | null> => {
    try {
      const ctx = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      ctx.close();
      return buffer;
    } catch {
      return null;
    }
  }, []);

  // Auto-decode when result arrives
  useEffect(() => {
    if (tabResult && tabResult.notes.length > 0 && !audioBuffer && tabFile) {
      setLoadingAudio(true);
      decodeAudio(tabFile).then((buf) => {
        if (buf) setAudioBuffer(buf);
        setLoadingAudio(false);
      });
    }
  }, [tabResult, audioBuffer, tabFile, decodeAudio]);

  // ── Waveform drawing ──
  const drawWaveformFrame = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioBuffer) return;
    drawWaveform(canvas, audioBuffer, currentTime, isPlaying);
  }, [audioBuffer, currentTime, isPlaying]);

  useEffect(() => {
    drawWaveformFrame();
  }, [drawWaveformFrame]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawWaveformFrame());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawWaveformFrame]);

  // ── Playback engine ──
  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const startRafLoop = useCallback(() => {
    stopRaf();
    const tick = () => {
      if (!isPlayingRef.current || !audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current + startOffsetRef.current;
      const clamped = Math.min(elapsed, duration);
      setCurrentTime(clamped);
      if (clamped >= duration - 0.05) {
        stopSource();
        stopRaf();
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, stopSource, stopRaf]);

  const play = useCallback(async () => {
    if (!audioBuffer) return;

    // Create or resume AudioContext (handles autoplay restrictions)
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    stopSource();
    stopRaf();

    const offset = currentTime;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    source.connect(gain);
    gain.connect(ctx.destination);

    source.start(0, offset);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = offset;

    setIsPlaying(true);
    isPlayingRef.current = true;

    source.onended = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(0);
    };

    startRafLoop();
  }, [audioBuffer, currentTime, stopSource, stopRaf, startRafLoop]);

  const pause = useCallback(() => {
    stopSource();
    stopRaf();
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [stopSource, stopRaf]);

  const stopPlayback = useCallback(() => {
    stopSource();
    stopRaf();
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentTime(0);
  }, [stopSource, stopRaf]);

  const seek = useCallback(async (time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    setCurrentTime(clamped);

    if (isPlayingRef.current) {
      stopSource();
      stopRaf();

      const ctx = audioCtxRef.current;
      if (!ctx || !audioBuffer) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      source.connect(gain);
      gain.connect(ctx.destination);

      source.start(0, clamped);
      sourceRef.current = source;
      startTimeRef.current = ctx.currentTime;
      startOffsetRef.current = clamped;

      source.onended = () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(0);
      };
      startRafLoop();
    }
  }, [duration, audioBuffer, stopSource, stopRaf, startRafLoop]);

  const handleWaveformSeek = useCallback(
    (clientX: number) => {
      const canvas = waveformCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seek(ratio * duration);
    },
    [duration, seek]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSource();
      stopRaf();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
    };
  }, [stopSource, stopRaf]);

  // ── API handlers ──
  function setFile(f: File) {
    // Revoke old URL
    if (tabFileUrl) URL.revokeObjectURL(tabFileUrl);
    setTabFile(f);
    setTabFileUrl(URL.createObjectURL(f));
    setTabResult(null);
    setTabError("");
    setAudioBuffer(null);
    stopPlayback();
  }

  async function handleGuitarTab() {
    if (!tabFile) return;
    setTabGenerating(true);
    setTabError("");
    setTabResult(null);
    setAudioBuffer(null);
    stopPlayback();
    try {
      const data = await api.tools.guitarTab(tabFile, tabTuning);
      setTabResult(data);
    } catch (err) {
      setTabError(err instanceof Error ? err.message : String(err));
    }
    setTabGenerating(false);
  }

  async function submitNoteCorrection(tool: string, originalNote: TabNote, correctedName: string) {
    const correctedPitch = nameToMidi(correctedName);
    if (correctedPitch < 0) return;
    try {
      const cal = await api.tools.submitFeedback({
        store_id: "default",
        tool,
        action: "corrected",
        note_pitch: correctedPitch,
        note_name: correctedName,
        original_pitch: originalNote.pitch,
        original_note: originalNote.note_name,
        detail: `User corrected ${originalNote.note_name} to ${correctedName}`,
      });
      setCalibration(cal);
      setEditingNoteIdx(null);
      setEditNoteValue("");
    } catch {}
  }

  async function exportMidi(
    midiNotes: { pitch: number; velocity: number; start_time: number; end_time: number }[],
  ) {
    try {
      const res = await api.tools.midiExport(midiNotes, 120);
      setMidiExportUrl(res.url);
    } catch {}
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && tabResult) {
        e.preventDefault();
        isPlayingRef.current ? pause() : play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [play, pause, tabResult]);

  const hasResult = tabResult !== null && tabResult.notes.length > 0;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Music className="w-5 h-5 text-orange-400" />
          Guitar Tab Generator
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Generate Guitar-Pro-style tablature from any melody or solo audio.
          Detects notes and maps them to optimal string/fret positions for standard EADGBE tuning.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* Upload area */}
        <div
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("tab-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            tabFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-orange-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="tab-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          {tabFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{tabFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a melody recording (guitar solo, bass line, vocal melody)</p>
            </div>
          )}
        </div>

        {/* Tuning select */}
        <div>
          <label className="block text-xs font-medium text-daw-text-dim mb-1.5">Tuning</label>
          <select
            value={tabTuning}
            onChange={(e) => setTabTuning(e.target.value)}
            className="w-full bg-daw-surface-3 border border-daw-border rounded-lg px-3 py-2 text-sm text-daw-text outline-none focus:border-orange-400/50"
          >
            <option value="standard">Standard (EADGBE)</option>
            <option value="drop_d">Drop D (DADGBE)</option>
            <option value="open_g">Open G (DGDGBD)</option>
            <option value="open_d">Open D (DADF#AD)</option>
            <option value="open_e">Open E (EBEG#BE)</option>
            <option value="dadgad">DADGAD</option>
            <option value="half_step_down">Half Step Down (Eb)</option>
            <option value="drop_c">Drop C (CGCFAD)</option>
            <option value="c_standard">C Standard</option>
          </select>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleGuitarTab}
          disabled={tabGenerating || !tabFile}
        >
          {tabGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating tab...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Generate Tablature
            </>
          )}
        </Button>

        {tabError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {tabError}
          </div>
        )}

        {/* Audio loading indicator */}
        {loadingAudio && (
          <div className="flex items-center gap-2 text-xs text-daw-text-dim">
            <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
            Decoding audio...
          </div>
        )}

        {/* Result + Player */}
        <AnimatePresence>
          {hasResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4 border border-orange-400/20 rounded-xl p-4"
            >
              {/* Header bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="accent" className="text-[10px]">
                    {tabResult.note_count} notes
                  </Badge>
                  <span className="text-xs text-daw-text-dim">
                    {formatTime(tabResult.duration_secs)} &middot; {tabResult.tuning.join("")}
                  </span>
                  {calibration && calibration.total_corrections > 0 && (
                    <span className="text-[10px] text-daw-green">
                      accuracy {Math.round(calibration.accuracy * 100)}%
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCorrectionMode(!correctionMode)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    correctionMode
                      ? "border-amber-400/50 text-amber-300 bg-amber-400/10"
                      : "border-daw-border text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  {correctionMode ? "Done Correcting" : "Correct Notes"}
                </button>
              </div>

              {/* Audio Player & Timeline Scrubber */}
              {audioBuffer && (
                <div className="space-y-3">
                  {/* Waveform scrubber */}
                  <div
                    className="relative w-full h-20 rounded-lg overflow-hidden border border-daw-border cursor-pointer group"
                    onMouseDown={(e) => {
                      isDragging.current = true;
                      handleWaveformSeek(e.clientX);
                    }}
                  >
                    <canvas ref={waveformCanvasRef} className="w-full h-full" />
                    <div className="absolute bottom-1 left-2 text-[10px] text-daw-text-dim tabular-nums font-mono pointer-events-none">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>

                  <DragSeekHandler
                    isDragging={isDragging}
                    onSeek={(x) => handleWaveformSeek(x)}
                  />

                  {/* Transport buttons */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => seek(0)}
                      className="p-1.5 rounded-lg text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                      onClick={isPlayingRef.current ? pause : play}
                      className="p-2 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors"
                    >
                      {isPlayingRef.current ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={stopPlayback}
                      className="p-2 rounded-full bg-daw-surface-3 border border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim transition-colors"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => seek(duration)}
                      className="p-1.5 rounded-lg text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-daw-text-dim ml-2 font-mono">
                      Space to play/pause
                    </span>
                  </div>
                </div>
              )}
              {!audioBuffer && !loadingAudio && (
                <div className="flex items-center gap-2 text-xs text-daw-text-dim">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  Loading audio...
                </div>
              )}

              {/* Interactive Fretboard */}
              <div className="space-y-1">
                <h3 className="text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold flex items-center gap-1">
                  <Music className="w-3 h-3" /> Fretboard (EADGBE)
                </h3>
                <FretboardView
                  tuning={tabResult.tuning}
                  activeNotes={activeNotes}
                  allNotes={notes}
                />
              </div>

              {/* Piano Keyboard */}
              <div className="space-y-1">
                <h3 className="text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold flex items-center gap-1">
                  <Music className="w-3 h-3" /> Piano Keyboard
                </h3>
                <PianoView activeNotes={activeNotes} allNotes={notes} />
              </div>

              {/* Tab / Staff toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("tab")}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    viewMode === "tab"
                      ? "border-violet-400/50 text-violet-300 bg-violet-400/10"
                      : "border-daw-border text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  Tablature
                </button>
                <button
                  onClick={() => setViewMode("staff")}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    viewMode === "staff"
                      ? "border-cyan-400/50 text-cyan-300 bg-cyan-400/10"
                      : "border-daw-border text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  <ListMusic className="w-3 h-3 inline mr-1" />
                  Grand Staff
                </button>
              </div>

              {/* Notation view */}
              {viewMode === "tab" ? (
                <div className="overflow-x-auto">
                  <TabRenderer
                    notes={notes}
                    tuning={tabResult.tuning}
                    durationSecs={tabResult.duration_secs}
                    currentTime={currentTime}
                    isPlaying={isPlayingRef.current}
                  />
                </div>
              ) : (
                <StaveRenderer notes={notes} durationSecs={tabResult.duration_secs} />
              )}

              {/* Note list */}
              <details className="cursor-pointer">
                <summary className="text-xs text-daw-text-dim hover:text-daw-text transition-colors">
                  Show all notes ({tabResult.note_count})
                </summary>
                <div className="max-h-48 overflow-y-auto space-y-0.5 mt-2 pr-1">
                  {notes.map((note, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-daw-surface-3/50 text-xs">
                      <span className="w-12 text-daw-text-dim tabular-nums">{note.start_time.toFixed(2)}s</span>
                      {correctionMode && editingNoteIdx === i ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitNoteCorrection("guitar-tab", note, editNoteValue);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="text"
                            value={editNoteValue}
                            onChange={(e) => setEditNoteValue(e.target.value)}
                            placeholder={note.note_name}
                            className="w-12 bg-daw-surface-2 border border-amber-400/30 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300 outline-none"
                            autoFocus
                          />
                          <button type="submit" className="text-[10px] text-daw-green hover:underline">ok</button>
                          <button type="button" onClick={() => { setEditingNoteIdx(null); setEditNoteValue(""); }} className="text-[10px] text-daw-text-dim hover:underline">cancel</button>
                        </form>
                      ) : (
                        <span className="font-mono font-bold text-orange-300 w-10">{note.note_name}</span>
                      )}
                      <span className="text-daw-text-dim">String {note.string_name}</span>
                      <span className="font-mono font-bold text-daw-text">Fret {note.fret}</span>
                      {correctionMode && editingNoteIdx !== i && (
                        <button
                          onClick={() => { setEditingNoteIdx(i); setEditNoteValue(note.note_name); }}
                          className="text-[10px] text-amber-400 hover:text-amber-300"
                        >
                          edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>

              {/* Export */}
              <div className="flex gap-2">
                <button
                  onClick={() => exportMidi(notes.map((n) => ({ pitch: n.pitch, velocity: n.velocity, start_time: n.start_time, end_time: n.end_time })))}
                  className="daw-button daw-button-secondary text-xs inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Export MIDI
                </button>
                {midiExportUrl && (
                  <a href={midiExportUrl} download className="text-[10px] text-daw-green hover:underline self-center">
                    Download .mid
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DragSeekHandler({
  isDragging,
  onSeek,
}: {
  isDragging: React.MutableRefObject<boolean>;
  onSeek: (clientX: number) => void;
}) {
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onSeek(e.clientX);
    };
    const handleUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, onSeek]);
  return null;
}
