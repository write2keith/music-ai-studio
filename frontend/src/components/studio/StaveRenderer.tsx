"use client";

import { useRef, useEffect, useMemo } from "react";
import type { TabNote } from "@/lib/api";

interface Props {
  notes: TabNote[];
  durationSecs: number;
}

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function pitchToVexKey(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const noteIndex = pitch % 12;
  const name = NOTE_NAMES_SHORT[noteIndex];
  return `${name}/${octave}`;
}

function quantizeDuration(startDelta: number, endDelta: number): { duration: string; dots: number } {
  const dur = endDelta - startDelta;
  const sixteenth = 0.25;
  const eighth = 0.5;
  const quarter = 1.0;
  const half = 2.0;
  const whole = 4.0;

  if (dur <= sixteenth * 1.5) return { duration: "16", dots: 0 };
  if (dur <= eighth * 1.5) return { duration: "8", dots: 0 };
  if (dur <= quarter * 1.5) return { duration: "q", dots: 0 };
  if (dur <= quarter * 2.2) return { duration: "q", dots: 1 };
  if (dur <= half * 1.5) return { duration: "h", dots: 0 };
  if (dur <= whole * 1.5) return { duration: "w", dots: 0 };
  return { duration: "w", dots: 0 };
}

interface QuantizedNote {
  key: string;
  duration: string;
  dots: number;
  isRest: boolean;
}

function quantizeNotes(notes: TabNote[], durationSecs: number): QuantizedNote[] {
  if (notes.length === 0) {
    // Create a whole rest if no notes
    return [{ key: "B/4", duration: "w", dots: 0, isRest: true }];
  }

  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  const totalBeats = 16;
  const beatDuration = durationSecs / totalBeats;
  const ppb = beatDuration / 4; // per 16th

  const result: QuantizedNote[] = [];

  let currentBeat = 0;
  for (const note of sorted) {
    const startBeat = Math.round(note.start_time / ppb);
    const endBeat = Math.round(note.end_time / ppb);

    // Fill gaps with rests
    while (currentBeat < startBeat) {
      result.push({ key: "B/4", duration: "16", dots: 0, isRest: true });
      currentBeat += 1;
    }

    const beatLen = Math.max(1, endBeat - startBeat);
    let durStr = "16";
    let dots = 0;
    if (beatLen >= 16) { durStr = "w"; dots = 0; }
    else if (beatLen >= 8) { durStr = "h"; dots = 0; }
    else if (beatLen >= 6) { durStr = "q"; dots = 1; }
    else if (beatLen >= 4) { durStr = "q"; dots = 0; }
    else if (beatLen >= 3) { durStr = "8"; dots = 1; }
    else if (beatLen >= 2) { durStr = "8"; dots = 0; }

    result.push({
      key: pitchToVexKey(note.pitch),
      duration: durStr,
      dots,
      isRest: false,
    });
    currentBeat = endBeat;
  }

  return result;
}

export function StaveRenderer({ notes, durationSecs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const quantizedNotes = useMemo(
    () => quantizeNotes(notes, durationSecs),
    [notes, durationSecs]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || notes.length === 0) return;

    let mounted = true;

    const renderStave = async () => {
      try {
        const VF = await import("vexflow");
        container.innerHTML = "";

        const width = Math.max(800, quantizedNotes.length * 36 + 100);
        const height = 160;

        const { Factory } = VF;
        const vf = new Factory({
          renderer: {
            elementId: container.id || "stave-container",
            width,
            height,
          },
        });

        const score = vf.EasyScore();
        const system = vf.System({ x: 20, y: 20, width: width - 40 });

        // Build note string for EasyScore
        const parts: string[] = [];
        for (const note of quantizedNotes) {
          if (note.isRest) {
            parts.push(`${note.key}/${note.duration}`);
          } else {
            const dots = note.dots > 0 ? ".".repeat(note.dots) : "";
            parts.push(`${note.key}${dots}/${note.duration}`);
          }
        }

        if (parts.length > 0) {
          system
            .addStave({
              voices: [score.voice(score.notes(parts.join(", "), { clef: "treble" }))],
            })
            .addClef("treble")
            .addTimeSignature("4/4");
        }

        vf.draw();
      } catch (err) {
        console.warn("VexFlow render error:", err);
      }
    };

    renderStave();

    return () => {
      mounted = false;
    };
  }, [quantizedNotes]);

  if (notes.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-violet-400/20 bg-[#0f0f1a]">
      <div id="stave-container" ref={containerRef} />
    </div>
  );
}
