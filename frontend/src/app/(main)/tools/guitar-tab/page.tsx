"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Loader2, AlertCircle, Music, Upload, Check, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { GuitarTabResult, TabNote, CalibrationResponse, TranscribeResult } from "@/lib/api";
import TabRenderer from "@/components/TabRenderer";

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

export default function GuitarTabPage() {
  const [tabFile, setTabFile] = useState<File | null>(null);
  const [tabTuning, setTabTuning] = useState("standard");
  const [tabGenerating, setTabGenerating] = useState(false);
  const [tabError, setTabError] = useState("");
  const [tabResult, setTabResult] = useState<GuitarTabResult | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editNoteValue, setEditNoteValue] = useState("");
  const [midiExportUrl, setMidiExportUrl] = useState<string>("");

  async function handleGuitarTab() {
    if (!tabFile) return;
    setTabGenerating(true);
    setTabError("");
    setTabResult(null);
    try {
      const data = await api.tools.guitarTab(tabFile, tabTuning);
      setTabResult(data);
    } catch (err) {
      setTabError(err instanceof Error ? err.message : String(err));
    }
    setTabGenerating(false);
  }

  async function submitNoteCorrection(
    tool: string,
    originalNote: TabNote,
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

  return (
    <div className="max-w-2xl">
      {/* Guitar Tab Generator */}
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
        <div
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) { setTabFile(f); setTabResult(null); setTabError(""); }
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
              if (f) { setTabFile(f); setTabResult(null); setTabError(""); }
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

        <AnimatePresence>
          {tabResult && tabResult.notes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4 border border-orange-400/20 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="accent" className="text-[10px]">
                    {tabResult.note_count} notes
                  </Badge>
                  <span className="text-xs text-daw-text-dim">
                    {formatDuration(tabResult.duration_secs)} &middot; {tabResult.tuning.join("")}
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

              <div className="overflow-x-auto">
                <TabRenderer
                  notes={tabResult.notes as TabNote[]}
                  tuning={tabResult.tuning}
                  durationSecs={tabResult.duration_secs}
                />
              </div>

              {/* Note list */}
              <details className="cursor-pointer">
                <summary className="text-xs text-daw-text-dim hover:text-daw-text transition-colors">
                  Show all notes ({tabResult.note_count})
                </summary>
                <div className="max-h-48 overflow-y-auto space-y-0.5 mt-2 pr-1">
                  {(tabResult.notes as TabNote[]).map((note, i) => (
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

              <div className="flex gap-2">
                <button
                  onClick={() => exportMidi((tabResult.notes as TabNote[]).map((n) => ({ pitch: n.pitch, velocity: n.velocity, start_time: n.start_time, end_time: n.end_time })))}
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
