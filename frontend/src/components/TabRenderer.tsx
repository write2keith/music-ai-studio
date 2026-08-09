"use client";

import { useRef, useEffect } from "react";
import type { TabNote } from "@/lib/api";

interface TabRendererProps {
  notes: TabNote[];
  tuning: string[];
  durationSecs: number;
  currentTime?: number;
  isPlaying?: boolean;
}

const STRING_COUNT = 6;
const NOTE_MIN_WIDTH = 32;
const STRING_SPACING = 22;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 16;
const HEADER_HEIGHT = 22;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;

function validateFret(note: TabNote): number {
  let fret = note.fret;
  if (fret >= 0 && fret <= 24) return fret;
  const openMidi = [40, 45, 50, 55, 59, 64][note.string];
  if (openMidi !== undefined) {
    const computed = note.pitch - openMidi;
    if (computed >= 0 && computed <= 24) return computed;
  }
  const clamped = Math.max(0, Math.min(24, fret));
  return Number.isFinite(clamped) ? clamped : -1;
}

export default function TabRenderer({
  notes,
  tuning,
  durationSecs,
  currentTime = -1,
  isPlaying = false,
}: TabRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxTime = durationSecs || notes[notes.length - 1]?.end_time || notes.length;
  const logicalW = Math.max(notes.length * NOTE_MIN_WIDTH + PADDING_LEFT + PADDING_RIGHT, 400);
  const usableWidth = logicalW - PADDING_LEFT - PADDING_RIGHT;

  function timeToX(t: number): number {
    return PADDING_LEFT + (t / maxTime) * usableWidth;
  }

  // Draw static tab
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || notes.length === 0) return;

    const dpr = window.devicePixelRatio || 1;

    const totalRows = 1;
    const staffHeight = STRING_COUNT * STRING_SPACING;
    const rowHeight = HEADER_HEIGHT + staffHeight + PADDING_TOP + PADDING_BOTTOM;
    const totalHeight = totalRows * rowHeight;

    canvas.width = logicalW * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = logicalW + "px";
    canvas.style.height = totalHeight + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, logicalW, totalHeight);

    for (let row = 0; row < totalRows; row++) {
      const yOffset = row * rowHeight;

      // Header background
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, yOffset, logicalW, HEADER_HEIGHT);

      // Time markers
      ctx.fillStyle = "#6b7280";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      for (let t = 0; t <= maxTime; t += Math.max(1, Math.floor(maxTime / 12))) {
        const x = timeToX(t);
        ctx.fillText(t.toFixed(1) + "s", x, yOffset + 14);
      }

      const staffTop = yOffset + HEADER_HEIGHT + PADDING_TOP;
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, staffTop, logicalW, staffHeight);

      // Tuning labels
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "right";
      for (let s = 0; s < STRING_COUNT; s++) {
        const y = staffTop + s * STRING_SPACING + STRING_SPACING / 2 + 4;
        ctx.fillText(tuning[STRING_COUNT - 1 - s] || "", PADDING_LEFT - 6, y);
      }

      // String lines
      for (let s = 0; s < STRING_COUNT; s++) {
        const y = staffTop + s * STRING_SPACING + STRING_SPACING / 2;
        ctx.strokeStyle =
          s === 0 || s === STRING_COUNT - 1
            ? "rgba(168, 85, 247, 0.4)"
            : "rgba(107, 114, 128, 0.25)";
        ctx.lineWidth = s === 0 || s === STRING_COUNT - 1 ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(PADDING_LEFT, y);
        ctx.lineTo(logicalW - PADDING_RIGHT, y);
        ctx.stroke();
      }

      // Beat markers
      ctx.strokeStyle = "rgba(34, 211, 238, 0.12)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 8]);
      const beatInterval = maxTime / Math.max(1, Math.floor(maxTime / 1.5));
      for (let t = beatInterval; t < maxTime; t += beatInterval) {
        const x = timeToX(t);
        ctx.beginPath();
        ctx.moveTo(x, staffTop);
        ctx.lineTo(x, staffTop + staffHeight);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Notes
      const usedPositions = new Map<string, number>();
      for (const note of notes) {
        const x = timeToX(note.start_time);
        const s = STRING_COUNT - 1 - note.string;
        const y = staffTop + s * STRING_SPACING + STRING_SPACING / 2;

        const posKey = `${Math.round(x / 6)}-${s}`;
        const overlapCount = usedPositions.get(posKey) ?? 0;
        usedPositions.set(posKey, overlapCount + 1);
        const staggerX = overlapCount > 0 ? (overlapCount % 2 === 0 ? -6 : 6) : 0;

        const durationPx = Math.max(
          12,
          ((note.end_time - note.start_time) / maxTime) * usableWidth,
        );
        ctx.fillStyle = "rgba(251, 146, 60, 0.15)";
        ctx.fillRect(x - 2 + staggerX, y - STRING_SPACING / 2 + 2, durationPx, STRING_SPACING - 4);

        const fret = validateFret(note);
        const fretText = fret >= 0 ? String(fret) : "?";
        ctx.fillStyle = fret >= 0 ? "#fb923c" : "#ef4444";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(fretText, x + staggerX, y + 4);

        if (note.note_name) {
          ctx.fillStyle = "#6b7280";
          ctx.font = "7px monospace";
          ctx.fillText(note.note_name, x + staggerX, y + STRING_SPACING / 2);
        }
      }
    }
  }, [notes, tuning, durationSecs, logicalW, maxTime, usableWidth]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (!isPlaying || currentTime < 0) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const playheadX = timeToX(currentTime);
    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    const margin = 120;

    if (playheadX > viewRight - margin) {
      scrollEl.scrollTo({ left: playheadX - scrollEl.clientWidth + margin, behavior: "smooth" });
    } else if (playheadX < viewLeft + margin) {
      scrollEl.scrollTo({ left: Math.max(0, playheadX - margin), behavior: "smooth" });
    }
  }, [currentTime, isPlaying, timeToX]);

  if (notes.length === 0) return null;

  const totalHeight = HEADER_HEIGHT + STRING_COUNT * STRING_SPACING + PADDING_TOP + PADDING_BOTTOM;
  const staffTop = HEADER_HEIGHT + PADDING_TOP;
  const staffHeight = STRING_COUNT * STRING_SPACING;
  const fullHeight = totalHeight;

  return (
    <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-orange-400/20 relative">
      <div ref={containerRef} className="relative" style={{ width: logicalW, height: fullHeight }}>
        <canvas ref={canvasRef} style={{ height: "auto", minWidth: "100%" }} className="block" />

        {/* Playhead overlay */}
        {isPlaying && currentTime >= 0 && (
          <div
            className="absolute top-0 pointer-events-none transition-[left] duration-75 ease-linear"
            style={{
              left: `${timeToX(currentTime)}px`,
              height: `${fullHeight}px`,
              width: "2px",
              background: "#22d3ee",
              boxShadow: "0 0 8px rgba(34, 211, 238, 0.6)",
            }}
          >
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{
                width: 10,
                height: 10,
                background: "#22d3ee",
                clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
