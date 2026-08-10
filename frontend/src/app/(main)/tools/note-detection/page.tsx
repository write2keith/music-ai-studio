"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Loader2,
  AlertCircle,
  Mic,
  Music,
  Upload,
  Check,
  Edit2,
  FileAudio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { TranscribeResult, TranscribeNote, CalibrationResponse, TabNote } from "@/lib/api";
import { PitchGraph } from "@/components/PitchGraph";

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function nameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(\d+)$/i);
  if (!match) return -1;
  const noteIdx = NOTE_NAMES_SHORT.findIndex((n) => n.toUpperCase() === match[1].toUpperCase());
  if (noteIdx < 0) return -1;
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIdx;
}

export default function NoteDetectionPage() {
  const [transcribeFile, setTranscribeFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMethod, setTranscribeMethod] = useState<"fft" | "polyphonic" | "cqt" | "ml">("fft");
  const [transcribeError, setTranscribeError] = useState("");
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editNoteValue, setEditNoteValue] = useState("");
  const [midiExportUrl, setMidiExportUrl] = useState<string>("");

  async function handleTranscribe() {
    if (!transcribeFile) return;
    setTranscribing(true);
    setTranscribeError("");
    setTranscribeResult(null);

    try {
      const data = await api.tools.transcribe(transcribeFile, transcribeMethod);
      setTranscribeResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTranscribeError(msg || "Network error");
    }
    setTranscribing(false);
  }

  async function submitNoteCorrection(
    tool: string,
    originalNote: TranscribeNote | TabNote,
    correctedName: string,
  ) {
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

  async function loadCalibration() {
    try {
      const cal = await api.tools.getCalibration("default");
      setCalibration(cal);
    } catch {}
  }

  async function exportMidi(
    notes: { pitch: number; velocity: number; start_time: number; end_time: number }[],
  ) {
    try {
      const res = await api.tools.midiExport(notes, 120);
      setMidiExportUrl(res.url);
    } catch {}
  }

  useEffect(() => { loadCalibration(); }, []);

  return (
    <div className="max-w-2xl">
      {/* Note Transcriber */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-violet-400" />
          Instrument Note Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Analyze an instrument stem to detect MIDI notes with timing.
          FFT for single-note, Polyphonic for chords, CQT for musical scale accuracy, ML for dense polyphony.
        </p>

        <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-daw-surface-2 w-fit">
          {(["fft", "polyphonic", "cqt", "ml"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setTranscribeMethod(m);
                setTranscribeResult(null);
                setTranscribeError("");
              }}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                transcribeMethod === m
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-daw-text-muted hover:text-daw-text"
              )}
            >
              {m === "fft" ? "Mono (FFT)" : m === "polyphonic" ? "Poly" : m === "cqt" ? "CQT" : "ML"}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith("audio/") || /\.(wav|mp3|m4a|flac|ogg)$/i.test(f.name)) {
              setTranscribeFile(f);
              setTranscribeResult(null);
              setTranscribeError("");
            }
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("transcribe-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            transcribeFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-violet-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="transcribe-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setTranscribeFile(f);
                setTranscribeResult(null);
                setTranscribeError("");
              }
            }}
          />
          {transcribeFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{transcribeFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a stem here (guitar, bass, piano) or click to browse</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleTranscribe}
          disabled={transcribing || !transcribeFile}
        >
          {transcribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing notes...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Detect Notes
            </>
          )}
        </Button>

        {transcribeError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {transcribeError}
          </div>
        )}
      </div>

      {/* Transcribe Result */}
      <AnimatePresence>
        {transcribeResult && transcribeResult.notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-violet-400/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  <Mic className="w-3 h-3" /> {transcribeResult.note_count} notes
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatDuration(transcribeResult.duration_secs)} &middot; {transcribeResult.method.toUpperCase()}
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

            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {transcribeResult.notes.slice(0, 50).map((note: TranscribeNote, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 text-xs"
                >
                  <span className="w-14 text-daw-text-dim tabular-nums">
                    {note.start_time.toFixed(2)}s
                  </span>
                  {correctionMode && editingNoteIdx === i ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitNoteCorrection("transcribe", note, editNoteValue);
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
                        <span className="w-10 font-mono font-bold text-daw-accent">
                          {note.note_name}
                        </span>
                      )}
                      <span className="text-daw-text-dim tabular-nums">
                        MIDI {note.pitch}
                      </span>
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-daw-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-daw-accent transition-all"
                            style={{ width: `${(note.end_time - note.start_time) * 60}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-daw-text-dim tabular-nums w-10 text-right">
                        {(note.end_time - note.start_time).toFixed(2)}s
                      </span>
                      {correctionMode && editingNoteIdx !== i && (
                        <button
                          onClick={() => { setEditingNoteIdx(i); setEditNoteValue(note.note_name); }}
                          className="text-[10px] text-amber-400 hover:text-amber-300 shrink-0"
                          title="Correct this note"
                        >
                          edit
                        </button>
                      )}
                    </div>
                  ))}
                  {transcribeResult.notes.length > 50 && (
                    <p className="text-[10px] text-daw-text-dim text-center py-1">
                      +{transcribeResult.notes.length - 50} more notes
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => exportMidi(transcribeResult.notes)}
                    className="daw-button daw-button-secondary text-xs inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Export MIDI
                  </button>
                  {midiExportUrl && (
                    <a
                      href={midiExportUrl}
                      download
                      className="text-[10px] text-daw-green hover:underline self-center"
                    >
                      Download
                    </a>
                  )}
                </div>
              </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
