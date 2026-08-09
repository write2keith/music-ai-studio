"use client";

import { useState, useRef, useEffect } from "react";
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
import { api } from "@/lib/api";

export default function VocalRemoverPage() {
  const [removerFile, setRemoverFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removerJobId, setRemoverJobId] = useState("");
  const [removerStatus, setRemoverStatus] = useState("");
  const [removerError, setRemoverError] = useState("");
  const removerPollId = useRef<NodeJS.Timeout | null>(null);

  async function handleVocalRemove() {
    if (!removerFile) return;
    setRemoving(true);
    setRemoverStatus("");
    setRemoverError("");
    try {
      const data = await api.tools.vocalRemove(removerFile);
      setRemoverJobId(data.filename.replace("instrumental_", "").replace(".wav", ""));
      setRemoverStatus("processing");
      pollRemover(data.filename.replace("instrumental_", "").replace(".wav", ""));
    } catch (err) {
      setRemoverError(err instanceof Error ? err.message : "Failed to start vocal removal");
      setRemoverStatus("failed");
      setRemoving(false);
    }
  }

  async function pollRemover(jobId: string) {
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      try {
        const s = await api.tools.vocalRemoveStatus(jobId);
        if (s.instrumental_ready) {
          setRemoverStatus("ready");
          setRemoving(false);
          clearInterval(t);
        } else if (attempts >= 300) {
          setRemoverError("Vocal removal timed out after 10 minutes");
          setRemoverStatus("failed");
          setRemoving(false);
          clearInterval(t);
        }
      } catch {
        if (attempts >= 300) {
          setRemoverError("Vocal removal timed out — server may be overloaded");
          setRemoverStatus("failed");
          setRemoving(false);
          clearInterval(t);
        }
      }
    }, 2000);
    removerPollId.current = t;
  }

  useEffect(() => {
    return () => {
      if (removerPollId.current) clearInterval(removerPollId.current);
    };
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-amber-400" />
          Vocal Remover
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Remove vocals from any song — get clean instrumental backing tracks and isolated vocals.
          Background harmonies are preserved in the instrumental.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer.files[0];
            if (f) { setRemoverFile(f); setRemoverStatus(""); }
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => document.getElementById("remover-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            removerFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-amber-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="remover-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setRemoverFile(f); setRemoverStatus(""); }
            }}
          />
          {removerFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{removerFile.name}</span>
              {removerStatus === "processing" && (
                <span className="flex items-center gap-1 text-yellow-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Separating...
                </span>
              )}
              {removerStatus === "ready" && (
                <span className="text-daw-green text-xs">Ready</span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a song here to remove vocals</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleVocalRemove}
          disabled={removing || !removerFile}
        >
          {removing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Removing Vocals...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Remove Vocals
            </>
          )}
        </Button>

        {removerError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {removerError}
          </div>
        )}

        <AnimatePresence>
          {removerStatus === "ready" && removerJobId && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-2"
            >
              <div className="flex gap-2">
                <a
                  href={`/api/tools/vocal-remove/${removerJobId}/instrumental`}
                  download
                  className="flex-1 daw-button daw-button-primary text-xs text-center py-2"
                >
                  <Download className="w-3.5 h-3.5 inline mr-1" />
                  Download Instrumental
                </a>
                <a
                  href={`/api/tools/vocal-remove/${removerJobId}/vocals`}
                  download
                  className="flex-1 daw-button daw-button-secondary text-xs text-center py-2"
                >
                  <Download className="w-3.5 h-3.5 inline mr-1" />
                  Download Vocals
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
