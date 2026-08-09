"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Scissors, Upload, AlertCircle, Music, FileAudio, Loader2, Download, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatSize } from "@/lib/utils";
import type { StemResult, GenerationJob } from "@/lib/types";

const MODELS = [
  { value: "htdemucs", label: "htdemucs" },
  { value: "htdemucs_ft", label: "htdemucs ft" },
  { value: "htdemucs_6s", label: "htdemucs 6s" },
];

const stemColors: Record<string, string> = {
  vocals: "vocal",
  drums: "drum",
  bass: "bass",
  other: "other",
  piano: "piano",
  guitar: "orange",
};

export default function SeparatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState("htdemucs");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StemResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setStatus("Uploading...");

    try {
      const job = await api.separate(file, model);
      setStatus("Separating stems...");

      const MAX_POLLS = 300;
      let attempts = 0;

      const poll = async () => {
        attempts++;
        try {
          const jobResult = await api.getSeparationStatus(job.job_id);
          if (jobResult.status === "completed" && jobResult.result) {
            setResult(jobResult.result as StemResult);
            setLoading(false);
            setStatus("");
          } else if (jobResult.status === "failed") {
            setError(jobResult.error || "Separation failed");
            setLoading(false);
            setStatus("");
          } else if (attempts >= MAX_POLLS) {
            setError("Separation timed out. The job may still be running on the server.");
            setLoading(false);
            setStatus("");
          } else {
            const elapsed = Math.round((attempts * 2) / 60);
            setStatus(`Separating stems... ${elapsed > 0 ? `(${elapsed}m elapsed)` : `(${jobResult.status})`}`);
            pollRef.current = setTimeout(poll, 2000);
          }
        } catch {
          if (attempts >= MAX_POLLS) {
            setError("Separation timed out. The job may still be running on the server.");
            setLoading(false);
            setStatus("");
          } else {
            pollRef.current = setTimeout(poll, 2000);
          }
        }
      };
      pollRef.current = setTimeout(poll, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start separation");
      setLoading(false);
      setStatus("");
    }
  }, [file, model]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/")) setFile(f);
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-daw-accent/20 to-daw-cyan/20 flex items-center justify-center mx-auto mb-3">
          <Scissors className="w-7 h-7 text-daw-accent" />
        </div>
        <h1 className="text-2xl font-bold text-daw-text">Stem Separation</h1>
        <p className="text-sm text-daw-text-muted mt-1">
          Split audio into isolated stems using Meta Demucs
        </p>
      </div>

      {/* Upload & Configure */}
      <div className="glass rounded-2xl p-6 space-y-5">
        {/* File upload */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-daw-text-dim mb-3">
            Audio File
          </p>
          <label
            className="flex flex-col items-center justify-center gap-3 py-10 px-6 border-2 border-dashed border-daw-border rounded-xl cursor-pointer hover:border-daw-accent/50 hover:bg-daw-accent/5 transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".wav,.mp3,.flac,.ogg,.m4a"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            {file ? (
              <div className="text-center">
                <FileAudio className="w-10 h-10 text-daw-accent mx-auto mb-2" />
                <p className="text-sm font-medium text-daw-text">{file.name}</p>
                <p className="text-xs text-daw-text-muted mt-0.5">{formatSize(file.size)}</p>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-daw-text-dim" />
                <p className="text-sm text-daw-text-muted">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-daw-text-dim">
                  WAV, MP3, FLAC, OGG, M4A
                </p>
              </>
            )}
          </label>
        </div>

        {/* Model selector */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-daw-text-dim mb-2">
            Separation Model
          </p>
          <div className="flex gap-1.5">
            {MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => setModel(m.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  model === m.value
                    ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                    : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          disabled={loading || !file}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {status || "Separating stems..."}
            </>
          ) : (
            <>
              <Scissors className="w-4 h-4" />
              Separate Stems
            </>
          )}
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass rounded-xl p-8 text-center">
          <Loader2 className="w-8 h-8 text-daw-accent animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-daw-text">Separating stems...</p>
          <p className="text-xs text-daw-text-muted mt-1">This may take a few minutes</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass rounded-xl p-4 border-daw-red/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-daw-red shrink-0 mt-0.5" />
          <p className="text-sm text-daw-red">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-6 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Music className="w-4 h-4 text-daw-green" />
            <h2 className="text-sm font-semibold text-daw-text">Stems</h2>
            <Badge variant="cyan" className="ml-auto">{result.model}</Badge>
          </div>

          <div className="space-y-2">
            {Object.entries(result.stems)
              .sort()
              .map(([name, url], i) => (
                <StemPlayer
                  key={name}
                  name={name}
                  url={url}
                  mp3Url={result.mp3_stems?.[name]}
                  color={stemColors[name] || "other"}
                  index={i}
                />
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StemPlayer({
  name,
  url,
  mp3Url,
  color,
  index,
}: {
  name: string;
  url: string;
  mp3Url?: string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-daw-surface-2 border border-daw-border hover:border-daw-border-hover transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-daw-accent/20 to-daw-cyan/20 flex items-center justify-center shrink-0">
        <Music className="w-4 h-4 text-daw-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-daw-text capitalize">{name}</p>
          <Badge variant={color as any}>{name}</Badge>
        </div>
        <p className="text-xs text-daw-text-dim mt-0.5 flex items-center gap-1">
          <Volume2 className="w-3 h-3" />
          Click to play in your browser
        </p>
      </div>
      <div className="flex items-center gap-1">
        <a
          href={url}
          download
          className="flex items-center gap-1 px-2 py-1.5 bg-daw-surface-3 hover:bg-daw-border rounded-lg text-[10px] text-daw-text-dim hover:text-daw-text transition-colors font-medium"
        >
          WAV
        </a>
        {mp3Url && (
          <a
            href={mp3Url}
            download
            className="flex items-center gap-1 px-2 py-1.5 bg-daw-surface-3 hover:bg-daw-green/20 rounded-lg text-[10px] text-daw-green hover:text-daw-green transition-colors font-medium"
          >
            MP3
          </a>
        )}
      </div>
    </motion.div>
  );
}
