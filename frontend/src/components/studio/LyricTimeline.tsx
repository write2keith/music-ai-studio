"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { LyricLine } from "./KaraokeCanvas";

interface Props {
  lines: LyricLine[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onUpdateWord: (lineIdx: number, wordIdx: number, field: "start" | "end" | "text", value: number | string) => void;
  onUpdateLine: (lineIdx: number, field: "start" | "end", value: number) => void;
  audioBuffer: AudioBuffer | null;
}

interface DragState {
  lineIdx: number;
  wordIdx: number;
  type: "move" | "resize-start" | "resize-end";
  startOffset: number;
}

const RULER_HEIGHT = 18;
const WAVEFORM_HEIGHT = 40;
const BLOCK_ROW_H = 22;
const BLOCK_GAP = 2;
const PADDING_X = 8;
const LABEL_WIDTH = 64;
const TOTAL_HEADER = RULER_HEIGHT + WAVEFORM_HEIGHT + 4;

function xToTime(x: number, usableW: number, duration: number): number {
  const t = ((x - LABEL_WIDTH - PADDING_X) / usableW) * duration;
  return Math.max(0, Math.min(duration, t));
}

function timeToX(t: number, usableW: number, duration: number): number {
  return LABEL_WIDTH + PADDING_X + (t / duration) * usableW;
}

export function LyricTimeline({
  lines,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  onUpdateWord,
  audioBuffer,
}: Props) {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const durationSecs = Math.max(duration, 0.1);
  const totalWords = lines.reduce((sum, l) => sum + l.words.length, 0);
  const blocksAreaH = Math.max(40, totalWords * (BLOCK_ROW_H + BLOCK_GAP)) + 8;

  const fullW = LABEL_WIDTH + PADDING_X + PADDING_X + Math.max(totalWords * 60, 800);
  const totalH = TOTAL_HEADER + blocksAreaH;

  const xToTimeFn = useCallback(
    (x: number, w: number) => xToTime(x, w - LABEL_WIDTH - PADDING_X * 2, durationSecs),
    [durationSecs],
  );

  const timeToXFn = useCallback(
    (t: number, w: number) => timeToX(t, w - LABEL_WIDTH - PADDING_X * 2, durationSecs),
    [durationSecs],
  );

  // Waveform drawing
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width ?? fullW;
    canvas.width = fullW * dpr;
    canvas.height = WAVEFORM_HEIGHT * dpr;
    canvas.style.width = `${fullW}px`;
    canvas.style.height = `${WAVEFORM_HEIGHT}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, fullW, WAVEFORM_HEIGHT);

    const usableW = fullW - LABEL_WIDTH - PADDING_X * 2;
    const centerY = WAVEFORM_HEIGHT / 2;

    if (audioBuffer) {
      const channel = audioBuffer.getChannelData(0);
      const samplesPerPixel = Math.max(1, Math.floor(channel.length / usableW));
      ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();

      for (let px = 0; px < usableW; px++) {
        const start = px * samplesPerPixel;
        const end = Math.min(channel.length, start + samplesPerPixel);
        let peak = 0;
        for (let s = start; s < end; s++) {
          const abs = Math.abs(channel[s]);
          if (abs > peak) peak = abs;
        }
        const amp = peak * (WAVEFORM_HEIGHT / 2 - 2);
        const x = LABEL_WIDTH + PADDING_X + px;
        ctx.moveTo(x, centerY - amp);
        ctx.lineTo(x, centerY + amp);
      }
      ctx.stroke();

      // Center line
      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH + PADDING_X, centerY);
      ctx.lineTo(LABEL_WIDTH + PADDING_X + usableW, centerY);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(148,163,184,0.08)";
      ctx.fillText("Upload audio for waveform", LABEL_WIDTH + PADDING_X + 8, centerY + 4);
      ctx.font = "11px monospace";
    }
  }, [audioBuffer, fullW, durationSecs]);

  // Auto-scroll playhead into view
  useEffect(() => {
    if (!isPlaying || currentTime < 0) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const usableW = (scrollEl.parentElement?.getBoundingClientRect().width ?? fullW) - LABEL_WIDTH - PADDING_X * 2;
    const px = timeToXFn(currentTime, scrollEl.parentElement?.getBoundingClientRect().width ?? fullW);
    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    const margin = 120;
    if (px > viewRight - margin) {
      scrollEl.scrollTo({ left: px - scrollEl.clientWidth + margin, behavior: "smooth" });
    } else if (px < viewLeft + margin) {
      scrollEl.scrollTo({ left: Math.max(0, px - margin), behavior: "smooth" });
    }
  }, [currentTime, isPlaying, fullW, timeToXFn]);

  // Drag handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, lineIdx: number, wordIdx: number, type: DragState["type"]) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const scrollEl = scrollRef.current;
      const containerW = scrollEl?.parentElement?.getBoundingClientRect().width ?? fullW;
      const startX = e.clientX;
      const startScroll = scrollEl?.scrollLeft ?? 0;

      const ds: DragState = { lineIdx, wordIdx, type, startOffset: 0 };
      setDrag(ds);
      dragRef.current = ds;

      const word = lines[lineIdx]?.words[wordIdx];
      if (!word) return;

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        const scrollEl2 = scrollRef.current;
        const containerW2 = scrollEl2?.parentElement?.getBoundingClientRect().width ?? fullW;
        const usableW2 = containerW2 - LABEL_WIDTH - PADDING_X * 2;
        const dt = (dx / usableW2) * durationSecs;

        const d = dragRef.current;
        if (!d) return;

        if (d.type === "move") {
          const newStart = Math.max(0, word.start + dt);
          const dur = word.end - word.start;
          onUpdateWord(lineIdx, wordIdx, "start", Math.min(durationSecs - dur, newStart));
          onUpdateWord(lineIdx, wordIdx, "end", Math.min(durationSecs, newStart + dur));
        } else if (d.type === "resize-start") {
          const newStart = Math.max(0, Math.min(word.end - 0.05, word.start + dt));
          onUpdateWord(lineIdx, wordIdx, "start", newStart);
        } else if (d.type === "resize-end") {
          const newEnd = Math.max(word.start + 0.05, Math.min(durationSecs, word.end + dt));
          onUpdateWord(lineIdx, wordIdx, "end", newEnd);
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDrag(null);
        dragRef.current = null;
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [lines, durationSecs, fullW, onUpdateWord],
  );

  // Canvas click to seek
  const handleCanvasSeek = useCallback(
    (e: React.MouseEvent) => {
      if (drag) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = xToTimeFn(x, rect.width);
      onSeek(t);
    },
    [drag, onSeek, xToTimeFn],
  );

  // Build flat list of blocks for overlay
  const blocks: { lineIdx: number; wordIdx: number; word: LyricLine["words"][0]; color: string }[] = [];
  const colors = ["#a855f7", "#22d3ee", "#34d399", "#fb923c", "#f472b6", "#a78bfa"];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let wi = 0; wi < line.words.length; wi++) {
      blocks.push({
        lineIdx: li,
        wordIdx: wi,
        word: line.words[wi],
        color: colors[li % colors.length],
      });
    }
  }

  const playheadX = timeToXFn(currentTime, scrollRef.current?.parentElement?.getBoundingClientRect().width ?? fullW);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-daw-text-dim font-semibold">
        Timeline Editor
        <span className="text-[9px] ml-2 normal-case tracking-normal">
          {totalWords} words — drag blocks to position, edges to resize
        </span>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-lg border border-daw-border bg-[#0a0a14] relative select-none"
      >
        <div className="relative" style={{ width: fullW, height: totalH, minHeight: 120 }}>
          {/* Ruler */}
          <canvas
            className="absolute top-0 left-0 block"
            style={{ width: fullW, height: RULER_HEIGHT }}
            ref={(el) => {
              if (!el) return;
              const dpr = window.devicePixelRatio || 1;
              el.width = fullW * dpr;
              el.height = RULER_HEIGHT * dpr;
              el.style.width = `${fullW}px`;
              el.style.height = `${RULER_HEIGHT}px`;
              const ctx = el.getContext("2d");
              if (!ctx) return;
              ctx.scale(dpr, dpr);
              ctx.fillStyle = "#111118";
              ctx.fillRect(0, 0, fullW, RULER_HEIGHT);
              ctx.fillStyle = "rgba(148,163,184,0.4)";
              ctx.font = "8px monospace";
              ctx.textAlign = "center";
              for (let t = 0; t <= durationSecs; t += Math.max(1, Math.floor(durationSecs / 15))) {
                const x = timeToX(t, fullW - LABEL_WIDTH - PADDING_X * 2, durationSecs);
                ctx.fillText(`${t.toFixed(1)}s`, x, 10);
              }
            }}
            onClick={handleCanvasSeek}
          />

          {/* Waveform canvas */}
          <div className="absolute top-0 left-0" style={{ marginTop: RULER_HEIGHT }}>
            <canvas
              ref={waveformCanvasRef}
              className="block cursor-pointer"
              onClick={handleCanvasSeek}
            />
          </div>

          {/* Blocks area */}
          <div
            className="absolute left-0 right-0"
            style={{ top: TOTAL_HEADER, height: blocksAreaH }}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: Math.floor(durationSecs) + 2 }).map((_, i) => {
                const x = timeToXFn(i, fullW);
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-daw-text/[0.04]"
                    style={{ left: x }}
                  />
                );
              })}
            </div>

            {/* Word blocks */}
            {blocks.map(({ lineIdx, wordIdx, word, color }, bi) => {
              const wStart = Math.max(0, word.start);
              const wEnd = Math.max(wStart + 0.05, word.end);
              const x1 = timeToXFn(wStart, fullW);
              const x2 = timeToXFn(wEnd, fullW);
              const blockW = Math.max(16, x2 - x1);
              const row = bi;
              const y = 4 + row * (BLOCK_ROW_H + BLOCK_GAP);

              const isActive = currentTime >= wStart && currentTime <= wEnd;
              const isDragging =
                drag?.lineIdx === lineIdx && drag?.wordIdx === wordIdx;

              return (
                <div
                  key={`${lineIdx}-${wordIdx}`}
                  className="absolute group cursor-grab active:cursor-grabbing"
                  style={{
                    left: x1,
                    top: y,
                    width: blockW,
                    height: BLOCK_ROW_H,
                    zIndex: isDragging ? 20 : 10,
                  }}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      handlePointerDown(e, lineIdx, wordIdx, "move");
                    }
                  }}
                >
                  {/* Block body */}
                  <div
                    className={[
                      "h-full rounded px-1.5 flex items-center text-[10px] font-medium overflow-hidden transition-colors border",
                      isActive
                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                        : "bg-daw-surface-2/80 border-daw-border text-daw-text",
                      isDragging && "ring-1 ring-daw-accent",
                    ].join(" ")}
                    style={{ borderLeftColor: color + "60", borderLeftWidth: 2 }}
                  >
                    <span className="truncate">{word.text}</span>
                    <span className="ml-auto text-[8px] opacity-40 shrink-0 tabular-nums">
                      {wStart.toFixed(1)}-{wEnd.toFixed(1)}
                    </span>
                  </div>

                  {/* Resize handles */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity z-30"
                    style={{ background: "rgba(168,85,247,0.3)", left: -1 }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePointerDown(e, lineIdx, wordIdx, "resize-start");
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity z-30"
                    style={{ background: "rgba(168,85,247,0.3)", right: -1 }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePointerDown(e, lineIdx, wordIdx, "resize-end");
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 pointer-events-none"
            style={{
              left: playheadX,
              width: 2,
              height: totalH,
              background: isPlaying ? "#22d3ee" : "#22d3ee60",
              boxShadow: isPlaying ? "0 0 8px rgba(34,211,238,0.5)" : "none",
              zIndex: 30,
            }}
          >
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{
                width: 8,
                height: 8,
                background: "#22d3ee",
                clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
              }}
            />
          </div>
        </div>
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
              {line.words.map((word, wi) => (
                <EditableWordChip
                  key={`${li}-${wi}`}
                  word={word}
                  duration={durationSecs}
                  onUpdateEnd={(v) => onUpdateWord(li, wi, "end", v)}
                  onUpdateText={(v) => onUpdateWord(li, wi, "text", v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableWordChip({
  word,
  duration,
  onUpdateEnd,
  onUpdateText,
}: {
  word: LyricLine["words"][0];
  duration: number;
  onUpdateEnd: (v: number) => void;
  onUpdateText: (v: string) => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [editingText, setEditingText] = useState(false);

  return (
    <div className="inline-flex items-center gap-0.5 bg-daw-surface-2 rounded px-1 py-0.5">
      {editingText ? (
        <input
          type="text"
          defaultValue={word.text}
          className="w-14 bg-transparent text-daw-text text-[10px] outline-none border-b border-daw-accent/30 font-medium"
          autoFocus
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onUpdateText(v);
            setEditingText(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) onUpdateText(v);
              setEditingText(false);
            }
            if (e.key === "Escape") setEditingText(false);
          }}
        />
      ) : (
        <button
          className="text-[10px] text-daw-text font-medium hover:text-daw-accent transition-colors cursor-pointer"
          onDoubleClick={() => setEditingText(true)}
          title="Double-click to edit word"
        >
          {word.text}
        </button>
      )}
      {editingTime ? (
        <input
          type="number"
          step={0.05}
          min={0}
          max={duration}
          defaultValue={word.end}
          className="w-10 bg-daw-surface-2 text-daw-text text-[9px] rounded px-1 py-0 outline-none border border-daw-accent/30 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          autoFocus
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onUpdateEnd(v);
            setEditingTime(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = parseFloat((e.target as HTMLInputElement).value);
              if (!isNaN(v)) onUpdateEnd(v);
              setEditingTime(false);
            }
            if (e.key === "Escape") setEditingTime(false);
          }}
        />
      ) : (
        <span className="flex items-center gap-0.5">
          <span className="text-[8px] text-daw-text-dim font-mono">{word.start.toFixed(1)}</span>
          <button
            onClick={() => setEditingTime(true)}
            className="text-[9px] text-daw-text-dim hover:text-daw-accent font-mono transition-colors"
          >
            -{word.end.toFixed(1)}
          </button>
        </span>
      )}
    </div>
  );
}
