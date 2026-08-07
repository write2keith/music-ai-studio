"use client";

import { useRef, useEffect, useCallback } from "react";

interface PitchPoint {
  time: number;
  midi: number;
}

interface PitchGraphProps {
  refPitch: PitchPoint[];
  userPitch: PitchPoint[];
  playheadTime?: number;
  width?: number;
  height?: number;
}

const MIDI_MIN = 40;
const MIDI_MAX = 84;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function PitchGraph({ refPitch, userPitch, playheadTime, width = 600, height = 200 }: PitchGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const margin = { top: 16, right: 16, bottom: 20, left: 40 };
    const pw = width - margin.left - margin.right;
    const ph = height - margin.top - margin.bottom;

    const maxTime = refPitch.length > 0 ? refPitch[refPitch.length - 1].time : 1;

    const midiRange = MIDI_MAX - MIDI_MIN;
    const xScale = (t: number) => margin.left + (t / maxTime) * pw;
    const yScale = (midi: number) => margin.top + (1 - (midi - MIDI_MIN) / midiRange) * ph;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#2a2a3e";
    ctx.lineWidth = 0.5;
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      if (m % 12 === 0) {
        ctx.strokeStyle = "#3a3a4e";
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = "#252535";
        ctx.lineWidth = 0.3;
      }
      const y = yScale(m);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + pw, y);
      ctx.stroke();

      if (m % 12 === 0) {
        ctx.fillStyle = "#555";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`, margin.left - 4, y + 3);
      }
    }

    for (let t = 0; t <= maxTime; t += Math.max(1, Math.floor(maxTime / 8))) {
      const x = xScale(t);
      ctx.strokeStyle = "#2a2a3e";
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + ph);
      ctx.stroke();

      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${t.toFixed(1)}s`, x, margin.top + ph + 12);
    }

    const drawLine = (points: PitchPoint[], color: string, alpha: number = 1) => {
      if (points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let started = false;
      for (const p of points) {
        if (p.midi < 0) {
          started = false;
          continue;
        }
        const x = xScale(p.time);
        const y = yScale(Math.max(MIDI_MIN, Math.min(MIDI_MAX, p.midi)));
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawLine(refPitch, "#22d3ee", 0.5);
    drawLine(userPitch, "#a855f7", 0.8);

    if (playheadTime !== undefined && playheadTime >= 0) {
      const px = xScale(Math.min(playheadTime, maxTime));
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, margin.top);
      ctx.lineTo(px, margin.top + ph);
      ctx.stroke();
    }

    ctx.fillStyle = "#888";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("ref", margin.left + 4, margin.top + 12);
    ctx.fillStyle = "#22d3ee";
    ctx.fillText("ref", margin.left + 4, margin.top + 12);
    ctx.fillStyle = "#888";
    ctx.fillText("you", margin.left + 36, margin.top + 12);
    ctx.fillStyle = "#a855f7";
    ctx.fillText("you", margin.left + 36, margin.top + 12);
  }, [refPitch, userPitch, playheadTime, width, height, dpr]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg border border-daw-border"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
