"use client";

import { useState, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Square,
  ZoomIn,
  ZoomOut,
  Upload,
  Music,
  AlertCircle,
  Scissors,
  Sparkles,
  Gauge,
  GitMerge,
  Wand2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AudioPlayer } from "@/components/AudioPlayer";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatTime, formatSize } from "@/lib/utils";
import type { AudioResult, EffectsParams } from "@/lib/types";

export default function WaveformEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [regionStart, setRegionStart] = useState<number | null>(null);
  const [regionEnd, setRegionEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editResult, setEditResult] = useState<AudioResult | null>(null);
  const [editLabel, setEditLabel] = useState<string>("");

  const [showEffects, setShowEffects] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const [effects, setEffects] = useState<EffectsParams>({
    reverb_room_size: 0,
    reverb_wet: 0,
    delay_seconds: 0,
    delay_feedback: 0,
    delay_mix: 0,
    eq_low_gain: 0,
    eq_mid_gain: 0,
    eq_high_gain: 0,
    compressor_threshold: 0,
    compressor_ratio: 4,
    gain_db: 0,
    speed_factor: 1,
  });

  const [speedFactor, setSpeedFactor] = useState(1);
  const [mergeFiles, setMergeFiles] = useState<FileList | null>(null);

  const loadFile = useCallback((f: File) => {
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setPlaying(false);
    setCurrentTime(0);
    setRegionStart(null);
    setRegionEnd(null);
    setError(null);
    setEditResult(null);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f);
    },
    [loadFile]
  );

  // Audio playback controls
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  // Canvas rendering and interaction will be basic for now
  // The full wavesurfer.js implementation requires CDN loading which complicates SSR
  // This provides the UI shell with working edit actions

  const handleEditAction = useCallback(
    async (action: string) => {
      if (!file) {
        setError("Load a file first");
        return;
      }

      setLoading(true);
      setError(null);
      setEditResult(null);

      try {
        let result: AudioResult;

        switch (action) {
          case "trim":
            result = await api.edit.trim(file, 0, regionEnd || 5);
            break;
          case "crop":
            if (regionStart === null || regionEnd === null) {
              throw new Error("Make a selection first");
            }
            result = await api.edit.trim(file, regionStart, regionEnd);
            break;
          case "normalize":
            result = await api.edit.normalize(file, -1.0);
            break;
          case "fade-in":
            result = await api.edit.fade(file, 2, 0);
            break;
          case "fade-out":
            result = await api.edit.fade(file, 0, 2);
            break;
          case "effects":
            result = await api.edit.effects(file, effects);
            break;
          default:
            throw new Error("Unknown action");
        }

        setEditResult(result);
        setEditLabel(action);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Edit operation failed"
        );
      } finally {
        setLoading(false);
      }
    },
    [file, regionStart, regionEnd, effects]
  );

  const handleSpeedApply = useCallback(async () => {
    if (!file) return;
    setShowSpeed(false);
    setLoading(true);
    setError(null);
    try {
      const result = await api.edit.speed(file, speedFactor);
      setEditResult(result);
      setEditLabel("speed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Speed change failed");
    } finally {
      setLoading(false);
    }
  }, [file, speedFactor]);

  const handleMergeApply = useCallback(async () => {
    if (!mergeFiles || mergeFiles.length < 2) return;
    setShowMerge(false);
    setLoading(true);
    setError(null);
    try {
      const result = await api.edit.merge(Array.from(mergeFiles));
      setEditResult(result);
      setEditLabel("merge");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Merge failed");
    } finally {
      setLoading(false);
    }
  }, [mergeFiles]);

  return (
    <div className="space-y-4">
      {/* File Loader */}
      {!fileUrl ? (
        <div
          className="card flex flex-col items-center justify-center gap-4 py-16 cursor-pointer hover:border-violet-500/30 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <input
            type="file"
            accept=".wav,.mp3,.flac,.ogg,.m4a"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
            className="hidden"
            id="editor-file"
          />
          <label htmlFor="editor-file" className="cursor-pointer text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
              <Music className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold mb-1">Audio Editor</h2>
            <p className="text-zinc-500 text-sm">
              Click to upload or drag and drop an audio file
            </p>
          </label>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="card !p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" />
                  Open
                  <input
                    type="file"
                    accept=".wav,.mp3,.flac,.ogg,.m4a"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) loadFile(f);
                    }}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-zinc-500 truncate max-w-[180px]">
                  {file?.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors"
                >
                  {playing ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={stop}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <Square className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-zinc-400 ml-2 min-w-[80px]">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.min(z * 1.5, 100))}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Waveform placeholder */}
          <div className="card !p-0 overflow-hidden">
            <div className="h-40 bg-zinc-950 flex items-center justify-center relative">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
              <audio
                ref={audioRef}
                src={fileUrl}
                onTimeUpdate={() => {
                  if (audioRef.current) {
                    setCurrentTime(audioRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (audioRef.current) {
                    setDuration(audioRef.current.duration);
                  }
                }}
                onEnded={() => setPlaying(false)}
                className="hidden"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-xs text-zinc-700">
                  Waveform &mdash; drag to select, then use edit tools below
                </p>
              </div>
            </div>

            {/* Selection display */}
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-t border-zinc-800">
              <span className="text-xs text-zinc-600">Selection:</span>
              <span className="text-xs font-mono text-green-400">
                {regionStart !== null ? formatTime(regionStart) : "--"}
              </span>
              <span className="text-xs text-zinc-600">-</span>
              <span className="text-xs font-mono text-green-400">
                {regionEnd !== null ? formatTime(regionEnd) : "--"}
              </span>
            </div>
          </div>

          {/* Edit Actions */}
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleEditAction("trim")}
                disabled={loading || !file}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                Cut Outside
              </button>
              <button
                onClick={() => handleEditAction("crop")}
                disabled={loading || !file || regionStart === null || regionEnd === null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                Keep Selection
              </button>
              <button
                onClick={() => handleEditAction("fade-in")}
                disabled={loading || !file}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                Fade In
              </button>
              <button
                onClick={() => handleEditAction("fade-out")}
                disabled={loading || !file}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                Fade Out
              </button>
              <button
                onClick={() => handleEditAction("normalize")}
                disabled={loading || !file}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                Normalize
              </button>
              <button
                onClick={() => setShowSpeed(true)}
                disabled={loading || !file}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg text-sm transition-colors"
              >
                <Gauge className="w-3.5 h-3.5" />
                Speed
              </button>
              <button
                onClick={() => setShowMerge(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge
              </button>
              <button
                onClick={() => setShowEffects(!showEffects)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Effects
              </button>
            </div>
          </div>

          {/* Effects Panel */}
          {showEffects && (
            <div className="card grid grid-cols-2 md:grid-cols-3 gap-4">
              <EffectSlider
                label="Reverb Room"
                value={effects.reverb_room_size}
                onChange={(v) => setEffects({ ...effects, reverb_room_size: v })}
                max={100}
                suffix="%"
              />
              <EffectSlider
                label="Reverb Wet"
                value={effects.reverb_wet}
                onChange={(v) => setEffects({ ...effects, reverb_wet: v })}
                max={100}
                suffix="%"
              />
              <EffectSlider
                label="Delay Time"
                value={effects.delay_seconds}
                onChange={(v) => setEffects({ ...effects, delay_seconds: v })}
                max={200}
                step={0.05}
                suffix="s"
                divisor={100}
              />
              <EffectSlider
                label="Delay Mix"
                value={effects.delay_mix}
                onChange={(v) => setEffects({ ...effects, delay_mix: v })}
                max={100}
                suffix="%"
              />
              <EffectSlider
                label="Delay Feedback"
                value={effects.delay_feedback}
                onChange={(v) => setEffects({ ...effects, delay_feedback: v })}
                max={100}
                suffix="%"
              />
              <EffectSlider
                label="EQ Low"
                value={effects.eq_low_gain}
                onChange={(v) => setEffects({ ...effects, eq_low_gain: v })}
                min={-12}
                max={12}
                suffix="dB"
              />
              <EffectSlider
                label="EQ Mid"
                value={effects.eq_mid_gain}
                onChange={(v) => setEffects({ ...effects, eq_mid_gain: v })}
                min={-12}
                max={12}
                suffix="dB"
              />
              <EffectSlider
                label="EQ High"
                value={effects.eq_high_gain}
                onChange={(v) => setEffects({ ...effects, eq_high_gain: v })}
                min={-12}
                max={12}
                suffix="dB"
              />
              <EffectSlider
                label="Comp Threshold"
                value={effects.compressor_threshold}
                onChange={(v) => setEffects({ ...effects, compressor_threshold: v })}
                min={-60}
                max={0}
                suffix="dB"
              />
              <EffectSlider
                label="Comp Ratio"
                value={effects.compressor_ratio}
                onChange={(v) => setEffects({ ...effects, compressor_ratio: v })}
                min={1}
                max={20}
                suffix=":1"
              />
              <EffectSlider
                label="Output Gain"
                value={effects.gain_db}
                onChange={(v) => setEffects({ ...effects, gain_db: v })}
                min={-12}
                max={12}
                suffix="dB"
              />
              <button
                onClick={() => handleEditAction("effects")}
                disabled={loading || !file}
                className="col-span-full btn-primary"
              >
                Apply Effects Chain
              </button>
            </div>
          )}
        </>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingSpinner text="Processing..." />}

      {/* Edit Result */}
      {editResult && (
        <div className="card">
          <AudioPlayer
            url={editResult.url}
            label={`${editLabel.charAt(0).toUpperCase() + editLabel.slice(1)} Result`}
          />
        </div>
      )}

      {/* Speed Dialog */}
      {showSpeed && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Change Speed</h3>
            <div className="mb-4">
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={speedFactor}
                onChange={(e) => setSpeedFactor(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <p className="text-center text-sm text-zinc-400 mt-1">
                {speedFactor.toFixed(2)}x
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSpeedApply} className="btn-primary flex-1">
                Apply
              </button>
              <button
                onClick={() => setShowSpeed(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Dialog */}
      {showMerge && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Merge Stems</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Select 2+ audio files to merge
            </p>
            <div className="mb-4">
              <input
                type="file"
                accept=".wav,.mp3"
                multiple
                onChange={(e) => setMergeFiles(e.target.files)}
                className="input"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleMergeApply} className="btn-primary flex-1">
                Merge
              </button>
              <button
                onClick={() => setShowMerge(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EffectSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
  divisor = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  divisor?: number;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value * divisor}
        onChange={(e) => onChange(Number(e.target.value) / divisor)}
        className="w-full accent-violet-500"
      />
      <p className="text-xs text-zinc-600">
        {divisor === 1 ? value : (value * divisor).toFixed(0)}{suffix}
      </p>
    </div>
  );
}
