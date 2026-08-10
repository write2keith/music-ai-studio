"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import type { TabNote } from "@/lib/api";

interface TabRendererProps {
  notes: TabNote[];
  tuning: string[];
  durationSecs: number;
  currentTime?: number;
  isPlaying?: boolean;
}

const STRING_COUNT = 6;
const STRING_SPACING = 20;
const LEFT_MARGIN = 42;
const RIGHT_MARGIN = 8;
const TOP_MARGIN = 18;
const BOTTOM_MARGIN = 6;
const MEASURE_INTERIOR = 256;
const BAR_GAP = 4;
const MEASURE_SPACING = MEASURE_INTERIOR + BAR_GAP;
const STAFF_HEIGHT = (STRING_COUNT - 1) * STRING_SPACING;
const SYSTEM_HEIGHT = TOP_MARGIN + STAFF_HEIGHT + BOTTOM_MARGIN;
const BEATS_PER_MEASURE = 4;
const SUBDIVISIONS_PER_BEAT = 4;
const SLOTS_PER_MEASURE = BEATS_PER_MEASURE * SUBDIVISIONS_PER_BEAT;

interface ChordPosition {
  time: number;
  notes: TabNote[];
}

interface QuantizedChord {
  measureIdx: number;
  slot: number;
  notes: TabNote[];
}

interface MeasureLayout {
  index: number;
  startTime: number;
  endTime: number;
  chords: Map<number, QuantizedChord>;
}

interface SystemLayout {
  y: number;
  measures: MeasureLayout[];
}

function estimateBpm(notes: TabNote[], durationSecs: number): number {
  const intervals: number[] = [];
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].start_time - sorted[i - 1].start_time;
    if (dt > 0.04 && dt < 1.5) intervals.push(dt);
  }
  if (intervals.length < 2) return 120;

  const bins = new Map<number, number>();
  const binSize = 0.04;
  for (const dt of intervals) {
    const bin = Math.round(dt / binSize) * binSize;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }

  let bestBin = 0.5;
  let bestCount = 0;
  for (const [bin, count] of bins) {
    if (count > bestCount) {
      bestCount = count;
      bestBin = bin;
    }
  }

  const rawBpm = 60 / bestBin;
  const tempos = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 170, 180, 190, 200];
  let closest = 120;
  let minDist = Infinity;
  for (const t of tempos) {
    const d = Math.abs(rawBpm - t);
    if (d < minDist) { minDist = d; closest = t; }
  }
  return closest;
}

function quantizeNotes(notes: TabNote[], bpm: number, durationSecs: number): { chords: QuantizedChord[]; totalMeasures: number } {
  const beatDuration = 60 / bpm;

  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  const positions: ChordPosition[] = [];
  for (const note of sorted) {
    const last = positions[positions.length - 1];
    if (last && Math.abs(note.start_time - last.time) < 0.04) {
      last.notes.push(note);
    } else {
      positions.push({ time: note.start_time, notes: [note] });
    }
  }

  const chords: QuantizedChord[] = [];
  let maxMeasure = 0;

  for (const pos of positions) {
    const totalBeats = pos.time / beatDuration;
    const rawMeasure = Math.floor(totalBeats / BEATS_PER_MEASURE);
    const beatInMeasure = totalBeats - rawMeasure * BEATS_PER_MEASURE;
    const rawSlot = Math.round(beatInMeasure * SUBDIVISIONS_PER_BEAT);

    let finalMeasure = rawMeasure;
    let finalSlot = rawSlot;
    if (finalSlot >= SLOTS_PER_MEASURE) {
      finalMeasure += Math.floor(finalSlot / SLOTS_PER_MEASURE);
      finalSlot = finalSlot % SLOTS_PER_MEASURE;
    }

    maxMeasure = Math.max(maxMeasure, finalMeasure);
    chords.push({ measureIdx: finalMeasure, slot: finalSlot, notes: pos.notes });
  }

  const totalBeats = durationSecs / beatDuration;
  const minMeasures = Math.max(1, Math.ceil(totalBeats / BEATS_PER_MEASURE));
  const totalMeasures = Math.max(maxMeasure + 1, minMeasures);

  return { chords, totalMeasures };
}

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
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const measuresPerRow = 4;

  const layout = useMemo(() => {
    if (notes.length === 0) return null;

    const bpm = estimateBpm(notes, durationSecs);
    const beatDuration = 60 / bpm;
    const { chords: quantizedChords, totalMeasures } = quantizeNotes(notes, bpm, durationSecs);

    const measures: MeasureLayout[] = [];
    for (let i = 0; i < totalMeasures; i++) {
      measures.push({
        index: i,
        startTime: i * BEATS_PER_MEASURE * beatDuration,
        endTime: (i + 1) * BEATS_PER_MEASURE * beatDuration,
        chords: new Map(),
      });
    }

    for (const chord of quantizedChords) {
      const m = measures[chord.measureIdx];
      if (!m) continue;
      const existing = m.chords.get(chord.slot);
      if (existing) {
        existing.notes.push(...chord.notes);
      } else {
        m.chords.set(chord.slot, { ...chord });
      }
    }

    const totalRows = Math.ceil(totalMeasures / measuresPerRow);
    const systems: SystemLayout[] = [];
    for (let row = 0; row < totalRows; row++) {
      const start = row * measuresPerRow;
      const end = Math.min(start + measuresPerRow, totalMeasures);
      systems.push({
        y: row * SYSTEM_HEIGHT,
        measures: measures.slice(start, end),
      });
    }

    return { systems, bpm, beatDuration, totalMeasures };
  }, [notes, durationSecs, measuresPerRow]);

  const drawStaticTab = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (!layout) return;

      const { systems, beatDuration, totalMeasures, bpm } = layout;
      const staffTop = TOP_MARGIN;

      ctx.fillStyle = "#111118";
      ctx.fillRect(0, 0, width, height);

      // BPM + time sig badge
      ctx.fillStyle = "#374151";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${bpm} BPM  4/4`, LEFT_MARGIN, 4);

      for (const sys of systems) {
        const sysY = sys.y;

        for (let mi = 0; mi < sys.measures.length; mi++) {
          const measure = sys.measures[mi];
          const mx = LEFT_MARGIN + mi * MEASURE_SPACING;

          // Measure background
          ctx.fillStyle = mi % 2 === 0 ? "rgba(24, 24, 37, 0.5)" : "rgba(20, 20, 33, 0.3)";
          ctx.fillRect(mx, sysY + staffTop - 2, MEASURE_INTERIOR, STAFF_HEIGHT + 4);

          // String lines
          for (let s = 0; s < STRING_COUNT; s++) {
            const sy = sysY + staffTop + s * STRING_SPACING;
            ctx.strokeStyle =
              s === 0 || s === STRING_COUNT - 1
                ? "rgba(168, 85, 247, 0.28)"
                : "rgba(107, 114, 128, 0.12)";
            ctx.lineWidth = s === 0 || s === STRING_COUNT - 1 ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(mx, sy);
            ctx.lineTo(mx + MEASURE_INTERIOR, sy);
            ctx.stroke();
          }

          // Beat subdivision markers (16th note grid, fainter)
          for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
            const beatX = mx + (beat / BEATS_PER_MEASURE) * MEASURE_INTERIOR;

            ctx.strokeStyle = "rgba(34, 211, 238, 0.06)";
            ctx.lineWidth = 0.3;
            for (let sub = 1; sub < SUBDIVISIONS_PER_BEAT; sub++) {
              const sx = beatX + (sub / SUBDIVISIONS_PER_BEAT) * (MEASURE_INTERIOR / BEATS_PER_MEASURE);
              ctx.beginPath();
              ctx.moveTo(sx, sysY + staffTop);
              ctx.lineTo(sx, sysY + staffTop + STAFF_HEIGHT);
              ctx.stroke();
            }

            // Beat line (slightly stronger)
            if (beat > 0) {
              ctx.strokeStyle = "rgba(107, 114, 128, 0.14)";
              ctx.lineWidth = 0.5;
              ctx.setLineDash([2, 5]);
              ctx.beginPath();
              ctx.moveTo(beatX, sysY + staffTop);
              ctx.lineTo(beatX, sysY + staffTop + STAFF_HEIGHT);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }

        // Measure bar lines and numbers
        for (let mi = 0; mi < sys.measures.length; mi++) {
          const measure = sys.measures[mi];
          const mx = LEFT_MARGIN + mi * MEASURE_SPACING;
          const endMx = mx + MEASURE_INTERIOR;

          // Left bar line
          ctx.strokeStyle = "rgba(156, 163, 175, 0.45)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx, sysY + staffTop);
          ctx.lineTo(mx, sysY + staffTop + STAFF_HEIGHT);
          ctx.stroke();

          // Right bar line
          ctx.strokeStyle =
            mi === sys.measures.length - 1
              ? "rgba(156, 163, 175, 0.55)"
              : "rgba(156, 163, 175, 0.25)";
          ctx.lineWidth = mi === sys.measures.length - 1 ? 1.5 : 0.5;
          ctx.beginPath();
          ctx.moveTo(endMx, sysY + staffTop);
          ctx.lineTo(endMx, sysY + staffTop + STAFF_HEIGHT);
          ctx.stroke();

          // Measure number
          ctx.fillStyle = "#4b5563";
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(String(measure.index + 1), mx + MEASURE_INTERIOR / 2, sysY + 3);
        }

        // Tuning labels
        ctx.fillStyle = "#6b7280";
        ctx.font = "bold 10px 'SF Mono', 'Fira Code', monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let s = 0; s < STRING_COUNT; s++) {
          const sy = sysY + staffTop + s * STRING_SPACING;
          const label = tuning[STRING_COUNT - 1 - s];
          if (typeof label === "string" && label.length > 0) {
            ctx.fillText(label, LEFT_MARGIN - 6, sy);
          }
        }
      }

      // --- Draw fret numbers ---
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const sys of systems) {
        const sysY = sys.y;

        for (let mi = 0; mi < sys.measures.length; mi++) {
          const measure = sys.measures[mi];
          const mx = LEFT_MARGIN + mi * MEASURE_SPACING;

          for (const [, chord] of measure.chords) {
            const nx = mx + (chord.slot / SLOTS_PER_MEASURE) * MEASURE_INTERIOR;

            // Draw duration highlight bar for sustained notes
            for (const note of chord.notes) {
              const noteBeats = Math.max(0.125, (note.end_time - note.start_time) / beatDuration);
              const durationSlots = noteBeats * SUBDIVISIONS_PER_BEAT;
              const durPx = Math.min(
                MEASURE_INTERIOR * 0.85,
                (durationSlots / SLOTS_PER_MEASURE) * MEASURE_INTERIOR * 0.85,
              );

              const s = STRING_COUNT - 1 - note.string;
              if (s < 0 || s >= STRING_COUNT) continue;
              const sy = sysY + staffTop + s * STRING_SPACING;

              if (durPx > 8) {
                ctx.fillStyle = "rgba(251, 146, 60, 0.1)";
                ctx.fillRect(nx - 2, sy - 8, durPx, 16);
              }
            }

            // Fret numbers (centered on string line)
            for (const note of chord.notes) {
              const s = STRING_COUNT - 1 - note.string;
              if (s < 0 || s >= STRING_COUNT) continue;
              const sy = sysY + staffTop + s * STRING_SPACING;

              const fret = validateFret(note);
              const isOpen = fret === 0;

              if (isOpen) {
                ctx.strokeStyle = "#fb923c";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.ellipse(nx, sy, 6, 5, 0, 0, Math.PI * 2);
                ctx.stroke();
              } else {
                const fretText = fret > 0 ? String(fret) : "?";
                ctx.fillStyle = fret > 0 ? "#fb923c" : "#ef4444";
                ctx.font = "bold 11px 'SF Mono', 'Fira Code', monospace";
                ctx.fillText(fretText, nx, sy);

                // Note name below
                if (note.note_name) {
                  ctx.fillStyle = "#4b5563";
                  ctx.font = "7px 'SF Mono', monospace";
                  ctx.fillText(note.note_name, nx, sy + 10);
                }
              }
            }
          }
        }
      }
    },
    [layout, tuning],
  );

  // Render full canvas (static + playhead)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;

    const dpr = window.devicePixelRatio || 1;
    const width = LEFT_MARGIN + Math.min(layout.totalMeasures, measuresPerRow) * MEASURE_SPACING + RIGHT_MARGIN;
    const height = layout.systems.length * SYSTEM_HEIGHT;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // --- Blit offscreen static layer ---
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas");
    }
    const off = offscreenRef.current;
    off.width = width * dpr;
    off.height = height * dpr;

    const offCtx = off.getContext("2d");
    if (offCtx) {
      offCtx.save();
      offCtx.scale(dpr, dpr);
      drawStaticTab(offCtx, width, height);
      offCtx.restore();
    }

    ctx.drawImage(off, 0, 0);

    // --- Playhead ---
    if (isPlaying && currentTime >= 0 && currentTime <= durationSecs) {
      const staffTop = TOP_MARGIN;
      const totalBeats = currentTime / layout.beatDuration;
      const measureIdx = Math.floor(totalBeats / BEATS_PER_MEASURE);

      if (measureIdx < layout.totalMeasures) {
        const beatInMeasure =
          ((totalBeats - measureIdx * BEATS_PER_MEASURE) % BEATS_PER_MEASURE + BEATS_PER_MEASURE) % BEATS_PER_MEASURE;
        const row = Math.floor(measureIdx / measuresPerRow);
        const col = measureIdx % measuresPerRow;

        if (row < layout.systems.length) {
          const sys = layout.systems[row];
          const px = LEFT_MARGIN + col * MEASURE_SPACING + (beatInMeasure / BEATS_PER_MEASURE) * MEASURE_INTERIOR;
          const py = sys.y + staffTop;

          ctx.save();
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(34, 211, 238, 0.7)";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, Math.floor(sys.y) + staffTop + STAFF_HEIGHT);
          ctx.stroke();
          ctx.restore();

          // Triangle marker at top
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 4, Math.floor(sys.y) + TOP_MARGIN - 2);
          ctx.lineTo(px + 4, Math.floor(sys.y) + TOP_MARGIN - 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }, [layout, currentTime, isPlaying, durationSecs, measuresPerRow, drawStaticTab]);

  // Initial + update render
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (!isPlaying || currentTime < 0 || !layout) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const totalBeats = currentTime / layout.beatDuration;
    const measureIdx = Math.floor(totalBeats / BEATS_PER_MEASURE);
    const col = measureIdx % measuresPerRow;
    const playheadX = LEFT_MARGIN + col * MEASURE_SPACING + 80;

    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    const margin = 100;

    if (playheadX > viewRight - margin) {
      scrollEl.scrollTo({ left: playheadX - scrollEl.clientWidth + margin, behavior: "smooth" });
    } else if (playheadX < viewLeft + 40) {
      scrollEl.scrollTo({ left: Math.max(0, playheadX - 40), behavior: "smooth" });
    }
  }, [currentTime, isPlaying, layout, measuresPerRow]);

  if (!layout || notes.length === 0) return null;

  const width =
    LEFT_MARGIN + Math.min(layout.totalMeasures, measuresPerRow) * MEASURE_SPACING + RIGHT_MARGIN;
  const height = layout.systems.length * SYSTEM_HEIGHT;

  return (
    <div className="rounded-lg border border-orange-400/20 overflow-hidden">
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: Math.min(height + 8, 640) }}
      >
        <div ref={containerRef} className="relative" style={{ width, height }}>
          <canvas ref={canvasRef} className="block" />
        </div>
      </div>
      <div className="px-3 py-1.5 bg-[#0f0f17] border-t border-orange-400/10 flex items-center gap-4 text-[10px] text-daw-text-dim">
        <span>
          {layout.totalMeasures} measures
        </span>
        <span className="text-violet-400">
          4/4
        </span>
      </div>
    </div>
  );
}
