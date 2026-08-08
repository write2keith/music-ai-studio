"use client";

import { useState, useCallback } from "react";
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
import type { PitchTempoResult } from "@/lib/api";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PitchTempoPage() {
  const [pitchTempoFile, setPitchTempoFile] = useState<File | null>(null);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1.0);
  const [pitchTempoAdjusting, setPitchTempoAdjusting] = useState(false);
  const [pitchTempoError, setPitchTempoError] = useState("");
  const [pitchTempoResult, setPitchTempoResult] = useState<PitchTempoResult | null>(null);

  async function handlePitchTempo() {
    if (!pitchTempoFile) return;
    setPitchTempoAdjusting(true);
    setPitchTempoError("");
    setPitchTempoResult(null);
    try {
      const data = await api.tools.pitchTempo(pitchTempoFile, pitchSemitones, tempoFactor);
      setPitchTempoResult(data);
    } catch (err) {
      setPitchTempoError(err instanceof Error ? err.message : String(err));
    }
    setPitchTempoAdjusting(false);
  }

  return (
    <div className="max-w-2xl">
      {/* Pitch & Tempo Adjustment */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-blue-400" />
          Pitch &amp; Tempo Adjustment
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Change pitch (up to +/-12 semitones) and tempo (50%-200%) to suit different practice needs.
          Great for learning songs in a different key or slowing down fast passages.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setPitchTempoFile(f); setPitchTempoResult(null); setPitchTempoError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("pitch-tempo-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            pitchTempoFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-blue-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="pitch-tempo-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setPitchTempoFile(f); setPitchTempoResult(null); setPitchTempoError(""); }
            }}
          />
          {pitchTempoFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{pitchTempoFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop an audio file here</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-daw-text-dim block mb-1">
              Pitch Shift: {pitchSemitones > 0 ? "+" : ""}{pitchSemitones} semitones
            </label>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={pitchSemitones}
              onChange={(e) => setPitchSemitones(Number(e.target.value))}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[10px] text-daw-text-dim mt-0.5">
              <span>-12</span>
              <span>0</span>
              <span>+12</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-daw-text-dim block mb-1">
              Tempo: {Math.round(tempoFactor * 100)}%
            </label>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={Math.round(tempoFactor * 100)}
              onChange={(e) => setTempoFactor(Number(e.target.value) / 100)}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[10px] text-daw-text-dim mt-0.5">
              <span>50%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handlePitchTempo}
          disabled={pitchTempoAdjusting || !pitchTempoFile}
        >
          {pitchTempoAdjusting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Apply Changes
            </>
          )}
        </Button>

        {pitchTempoError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {pitchTempoError}
          </div>
        )}

        <AnimatePresence>
          {pitchTempoResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-blue-400/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <Badge variant="accent">
                  <Check className="w-3 h-3" /> Ready
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-daw-text-dim">
                <span>Duration: {formatDuration(pitchTempoResult.duration_secs)}</span>
                <span>Pitch: {pitchSemitones !== 0 ? `${pitchSemitones > 0 ? "+" : ""}${pitchSemitones}st` : "unchanged"}</span>
                <span>Tempo: {Math.round(tempoFactor * 100)}%</span>
              </div>
              <a
                href={pitchTempoResult.url}
                download={pitchTempoResult.filename}
                className="daw-button daw-button-primary text-xs inline-flex"
              >
                <Download className="w-3.5 h-3.5" /> Download Adjusted Audio
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
