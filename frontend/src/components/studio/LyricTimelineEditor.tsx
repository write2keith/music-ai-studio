"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import type { LyricLineDetailed, LyricWord } from "@/lib/api";

interface LyricTimelineEditorProps {
  lines: LyricLineDetailed[];
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  onLinesUpdate: (lines: LyricLineDetailed[]) => void;
  onSeek: (time: number) => void;
  canRecalibrate: boolean;
}

export function LyricTimelineEditor({
  lines,
  currentTime,
  isPlaying,
  duration,
  onLinesUpdate,
  onSeek,
  canRecalibrate,
}: LyricTimelineEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [recalibrateMode, setRecalibrateMode] = useState(false);
  const [recalibrateIdx, setRecalibrateIdx] = useState(0);
  const recalRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const durationSafe = duration || (lines.length > 0 ? lines[lines.length - 1].end + 1 : 60);
  const PADDING = 60;
  const HEADER_H = 28;
  const BLOCK_H = 20;
  const GAP = 4;
  const ROW_H = BLOCK_H + GAP;

  const timeToX = useCallback((t: number, width: number) => {
    return PADDING + (t / durationSafe) * (width - PADDING * 2);
  }, [durationSafe]);

  const xToTime = useCallback((x: number, width: number) => {
    return Math.max(0, ((x - PADDING) / (width - PADDING * 2)) * durationSafe);
  }, [durationSafe]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const canvasH = HEADER_H + lines.length * ROW_H + 10;
    canvas.width = w * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = canvasH + "px";

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, canvasH);

    // Header bg
    ctx.fillStyle = "#181825";
    ctx.fillRect(0, 0, w, HEADER_H);

    // Time ruler ticks
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px monospace";
    const tickInterval = durationSafe > 60 ? 10 : durationSafe > 30 ? 5 : 1;
    for (let t = 0; t <= Math.ceil(durationSafe); t += tickInterval) {
      const x = timeToX(t, w);
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H - 4);
      ctx.lineTo(x, HEADER_H);
      ctx.strokeStyle = "#374151";
      ctx.stroke();
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, x + 2, HEADER_H - 6);
    }

    // Playhead
    const px = timeToX(currentTime, w);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvasH);
    ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 6);
    ctx.closePath();
    ctx.fill();

    // Line blocks
    lines.forEach((line, i) => {
      const y = HEADER_H + i * ROW_H + 2;
      const x1 = timeToX(line.start, w);
      const x2 = timeToX(line.end, w);
      const bw = Math.max(4, x2 - x1);

      const isActive = currentTime >= line.start && currentTime < line.end;
      const isDragging = draggingIdx === i;
      const isRecalTarget = recalibrateMode && recalibrateIdx === i;
      const isDone = currentTime >= line.end;

      let fillColor = "#1f2937";
      if (isDragging) fillColor = "#7c3aed";
      else if (isRecalTarget) fillColor = "#f59e0b";
      else if (isActive) fillColor = "#0891b2";
      else if (isDone) fillColor = "#065f46";

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = isDragging ? "#a78bfa" : isActive ? "#22d3ee" : "#4b5563";
      ctx.lineWidth = isActive || isDragging ? 2 : 1;
      roundRect(ctx, x1, y, bw, BLOCK_H, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isActive || isDragging ? "#fff" : "#d1d5db";
      ctx.font = "10px Inter, sans-serif";
      const lineLabel = `${i + 1}`;
      ctx.fillText(lineLabel, x1 + 4, y + 14);

      if (bw > 40) {
        const text = line.words.slice(0, 4).map((w) => w.word).join(" ");
        const truncated = bw > 120 ? text : text.slice(0, Math.floor(bw / 8));
        ctx.fillText(truncated, x1 + 18, y + 14);
      }
    });

    // Recalibrate hint
    if (recalibrateMode) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText("TAP SPACEBAR to stamp timestamps    [Esc to cancel]", 10, canvasH - 4);
    }
  }, [lines, currentTime, durationSafe, timeToX, draggingIdx, recalibrateMode, recalibrateIdx]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  const getMouseTime = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return xToTime(e.clientX - rect.left, rect.width);
  }, [xToTime]);

  const findLineAtY = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const y = e.clientY - rect.top;
    const idx = Math.floor((y - HEADER_H) / ROW_H);
    return idx >= 0 && idx < lines.length ? idx : -1;
  }, [lines.length]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const idx = findLineAtY(e);
    if (idx < 0) return;
    setDraggingIdx(idx);
    setDragStartX(e.clientX);
    setDragStartTime(lines[idx].start);
  }, [findLineAtY, lines]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingIdx === null) return;
    const deltaTime = getMouseTime(e) - dragStartTime;
    const newLines = [...lines];
    const line = { ...newLines[draggingIdx], words: [...newLines[draggingIdx].words] };
    const shift = Math.round(deltaTime * 1000) / 1000;
    line.start += shift;
    line.end += shift;
    line.words = line.words.map((w) => ({
      ...w,
      start: w.start + shift,
      end: w.end + shift,
    }));
    newLines[draggingIdx] = line;
    onLinesUpdate(newLines);
    setDragStartTime(line.start);
  }, [draggingIdx, getMouseTime, dragStartTime, lines, onLinesUpdate]);

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  const nudgeLine = useCallback((idx: number, ms: number) => {
    const newLines = [...lines];
    const line = { ...newLines[idx], words: [...newLines[idx].words] };
    const shift = ms / 1000;
    line.start += shift;
    line.end += shift;
    line.words = line.words.map((w) => ({
      ...w,
      start: w.start + shift,
      end: w.end + shift,
    }));
    newLines[idx] = line;
    onLinesUpdate(newLines);
  }, [lines, onLinesUpdate]);

  const toggleRecalibrate = useCallback(() => {
    if (recalibrateMode) {
      setRecalibrateMode(false);
      return;
    }
    setRecalibrateMode(true);
    setRecalibrateIdx(0);
    recalRef.current = 0;
  }, [recalibrateMode]);

  const stampTimestamp = useCallback(() => {
    if (!recalibrateMode) return;
    const idx = recalRef.current;
    if (idx >= lines.length) return;
    const newLines = [...lines];
    const line = { ...newLines[idx], words: [...newLines[idx].words] };
    const origStart = lines[idx].start;
    const origEnd = lines[idx].end;
    const lineDur = origEnd - origStart;
    line.start = currentTime;
    line.end = currentTime + lineDur;
    line.words = line.words.map((w) => ({
      ...w,
      start: w.start - origStart + currentTime,
      end: w.end - origStart + currentTime,
    }));
    newLines[idx] = line;
    onLinesUpdate(newLines);
    const next = idx + 1;
    if (next < lines.length) {
      recalRef.current = next;
      setRecalibrateIdx(next);
    } else {
      setRecalibrateMode(false);
    }
  }, [recalibrateMode, lines, currentTime, onLinesUpdate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!recalibrateMode) return;
      if (e.code === "Space") {
        e.preventDefault();
        stampTimestamp();
      } else if (e.code === "Escape") {
        setRecalibrateMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recalibrateMode, stampTimestamp]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-daw-text-dim">Timeline Editor</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecalibrate}
            disabled={!canRecalibrate}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded border transition-colors",
              recalibrateMode
                ? "border-amber-400/50 text-amber-300 bg-amber-400/10"
                : "border-daw-border text-daw-text-dim hover:text-daw-text",
              !canRecalibrate && "opacity-40 cursor-not-allowed"
            )}
          >
            {recalibrateMode ? "Recalibrating..." : "Tap Recalibrate"}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative border border-daw-border rounded-lg bg-daw-surface-2/50 overflow-hidden cursor-ew-resize"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="w-full block" />
      </div>
      {/* Nudge controls per line */}
      <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <button
              onClick={() => onSeek(line.start)}
              className="w-8 text-daw-text-dim tabular-nums hover:text-daw-text shrink-0"
            >
              {i + 1}
            </button>
            <span className="flex-1 text-daw-text truncate">
              {line.words.slice(0, 3).map((w) => w.word).join(" ")}
            </span>
            <button
              onClick={() => nudgeLine(i, -500)}
              className="px-1.5 py-0.5 rounded border border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim"
            >
              -500ms
            </button>
            <button
              onClick={() => nudgeLine(i, -100)}
              className="px-1.5 py-0.5 rounded border border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim"
            >
              -100ms
            </button>
            <button
              onClick={() => nudgeLine(i, 100)}
              className="px-1.5 py-0.5 rounded border border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim"
            >
              +100ms
            </button>
            <button
              onClick={() => nudgeLine(i, 500)}
              className="px-1.5 py-0.5 rounded border border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim"
            >
              +500ms
            </button>
          </div>
        ))}
      </div>
      {recalibrateMode && (
        <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-400/20">
          <span className="text-[10px] text-amber-300">
            Tap <kbd className="px-1 py-0.5 text-[9px] bg-daw-surface-2 rounded border border-daw-border">Space</kbd> to stamp timestamp for line {recalibrateIdx + 1}/{lines.length}
          </span>
        </div>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
