"use client";

import { useState, useCallback } from "react";
import { Wand2, Music, Clock, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AudioPlayer } from "@/components/AudioPlayer";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { GenerationJob } from "@/lib/types";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) return;

      setLoading(true);
      setError(null);
      setJob(null);
      setPollCount(0);

      try {
        const result = await api.generate(prompt, duration);

        if (result.job_id) {
          setJob(result);

          const poll = setInterval(async () => {
            try {
              const status = await api.getGenerationStatus(result.job_id);
              setJob(status);
              setPollCount((c) => c + 1);

              if (
                status.status === "completed" ||
                status.status === "failed"
              ) {
                clearInterval(poll);
                setLoading(false);
              }

              if (pollCount > 120) {
                clearInterval(poll);
                setLoading(false);
                setError(
                  "Generation timed out after 2 minutes"
                );
              }
            } catch {
              clearInterval(poll);
              setLoading(false);
              setError("Failed to check generation status");
            }
          }, 2000);
        }
      } catch (err) {
        setLoading(false);
        setError(
          err instanceof ApiError ? err.message : "Failed to generate music"
        );
      }
    },
    [prompt, duration, pollCount]
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Generate Music</h1>
        <p className="text-zinc-500">
          Describe the music you want to create
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-zinc-400 mb-1.5">
            Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., upbeat electronic dance with synth bass and driving drums"
            rows={3}
            className="input resize-none"
            maxLength={1000}
            required
          />
          <p className="text-xs text-zinc-600 mt-1">{prompt.length}/1000</p>
        </div>

        <div>
          <label htmlFor="duration" className="block text-sm font-medium text-zinc-400 mb-1.5">
            Duration: {duration}s
          </label>
          <input
            id="duration"
            type="range"
            min={5}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
          <div className="flex justify-between text-xs text-zinc-600">
            <span>5s</span>
            <span>30s</span>
          </div>
        </div>

        <button type="submit" disabled={loading || !prompt.trim()} className="btn-primary">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              Generating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Wand2 className="w-4 h-4" />
              Generate
            </span>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {job && job.status === "processing" && (
        <div className="mt-6">
          <LoadingSpinner text="Generating music... this may take a minute" />
        </div>
      )}

      {job && job.status === "completed" && job.result && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <Music className="w-4 h-4 text-green-400" />
            Generation Complete
          </h2>
          <AudioPlayer url={job.result.url} label={job.result.filename} />
        </div>
      )}

      {job && job.status === "failed" && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Generation Failed</p>
            <p className="text-xs text-red-400/70 mt-0.5">{job.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
