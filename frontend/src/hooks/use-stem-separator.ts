"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface StemResult {
  all_stems: Record<string, string>;
  duration_secs: number;
}

interface StemJobState {
  status: "idle" | "uploading" | "processing" | "completed" | "failed";
  progress: string;
  progressPct: number;
  result: StemResult | null;
}

const STEM_TO_TRACK_MAP: Record<string, { name: string; color: string }> = {
  vocals: { name: "Vocals", color: "rose" },
  drums: { name: "Drums", color: "green" },
  bass: { name: "Bass", color: "cyan" },
  other: { name: "Other", color: "violet" },
  guitar: { name: "Guitar", color: "yellow" },
  piano: { name: "Piano", color: "blue" },
};

const POLL_INTERVAL = 2000;
const MAX_ATTEMPTS = 180;
const ESTIMATED_SECS = 45;

const emptyState: StemJobState = {
  status: "idle",
  progress: "",
  progressPct: 0,
  result: null,
};

export function useStemSeparator() {
  const [job, setJob] = useState<StemJobState>(emptyState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const separate = useCallback(async (file: File) => {
    if (processingRef.current) return;
    processingRef.current = true;

    cleanup();
    setJob({ status: "uploading", progress: "Uploading...", progressPct: 5, result: null });

    const fd = new FormData();
    fd.append("file", file);

    let jobId: string;
    try {
      const res = await fetch("/api/tools/vocal-prep", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      jobId = data.job_id;
    } catch (err: any) {
      processingRef.current = false;
      setJob({ status: "failed", progress: err.message, progressPct: 0, result: null });
      return;
    }

    setJob({ status: "processing", progress: "Separating stems...", progressPct: 10, result: null });

    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/tools/vocal-prep/${jobId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Status ${res.status}`);
        }
        const data = await res.json();

        if (data.status === "completed") {
          cleanup();
          processingRef.current = false;
          setJob({
            status: "completed",
            progress: "",
            progressPct: 100,
            result: {
              all_stems: data.all_stems || {},
              duration_secs: data.duration_secs || 0,
            },
          });
        } else if (attempts >= MAX_ATTEMPTS) {
          cleanup();
          processingRef.current = false;
          setJob({ status: "failed", progress: "Timed out waiting for stem separation", progressPct: 0, result: null });
        } else {
          const elapsed = attempts * POLL_INTERVAL / 1000;
          const pct = Math.min(95, 10 + (elapsed / ESTIMATED_SECS) * 85);
          setJob({
            status: "processing",
            progress: `Separating stems... (${Math.round(elapsed)}s)`,
            progressPct: Math.round(pct),
            result: null,
          });
        }
      } catch (err: any) {
        if (attempts >= MAX_ATTEMPTS) {
          cleanup();
          processingRef.current = false;
          setJob({ status: "failed", progress: err.message || "Stem separation failed", progressPct: 0, result: null });
        }
      }
    }, POLL_INTERVAL);
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    processingRef.current = false;
    setJob(emptyState);
  }, [cleanup]);

  const getTrackAssignments = useCallback(
    (result: StemResult | null): Array<{ stemKey: string; url: string; name: string; color: string }> => {
      if (!result) return [];
      const entries: Array<{ stemKey: string; url: string; name: string; color: string }> = [];
      for (const [key, url] of Object.entries(result.all_stems)) {
        const mapped = STEM_TO_TRACK_MAP[key] || { name: key.charAt(0).toUpperCase() + key.slice(1), color: "orange" };
        entries.push({ stemKey: key, url, name: mapped.name, color: mapped.color });
      }
      return entries;
    },
    [],
  );

  return { job, reset, separate, getTrackAssignments };
}
