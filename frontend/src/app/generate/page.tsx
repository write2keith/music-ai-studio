"use client";

import { useState } from "react";
import { Scissors, Upload, AlertCircle, Music } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AudioPlayer } from "@/components/AudioPlayer";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatSize } from "@/lib/utils";
import type { StemResult } from "@/lib/types";

const MODELS = [
  { value: "htdemucs", label: "htdemucs (best quality)" },
  { value: "htdemucs_ft", label: "htdemucs_ft (fine-tuned)" },
  { value: "htdemucs_6s", label: "htdemucs_6s (6 stems)" },
];

export default function SeparatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState("htdemucs");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StemResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.separate(file, model);
      setResult(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to separate stems"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
          <Scissors className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Separate Stems</h1>
        <p className="text-zinc-500">
          Split audio into vocals, drums, bass, and more
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Audio File
          </label>
          <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors">
            <input
              type="file"
              accept=".wav,.mp3,.flac,.ogg,.m4a"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-zinc-500" />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-200">{file.name}</p>
                <p className="text-xs text-zinc-500">{formatSize(file.size)}</p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Click to upload or drag and drop
              </p>
            )}
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="input"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !file}
          className="btn-primary"
        >
          {loading ? "Separating..." : "Separate Stems"}
        </button>
      </form>

      {loading && (
        <div className="mt-6">
          <LoadingSpinner text="Separating stems... this may take a few minutes" />
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <Music className="w-4 h-4 text-green-400" />
            Stems ({result.model})
          </h2>
          {Object.entries(result.stems)
            .sort()
            .map(([name, url]) => (
              <AudioPlayer
                key={name}
                url={url}
                label={name.charAt(0).toUpperCase() + name.slice(1)}
                compact
              />
            ))}
        </div>
      )}
    </div>
  );
}
