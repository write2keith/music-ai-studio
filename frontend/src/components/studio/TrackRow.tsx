"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Mic, Volume2, VolumeX, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrackData {
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
  startOffset: number;
}

interface TrackRowProps {
  track: TrackData;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
  onVolumeChange: (v: number) => void;
  onNameChange: (name: string) => void;
  onFileLoad: (file: File) => void;
  onOffsetChange: (offset: number) => void;
  isPlaying: boolean;
  playheadTime: number;
  seekVersion: number;
  ctx: AudioContext | null;
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
  onFileLoad,
  onOffsetChange,
  isPlaying,
  playheadTime,
  seekVersion,
  ctx,
}: TrackRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<Float32Array | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startedRef = useRef(false);
  const color = COLORS[track.color] || COLORS.violet;

  useEffect(() => {
    if (!track.audioBlob || !ctx) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
        bufferRef.current = buffer;
        const data = buffer.getChannelData(0);
        waveformRef.current = data;
        drawWaveform(data);
      } catch {}
    };
    reader.readAsArrayBuffer(track.audioBlob);

    return () => { stopSource(); };
  }, [track.audioBlob, ctx]);

  useEffect(() => {
    if (!ctx) return;

    const localTime = playheadTime - track.startOffset;
    const shouldPlay = isPlaying && !track.muted && localTime >= 0 && localTime < (track.duration || 1);

    if (shouldPlay && !startedRef.current && bufferRef.current) {
      startSource(localTime);
    } else if (!shouldPlay && startedRef.current) {
      stopSource();
    }
  }, [isPlaying, playheadTime, track.muted, track.startOffset, track.duration, ctx]);

  // On seek: stop sources so playheadTime effect can restart at correct offset
  useEffect(() => {
    stopSource();
  }, [seekVersion]);

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = track.muted ? 0 : track.volume;
    }
  }, [track.muted, track.volume]);

  function startSource(offset: number) {
    if (!ctx || !bufferRef.current) return;
    stopSource();

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;

    const gain = ctx.createGain();
    gain.gain.value = track.muted ? 0 : track.volume;
    source.connect(gain);
    gain.connect(ctx.destination);

    source.start(0, offset);
    sourceRef.current = source;
    gainRef.current = gain;
    startedRef.current = true;

    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null;
        gainRef.current = null;
        startedRef.current = false;
      }
    };
  }

  function stopSource() {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    gainRef.current = null;
    startedRef.current = false;
  }

  useEffect(() => {
    return () => { stopSource(); };
  }, []);

  function drawWaveform(data: Float32Array) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    const w = canvas.width;
    const h = canvas.height;
    c.clearRect(0, 0, w, h);

    const step = Math.ceil(data.length / w);
    c.beginPath();
    c.strokeStyle = color + "99";
    c.lineWidth = 1;

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
      c.moveTo(i, y1);
      c.lineTo(i, y2);
    }
    c.stroke();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileLoad(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onFileLoad]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFileLoad(file);
    },
    [onFileLoad]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-colors group",
        track.isRecording ? "bg-red-500/10 border border-red-500/30" : "bg-daw-surface-2 hover:bg-daw-surface-3",
        track.muted && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2 w-36 shrink-0">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <input
          value={track.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-transparent text-xs font-medium text-daw-text w-full outline-none border-b border-transparent focus:border-daw-border px-1"
        />
      </div>

      <div
        className={cn(
          "flex-1 h-12 rounded bg-daw-surface-1 overflow-hidden relative transition-colors",
          isDragOver && "ring-1 ring-daw-accent bg-daw-accent/5"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        title="Click or drop audio file to load"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {track.audioBlob ? (
          <>
            <canvas ref={canvasRef} width={600} height={48} className="w-full h-full" />
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
                style={{
                  left: `${(Math.max(0, (playheadTime - track.startOffset)) / (track.duration || 1)) * 100}%`,
                }}
              />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[10px] text-daw-text-dim cursor-pointer">
            {track.isArmed ? (
              <span className="text-red-400 animate-pulse">Ready to record...</span>
            ) : (
              <span className="flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Drop audio here or arm to record
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={0}
          step={0.1}
          value={track.startOffset}
          onChange={(e) => onOffsetChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-12 bg-daw-surface-1 text-daw-text text-[10px] text-center rounded px-1 py-0.5 outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          title="Start offset (seconds)"
        />
        <span className="text-[9px] text-daw-text-dim">s</span>
      </div>

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
