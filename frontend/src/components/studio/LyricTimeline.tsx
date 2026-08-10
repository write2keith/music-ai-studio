"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { LyricLine, LyricWord } from "./KaraokeCanvas";

interface Props {
  lines: LyricLine[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onUpdateWord: (lineIdx: number, wordIdx: number, field: "start" | "end" | "text", value: number | string) => void;
  onUpdateLine: (lineIdx: number, field: "start" | "end", value: number) => void;
}

const BAR_HEIGHT = 24;
const BAR_GAP = 4;
const LABEL_WIDTH = 60;
const PADDING_X = 8;
const PADDING_TOP = 8;
const ROW_HEIGHT = BAR_HEIGHT + BAR_GAP;

export function LyricTimeline({
  lines,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  onUpdateWord,
  onUpdateLine,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingTextField, setEditingTextField] = useState<string | null>(null);

  const totalRows = Math.max(1, lines.reduce((sum, l) => sum + l.words.length, 0));
  const totalHeight = PADDING_TOP * 2 + totalRows * ROW_HEIGHT;
  const usableDuration = Math.max(duration, 0.1);

  const timeToX = useCallback(
    (t: number, canvasW: number) => {
      const usable = canvasW - LABEL_WIDTH - PADDING_X * 2;
      return LABEL_WIDTH + PADDING_X + (t / usableDuration) * usable;
    },
    [usableDuration]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = Math.max(rect.height, totalHeight);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#111118";
    ctx.fillRect(0, 0, w, h);

    const usable = w - LABEL_WIDTH - PADDING_X * 2;

    // Second markers
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let t = 0; t <= usableDuration; t += 1) {
      const x = timeToX(t, w);
      ctx.fillRect(Math.round(x), 0, 1, h);
      ctx.fillStyle = "rgba(148,163,184,0.3)";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${t}s`, x, 10);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
    }

    let row = 0;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      for (let wi = 0; wi < line.words.length; wi++) {
        const word = line.words[wi];
        const wordStart = Math.max(0, word.start);
        const wordEnd = Math.max(wordStart + 0.1, word.end);

        const x1 = timeToX(wordStart, w);
        const x2 = timeToX(wordEnd, w);
        const y = PADDING_TOP + row * ROW_HEIGHT;

        const wordTime = currentTime;
        const isActive = wordTime >= wordStart && wordTime <= wordEnd;
        const isSung = wordTime > wordEnd;
        const isFuture = wordTime < wordStart;

        // Bar background
        let barColor = "rgba(148, 163, 184, 0.2)";
        if (isActive) barColor = "rgba(34, 211, 238, 0.3)";
        else if (isSung) barColor = "rgba(168, 85, 247, 0.25)";

        ctx.fillStyle = barColor;
        ctx.fillRect(x1, y, Math.max(4, x2 - x1), BAR_HEIGHT);

        // Bar border
        ctx.strokeStyle = isActive ? "#22d3ee" : "rgba(148, 163, 184, 0.2)";
        ctx.lineWidth = isActive ? 1.5 : 0.5;
        ctx.strokeRect(x1, y, Math.max(4, x2 - x1), BAR_HEIGHT);

        // Word text (label area)
        ctx.fillStyle = isActive ? "#22d3ee" : "#94a3b8";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(word.text, LABEL_WIDTH - 4, y + BAR_HEIGHT / 2 + 4);

        // Time label inside bar
        if (x2 - x1 > 50) {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${wordStart.toFixed(1)}-${wordEnd.toFixed(1)}`,
            (x1 + x2) / 2,
            y + BAR_HEIGHT / 2 + 3
          );
        }

        // Drag handles (left/right edges)
        const handleW = 4;
        if (x2 - x1 > 20) {
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect(x1 - handleW / 2, y, handleW, BAR_HEIGHT);
          ctx.fillRect(x2 - handleW / 2, y, handleW, BAR_HEIGHT);
        }

        row++;
      }
    }

    // Playhead
    if (usableDuration > 0) {
      const phX = timeToX(currentTime, w);
      ctx.strokeStyle = isPlaying ? "#22d3ee" : "#22d3ee60";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      ctx.arc(phX, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lines, currentTime, duration, isPlaying, totalHeight, timeToX, usableDuration]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => draw());
    obs.observe(container);
    return () => obs.disconnect();
  }, [draw]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const usable = rect.width - LABEL_WIDTH - PADDING_X * 2;
      const t = ((x - LABEL_WIDTH - PADDING_X) / usable) * usableDuration;
      onSeek(Math.max(0, Math.min(usableDuration, t)));
    },
    [usableDuration, onSeek]
  );

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold">
        Lyric Timeline
      </h3>
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-daw-border bg-[#111118] overflow-hidden"
        style={{ minHeight: Math.max(120, totalHeight) }}
      >
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          style={{ display: "block" }}
          onClick={handleCanvasClick}
        />
      </div>

      {/* Inline word editor */}
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {lines.map((line, li) => (
          <div key={li} className="rounded bg-daw-surface-3/40 p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-daw-text-dim font-mono w-6 text-right">L{li + 1}</span>
              <span className="text-[9px] text-daw-text-dim font-mono">
                {line.start.toFixed(1)}s - {line.end.toFixed(1)}s
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {line.words.map((word, wi) => {
                const cellId = `${li}-${wi}`;
                const isEditing = editingCell === cellId;
                const isEditingText = editingTextField === cellId;
                return (
                  <div key={wi} className="inline-flex items-center gap-0.5 bg-daw-surface-2 rounded px-1 py-0.5">
                    {isEditingText ? (
                      <input
                        type="text"
                        defaultValue={word.text}
                        className="w-14 bg-transparent text-daw-text text-[10px] outline-none border-b border-daw-accent/30 font-medium"
                        autoFocus
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) onUpdateWord(li, wi, "text", v);
                          setEditingTextField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = (e.target as HTMLInputElement).value.trim();
                            if (v) onUpdateWord(li, wi, "text", v);
                            setEditingTextField(null);
                          }
                          if (e.key === "Escape") setEditingTextField(null);
                        }}
                      />
                    ) : (
                      <button
                        className="text-[10px] text-daw-text font-medium hover:text-daw-accent transition-colors cursor-pointer"
                        onDoubleClick={() => setEditingTextField(cellId)}
                        title="Double-click to edit word text"
                      >
                        {word.text}
                      </button>
                    )}
                    {isEditing ? (
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={duration}
                        defaultValue={word.end}
                        className="w-10 bg-daw-surface-2 text-daw-text text-[9px] rounded px-1 py-0 outline-none border border-daw-accent/30 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) onUpdateWord(li, wi, "end", v);
                          setEditingCell(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = parseFloat((e.target as HTMLInputElement).value);
                            if (!isNaN(v)) onUpdateWord(li, wi, "end", v);
                            setEditingCell(null);
                          }
                          if (e.key === "Escape") setEditingCell(null);
                        }}
                      />
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <span className="text-[8px] text-daw-text-dim font-mono">{word.start.toFixed(1)}</span>
                        <button
                          onClick={() => setEditingCell(cellId)}
                          className="text-[9px] text-daw-text-dim hover:text-daw-accent font-mono transition-colors"
                        >
                          -{word.end.toFixed(1)}
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
