"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Loader2,
  AlertCircle,
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
import type { ChordDetectResult, ChordEvent, CalibrationResponse } from "@/lib/api";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChordDetectionPage() {
  const [chordFile, setChordFile] = useState<File | null>(null);
  const [chordDetecting, setChordDetecting] = useState(false);
  const [chordError, setChordError] = useState("");
  const [chordResult, setChordResult] = useState<ChordDetectResult | null>(null);

  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingChordIdx, setEditingChordIdx] = useState<number | null>(null);
  const [editChordValue, setEditChordValue] = useState("");

  async function handleChordDetect() {
    if (!chordFile) return;
    setChordDetecting(true);
    setChordError("");
    setChordResult(null);
    try {
      const data = await api.tools.chordDetect(chordFile);
      setChordResult(data);
    } catch (err) {
      setChordError(err instanceof Error ? err.message : String(err));
    }
    setChordDetecting(false);
  }

  async function submitChordCorrection(
    originalChord: string,
    correctedChord: string,
  ) {
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

  async function loadCalibration() {
    try {
      const cal = await api.tools.getCalibration("default");
      setCalibration(cal);
    } catch {}
  }

  return (
    <div className="max-w-2xl">
      {/* Chord Detection */}
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
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) { setChordFile(f); setChordResult(null); setChordError(""); }
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("chord-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            chordFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="chord-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setChordFile(f); setChordResult(null); setChordError(""); }
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
              <div className="flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  {chordResult.chord_count} chords
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatDuration(chordResult.duration_secs)}
                </span>
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
                      : "border-daw-border text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  {correctionMode ? "Done Correcting" : "Correct Chords"}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {chordResult.chords.map((c: ChordEvent, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 text-xs">
                    <span className="w-14 text-daw-text-dim tabular-nums shrink-0">
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
                      <span className="flex-1 font-mono font-bold text-cyan-300">{c.chord}</span>
                    )}
                    <span className="text-[10px] text-daw-text-dim">{c.notes}</span>
                    <div className="w-12 shrink-0">
                      <div className="h-1 rounded-full bg-daw-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-400 transition-all"
                          style={{ width: `${c.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-daw-text-dim w-10 text-right tabular-nums">
                      {(c.end_time - c.start_time).toFixed(1)}s
                    </span>
                    {correctionMode && editingChordIdx !== i && (
                      <button
                        onClick={() => { setEditingChordIdx(i); setEditChordValue(c.chord); }}
                        className="text-[10px] text-amber-400 hover:text-amber-300 shrink-0"
                      >
                        edit
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
