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
  return `${name[0]}${name.includes("#") ? "#" : ""}${octave}`;
}

interface QuantizedNote {
  key: string;
  isRest: boolean;
  vexDuration: string;
}

function quantizeNotes(notes: TabNote[], _durationSecs: number): QuantizedNote[] {
  if (notes.length === 0) {
    return [{ key: "B4", isRest: true, vexDuration: "w" }];
  }
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  return sorted.map((note) => {
    const dur = note.end_time - note.start_time;
    let vexDuration: string;
    if (dur < 0.15) vexDuration = "16";
    else if (dur < 0.28) vexDuration = "8";
    else if (dur < 0.6) vexDuration = "q";
    else if (dur < 1.2) vexDuration = "h";
    else vexDuration = "w";
    return {
      key: pitchToVexKey(note.pitch),
      isRest: false,
      vexDuration,
    };
  });
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

    renderStave(container, quantizedNotes);
  }, [quantizedNotes, notes.length]);

  if (notes.length === 0) return null;

  return (
    <div
      id="stave-container"
      className="overflow-x-auto rounded-lg border border-gray-300 bg-white"
      ref={containerRef}
    />
  );
}

async function renderStave(container: HTMLDivElement, quantizedNotes: QuantizedNote[]) {
  try {
    const VF = await import("vexflow");
    const { Factory, EasyScore } = VF;

    container.innerHTML = "";

    const width = Math.max(800, quantizedNotes.length * 42 + 100);
    const height = 180;

    const factory = new Factory({
      renderer: { elementId: "stave-container", width, height },
    });

    const score = new EasyScore();
    const system = factory.System({ x: 20, y: 20, width: width - 40 });

    const parts: string[] = quantizedNotes.map((note) =>
      note.isRest
        ? `B4/${note.vexDuration}/r`
        : `${note.key}/${note.vexDuration}`
    );

    if (parts.length > 0) {
      system
        .addStave({
          voices: [
            score.voice(
              score.notes(parts.join(", "), { clef: "treble" })
            ),
          ],
        })
        .addClef("treble")
        .addTimeSignature("4/4");
    }

    factory.draw();
  } catch (err) {
    console.warn("VexFlow render error:", err);
  }
}
