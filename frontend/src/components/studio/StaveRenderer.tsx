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
}

function quantizeNotes(notes: TabNote[], _durationSecs: number): QuantizedNote[] {
  if (notes.length === 0) {
    return [{ key: "B4", isRest: true }];
  }
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  return sorted.map((note) => ({
    key: pitchToVexKey(note.pitch),
    isRest: false,
  }));
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

        const parts: string[] = quantizedNotes.map((note) =>
          note.isRest ? "B4/w/r" : `${note.key}/q`
        );

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
  }, [quantizedNotes, notes.length]);

  if (notes.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-violet-400/20 bg-[#0f0f1a]">
      <div id="stave-container" ref={containerRef} />
    </div>
  );
}
