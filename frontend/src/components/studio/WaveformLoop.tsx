"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface WaveformLoopProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  loopA: number;
  loopB: number;
  onLoopAChange: (t: number) => void;
  onLoopBChange: (t: number) => void;
  onSeek: (t: number) => void;
  className?: string;
}

export function WaveformLoop({
  buffer,
  currentTime,
  duration,
  isPlaying,
  loopA,
  loopB,
  onLoopAChange,
  onLoopBChange,
  onSeek,
  className,
}: WaveformLoopProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"a" | "b" | "playhead" | null>(null);
  const waveformData = useRef<Float32Array | null>(null);

  const screenToTime = useCallback(
    (clientX: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !duration) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const timeToScreen = useCallback(
    (t: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !duration) return 0;
      return (t / duration) * rect.width;
    },
    [duration]
  );

  useEffect(() => {
    if (!buffer) return;
    const raw = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(raw.length / 2000));
    const peaks = new Float32Array(Math.ceil(raw.length / step));
    for (let i = 0; i < peaks.length; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, raw.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(raw[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    waveformData.current = peaks;
  }, [buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const mid = h / 2;
    const peaks = waveformData.current;

    ctx.clearRect(0, 0, w, h);

    const loopAX = timeToScreen(loopA);
    const loopBX = timeToScreen(loopB);

    // Draw loop region highlight
    if (loopA < loopB) {
      ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
      ctx.fillRect(loopAX, 0, loopBX - loopAX, h);
      ctx.fillStyle = "rgba(168, 85, 247, 0.15)";
      ctx.fillRect(loopAX, 0, loopBX - loopAX, h);
    }

    // Draw played region
    const playX = timeToScreen(currentTime);
    ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
    ctx.fillRect(0, 0, playX, h);

    // Draw waveform bars
    const barW = Math.max(1, w / peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const peakH = peaks[i] * mid * 0.9;

      if (x >= playX) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
      } else {
        ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
      }

      if (x >= loopAX && x <= loopBX) {
        ctx.fillStyle = "rgba(168, 85, 247, 0.7)";
      }

      ctx.fillRect(x, mid - peakH, Math.max(1, barW - 0.5), peakH * 2);
    }

    // Draw loop markers
    if (loopA > 0) {
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(loopAX, 0);
      ctx.lineTo(loopAX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // A marker handle
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.moveTo(loopAX, 0);
      ctx.lineTo(loopAX - 6, -8);
      ctx.lineTo(loopAX + 6, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(loopAX - 1, -15, 2, 10);
    }

    if (loopB < duration) {
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(loopBX, 0);
      ctx.lineTo(loopBX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // B marker handle
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.moveTo(loopBX, 0);
      ctx.lineTo(loopBX - 6, -8);
      ctx.lineTo(loopBX + 6, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(loopBX - 1, -15, 2, 10);
    }

    // Playhead
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(playX, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [buffer, currentTime, duration, loopA, loopB, timeToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleDown = (e: MouseEvent) => {
      const x = e.clientX;
      const t = screenToTime(x);

      const aX = timeToScreen(loopA);
      const bX = timeToScreen(loopB);

      if (Math.abs(x - aX - (canvas.getBoundingClientRect().left || 0)) < 10 && loopA > 0) {
        setDragging("a");
        e.preventDefault();
      } else if (Math.abs(x - bX - (canvas.getBoundingClientRect().left || 0)) < 10 && loopB < duration) {
        setDragging("b");
        e.preventDefault();
      } else {
        setDragging("playhead");
        onSeek(t);
      }
    };

    const handleMove = (e: MouseEvent) => {
      if (!dragging) return;
      const t = screenToTime(e.clientX);

      if (dragging === "a") {
        onLoopAChange(Math.max(0, Math.min(t, loopB - 0.1)));
      } else if (dragging === "b") {
        onLoopBChange(Math.min(duration, Math.max(t, loopA + 0.1)));
      } else if (dragging === "playhead") {
        onSeek(t);
      }
    };

    const handleUp = () => setDragging(null);

    canvas.addEventListener("mousedown", handleDown);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      canvas.removeEventListener("mousedown", handleDown);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, loopA, loopB, duration, screenToTime, timeToScreen, onSeek, onLoopAChange, onLoopBChange]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  };

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-24 rounded-lg cursor-pointer bg-daw-surface-2/50"
        />
        <div className="flex justify-between mt-1">
          <div className="flex gap-4 text-[10px] text-daw-text-dim font-mono">
            {loopA > 0 && (
              <span className="text-daw-accent">A: {formatTime(loopA)}</span>
            )}
            {loopB < duration && (
              <span className="text-daw-accent">B: {formatTime(loopB)}</span>
            )}
            {(loopA > 0 || loopB < duration) && (
              <span className="text-daw-accent/70">
                Loop: {formatTime(loopB - loopA)}
              </span>
            )}
          </div>
          <span className="text-[10px] text-daw-text-dim font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
