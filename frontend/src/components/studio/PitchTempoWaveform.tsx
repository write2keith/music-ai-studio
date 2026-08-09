"use client";

import { useRef, useEffect, useCallback } from "react";

interface Props {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

export function PitchTempoWaveform({
  buffer,
  currentTime,
  duration,
  isPlaying,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#181825";
    ctx.fillRect(0, 0, w, h);

    const channelData = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / w));
    const midY = h / 2;
    const ampScale = h * 0.45;

    // Draw waveform bars
    for (let i = 0; i < w; i++) {
      const start = i * step;
      let maxVal = 0;
      let minVal = 0;
      for (let j = 0; j < step && start + j < channelData.length; j++) {
        const v = channelData[start + j];
        if (v > maxVal) maxVal = v;
        if (v < minVal) minVal = v;
      }

      const x = i;
      const barH = (maxVal - minVal) * ampScale;
      const barTop = midY - maxVal * ampScale;

      ctx.fillStyle = "#34d399";
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, barTop, 1, Math.max(1, barH));
    }

    ctx.globalAlpha = 1;

    // Played region overlay
    if (duration > 0) {
      const playedX = (currentTime / duration) * w;
      ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
      ctx.fillRect(0, 0, playedX, h);
    }

    // Playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * w;
      ctx.strokeStyle = isPlaying ? "#22d3ee" : "#22d3ee88";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      // Playhead dot
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.arc(playheadX, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += w / 10) {
      ctx.beginPath();
      ctx.moveTo(Math.round(i), 0);
      ctx.lineTo(Math.round(i), h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.stroke();
  }, [buffer, currentTime, duration, isPlaying]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      drawWaveform();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawWaveform]);

  const getTimeFromEvent = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      const time = getTimeFromEvent(e.clientX);
      onSeek(time);
    },
    [getTimeFromEvent, onSeek]
  );

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const time = getTimeFromEvent(e.clientX);
      onSeek(time);
    };
    const handleUp = () => {
      isDragging.current = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [getTimeFromEvent, onSeek]);

  return (
    <div ref={containerRef} className="relative w-full h-24 rounded-lg overflow-hidden border border-daw-border cursor-pointer group">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
      />
      {/* Hover time tooltip handled via onMouseMove on canvas */}
      <div className="absolute bottom-1 left-2 text-[10px] text-daw-text-dim tabular-nums font-daw-mono pointer-events-none">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
