"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Loader2, AlertCircle, Users, FileAudio,
  Upload, Check, Play, Pause, Mic, Music,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, LeadBackResult } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";

export default function LeadBackSplitPage() {
  const audioPlayer = useAudioPlayer();

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LeadBackResult | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setResult(null);
      setError("");
      setPreviewUrl(URL.createObjectURL(f));
    }
  }, [previewUrl]);

  const handleFileInput = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setResult(null);
    setError("");
    setPreviewUrl(URL.createObjectURL(f));
  };

  function togglePreview(e: React.MouseEvent) {
    e.stopPropagation();
    const a = previewRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setIsPreviewing(true); }
    else { a.pause(); setIsPreviewing(false); }
  }

  async function handleSplit() {
    if (!file) return;
    setProcessing(true);
    setError("");
    setResult(null);
    try {
      const data = await api.tools.leadBackSplit(file);
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setProcessing(false);
  }

  const isPlayingLead = result && audioPlayer.isCurrentUrl(result.lead_url) && audioPlayer.isPlaying;
  const isPlayingBacking = result && audioPlayer.isCurrentUrl(result.backing_url) && audioPlayer.isPlaying;

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Lead / Back Vocal Splitter
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Separate a mixed vocal track into lead vocals, backing vocals, and vocal instrumental.
          First isolates vocals with Demucs, then splits by energy analysis.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("lb-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            file
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="lb-file-input"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileInput(f);
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={togglePreview}
                className="p-1.5 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              >
                {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <FileAudio className="w-5 h-5 text-daw-green" />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-daw-text-dim">({formatSize(file.size)})</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop vocal track here (uses Demucs to isolate vocals first)</p>
            </div>
          )}
        </div>

        {previewUrl && (
        <audio
          ref={previewRef}
          src={previewUrl}
          onEnded={() => setIsPreviewing(false)}
          onPause={() => setIsPreviewing(false)}
          className="hidden"
        />
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={handleSplit}
          disabled={processing || !file}
        >
          {processing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Splitting vocals (Demucs + energy analysis)...</>
          ) : (
            <><Users className="w-4 h-4" /> Split Lead & Backing</>
          )}
        </Button>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-daw-green/20"
          >
            {/* Lead Vocals */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
              <button
                onClick={() => audioPlayer.toggle(result.lead_url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 flex items-center justify-center shrink-0 hover:from-purple-500/40 hover:to-violet-500/40 transition-all"
              >
                {isPlayingLead ? <Pause className="w-5 h-5 text-purple-400" /> : <Play className="w-5 h-5 text-purple-400 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Lead Vocals</span>
                  <Badge variant="accent">{Math.round(result.lead_ratio * 100)}% of audio</Badge>
                </div>
                <span className="text-[10px] text-daw-text-dim">Main vocal line (loudest/most prominent)</span>
              </div>
              <a href={result.lead_url} download="lead_vocals.wav" className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors">
                <Download className="w-4 h-4 text-daw-accent" />
              </a>
            </div>

            {/* Backing Vocals */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
              <button
                onClick={() => audioPlayer.toggle(result.backing_url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center shrink-0 hover:from-cyan-500/40 hover:to-blue-500/40 transition-all"
              >
                {isPlayingBacking ? <Pause className="w-5 h-5 text-cyan-400" /> : <Play className="w-5 h-5 text-cyan-400 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-daw-text">Backing Vocals</span>
                <span className="text-[10px] text-daw-text-dim block">Harmonies and background layers</span>
              </div>
              <a href={result.backing_url} download="backing_vocals.wav" className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors">
                <Download className="w-4 h-4 text-daw-accent" />
              </a>
            </div>

            {/* Vocal Instrumental */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <Music className="w-12 h-12 p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-daw-text">Vocal Instrumental</span>
                <span className="text-[10px] text-daw-text-dim block">Residual blend between lead and backing</span>
              </div>
              <a href={result.instrumental_url} download="vocal_instrumental.wav" className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors">
                <Download className="w-4 h-4 text-daw-accent" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
