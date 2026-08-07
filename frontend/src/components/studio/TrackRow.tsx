"use client";

import { useRef, useEffect } from "react";
import { Play, Pause, Mic, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrackData {
  id: string;
  name: string;
  color: string;
  audioUrl: string;
  audioBlob: Blob | null;
  isRecording: boolean;
  isArmed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  duration: number;
}

interface TrackRowProps {
  track: TrackData;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
  onVolumeChange: (v: number) => void;
  onNameChange: (name: string) => void;
  isPlaying: boolean;
  playheadTime: number;
}

const COLORS: Record<string, string> = {
  rose: "#f43f5e",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  violet: "#a855f7",
  orange: "#f97316",
  cyan: "#22d3ee",
};

export function TrackRow({
  track,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onVolumeChange,
  onNameChange,
  isPlaying,
  playheadTime,
}: TrackRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const waveformRef = useRef<Float32Array | null>(null);
  const color = COLORS[track.color] || COLORS.violet;

  useEffect(() => {
    if (!track.audioBlob) return;
    const url = URL.createObjectURL(track.audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
        const data = buffer.getChannelData(0);
        waveformRef.current = data;
        drawWaveform(data);
      } catch {}
    };
    reader.readAsArrayBuffer(track.audioBlob);

    return () => {
      URL.revokeObjectURL(url);
      ctx.close();
    };
  }, [track.audioBlob]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = track.muted ? 0 : track.volume;

    if (isPlaying && !track.muted) {
      const offset = playheadTime % (track.duration || 1);
      audio.currentTime = offset;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, playheadTime, track.muted, track.volume, track.duration]);

  function drawWaveform(data: Float32Array) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const step = Math.ceil(data.length / w);
    ctx.beginPath();
    ctx.strokeStyle = color + "99";
    ctx.lineWidth = 1;

    for (let i = 0; i < w; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx < data.length) {
          min = Math.min(min, data[idx]);
          max = Math.max(max, data[idx]);
        }
      }
      const y1 = ((1 - max) / 2) * h;
      const y2 = ((1 - min) / 2) * h;
      ctx.moveTo(i, y1);
      ctx.lineTo(i, y2);
    }
    ctx.stroke();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-colors group",
        track.isRecording ? "bg-red-500/10 border border-red-500/30" : "bg-daw-surface-2 hover:bg-daw-surface-3",
        track.muted && "opacity-50"
      )}
    >
      {/* Track color + name */}
      <div className="flex items-center gap-2 w-36 shrink-0">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <input
          value={track.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-transparent text-xs font-medium text-daw-text w-full outline-none border-b border-transparent focus:border-daw-border px-1"
        />
      </div>

      {/* Waveform */}
      <div className="flex-1 h-12 rounded bg-daw-surface-1 overflow-hidden relative">
        {track.audioBlob ? (
          <>
            <canvas ref={canvasRef} width={600} height={48} className="w-full h-full" />
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                style={{
                  left: `${((playheadTime % (track.duration || 1)) / (track.duration || 1)) * 100}%`,
                }}
              />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-daw-text-dim">
            {track.isArmed ? (
              <span className="text-red-400 animate-pulse">Ready to record...</span>
            ) : (
              "Drop audio here or arm to record"
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleArm}
          className={cn(
            "p-1.5 rounded transition-colors",
            track.isArmed ? "bg-red-500/20 text-red-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1"
          )}
          title="Arm for recording"
        >
          <Mic className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleSolo}
          className={cn(
            "p-1 rounded text-[10px] font-bold transition-colors w-7",
            track.solo ? "bg-yellow-500/20 text-yellow-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1"
          )}
          title="Solo"
        >
          S
        </button>

        <button
          onClick={onToggleMute}
          className={cn(
            "p-1 rounded text-[10px] font-bold transition-colors w-7",
            track.muted ? "bg-red-500/20 text-red-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1"
          )}
          title="Mute"
        >
          M
        </button>

        <div className="flex items-center gap-1 w-20">
          {track.muted ? (
            <VolumeX className="w-3 h-3 text-daw-text-dim" />
          ) : (
            <Volume2 className="w-3 h-3 text-daw-text-dim" />
          )}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={track.volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-1 accent-daw-accent"
          />
        </div>
      </div>
    </div>
  );
}
