"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface Props {
  buffer: AudioBuffer | null;
  color: string;
  startOffset: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  playheadTime: number;
  isPlaying: boolean;
  maxDuration: number;
  bpm: number;
  onOffsetChange: (offset: number) => void;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
}

type DragMode = "none" | "clip" | "trim-left" | "trim-right";

export function TimelineClip({
  buffer,
  color,
  startOffset,
  duration,
  trimStart,
  trimEnd,
  playheadTime,
  isPlaying,
  maxDuration,
  bpm,
  onOffsetChange,
  onTrimChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const dragStartTrimLeft = useRef(0);
  const dragStartTrimRight = useRef(0);

  const beatDuration = 60 / bpm;
  const totalDuration = Math.max(maxDuration, 10);
  const pxPerSecond = 80;

  // Convert time to pixel position in the waveform area
  const timeToX = useCallback((t: number) => t * pxPerSecond, [pxPerSecond]);
  const xToTime = useCallback((x: number) => x / pxPerSecond, [pxPerSecond]);

  // Snap time to nearest grid division (16th note default)
  const snapToGrid = useCallback(
    (t: number) => {
      const grid = beatDuration / 4; // 16th note
      return Math.round(t / grid) * grid;
    },
    [beatDuration]
  );

  const effectiveEnd = duration - trimEnd;
  const clipWidth = (effectiveEnd - trimStart) * pxPerSecond;

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, totalDuration * pxPerSecond);
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const c = canvas.getContext("2d");
    if (!c) return;
    c.scale(dpr, dpr);

    // Background
    c.fillStyle = "#111118";
    c.fillRect(0, 0, w, h);

    // Grid lines (16th notes)
    const gridStep = (beatDuration / 4) * pxPerSecond;
    c.strokeStyle = "rgba(255,255,255,0.04)";
    c.lineWidth = 1;
    for (let x = 0; x < w; x += gridStep) {
      c.beginPath();
      c.moveTo(Math.round(x), 0);
      c.lineTo(Math.round(x), h);
      c.stroke();
    }

    // Beat lines (stronger)
    const beatStep = beatDuration * pxPerSecond;
    c.strokeStyle = "rgba(255,255,255,0.08)";
    for (let x = 0; x < w; x += beatStep) {
      c.beginPath();
      c.moveTo(Math.round(x), 0);
      c.lineTo(Math.round(x), h);
      c.stroke();
    }

    // Clip region background
    const clipX = startOffset * pxPerSecond;
    c.fillStyle = color + "20";
    c.fillRect(clipX, 0, clipWidth, h);

    // Clip border
    c.strokeStyle = color + "60";
    c.lineWidth = 1;
    c.strokeRect(clipX, 0, clipWidth, h);

    // Waveform inside clip region
    if (buffer) {
      drawClipWaveform(c, clipX, clipWidth, h);
    }

    // Trimmed regions (dark overlay)
    if (trimStart > 0 && buffer) {
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.fillRect(clipX, 0, trimStart * pxPerSecond, h);
    }
    if (trimEnd > 0 && buffer) {
      c.fillStyle = "rgba(0,0,0,0.4)";
      const trimRightX = clipX + clipWidth - trimEnd * pxPerSecond;
      c.fillRect(trimRightX, 0, trimEnd * pxPerSecond, h);
    }

    // Trim handles
    if (buffer && duration > 0) {
      const handleW = 6;
      // Left trim handle
      const leftX = clipX + trimStart * pxPerSecond;
      c.fillStyle = color;
      c.globalAlpha = dragMode === "trim-left" ? 1 : 0.6;
      c.fillRect(leftX - handleW / 2, 0, handleW, h);
      c.fillStyle = "#fff";
      c.fillRect(leftX - 1, h * 0.3, 2, h * 0.4);

      // Right trim handle
      const rightX = clipX + clipWidth - trimEnd * pxPerSecond;
      c.fillStyle = color;
      c.globalAlpha = dragMode === "trim-right" ? 1 : 0.6;
      c.fillRect(rightX - handleW / 2, 0, handleW, h);
      c.fillStyle = "#fff";
      c.fillRect(rightX - 1, h * 0.3, 2, h * 0.4);

      c.globalAlpha = 1;
    }

    // Clip label
    if (clipWidth > 40) {
      c.fillStyle = color;
      c.font = "9px Inter, sans-serif";
      c.fillText(
        `${startOffset.toFixed(1)}s - ${(startOffset + effectiveEnd - trimStart).toFixed(1)}s`,
        clipX + 4,
        h - 4
      );
    }

    // Playhead
    const phX = playheadTime * pxPerSecond;
    c.strokeStyle = isPlaying ? "#22d3ee" : "#22d3ee60";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(phX, 0);
    c.lineTo(phX, h);
    c.stroke();

    // Playhead dot
    c.fillStyle = "#22d3ee";
    c.beginPath();
    c.arc(phX, 4, 4, 0, Math.PI * 2);
    c.fill();
  }

  function drawClipWaveform(c: CanvasRenderingContext2D, clipX: number, clipW: number, h: number) {
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const totalSamples = data.length;
    const dur = buffer.duration;

    // Map clip pixels back to source samples
    const sampleStart = (trimStart / dur) * totalSamples;
    const sampleEnd = ((duration - trimEnd) / dur) * totalSamples;
    const visibleSamples = sampleEnd - sampleStart;
    const midY = h / 2;

    c.beginPath();
    c.strokeStyle = color + "aa";
    c.lineWidth = 1;

    for (let px = 0; px < clipW; px++) {
      const srcRatio = px / clipW;
      const srcIdx = sampleStart + srcRatio * visibleSamples;
      const samplesPerPx = Math.max(1, visibleSamples / clipW);

      let min = 1, max = -1;
      for (let j = 0; j < samplesPerPx; j++) {
        const idx = Math.floor(srcIdx + j);
        if (idx < totalSamples) {
          min = Math.min(min, data[idx]);
          max = Math.max(max, data[idx]);
        }
      }
      const y1 = midY - max * (midY * 0.8);
      const y2 = midY - min * (midY * 0.8);
      c.moveTo(clipX + px, y1);
      c.lineTo(clipX + px, y2);
    }
    c.stroke();
  }

  // Rerender on state/prop changes
  useEffect(() => { draw(); });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => draw());
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  function getDragMode(clientX: number): DragMode {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !buffer || duration <= 0) return "none";

    // Scrolled position (container scroll left)
    const scrollLeft = containerRef.current?.scrollLeft ?? 0;
    const x = clientX - rect.left + scrollLeft;

    const clipX = startOffset * pxPerSecond;
    const leftHandleX = clipX + trimStart * pxPerSecond;
    const rightHandleX = clipX + clipWidth - trimEnd * pxPerSecond;
    const handleHitArea = 10;

    if (Math.abs(x - leftHandleX) < handleHitArea) return "trim-left";
    if (Math.abs(x - rightHandleX) < handleHitArea) return "trim-right";
    if (x >= clipX && x <= clipX + clipWidth) return "clip";
    return "none";
  }

  function handleMouseDown(e: React.MouseEvent) {
    const mode = getDragMode(e.clientX);
    setDragMode(mode);
    dragStartX.current = e.clientX;
    dragStartOffset.current = startOffset;
    dragStartTrimLeft.current = trimStart;
    dragStartTrimRight.current = trimEnd;
  }

  useEffect(() => {
    if (dragMode === "none") return;

    function onMove(e: MouseEvent) {
      const dx = e.clientX - dragStartX.current;
      const dt = xToTime(dx);

      if (dragMode === "clip") {
        const snapped = snapToGrid(dragStartOffset.current + dt);
        onOffsetChange(Math.max(0, snapped));
      } else if (dragMode === "trim-left") {
        const newTrim = Math.max(0, dragStartTrimLeft.current + dt);
        const maxTrim = duration - trimEnd - 0.1;
        onTrimChange(Math.min(newTrim, maxTrim), trimEnd);
      } else if (dragMode === "trim-right") {
        const newTrim = Math.max(0, dragStartTrimRight.current - dt);
        const maxTrim = duration - trimStart - 0.1;
        onTrimChange(trimStart, Math.min(newTrim, maxTrim));
      }
    }

    function onUp() {
      setDragMode("none");
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragMode, startOffset, trimStart, trimEnd, duration, onOffsetChange, onTrimChange, xToTime, snapToGrid]);

  const cursor = dragMode === "none"
    ? (buffer ? "grab" : "default")
    : dragMode === "clip" ? "grabbing" : "ew-resize";

  return (
    <div
      ref={containerRef}
      className="flex-1 h-14 rounded bg-daw-surface-1 overflow-x-auto overflow-y-hidden relative"
      style={{ cursor }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
