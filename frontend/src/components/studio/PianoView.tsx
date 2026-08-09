"use client";

import type { TabNote } from "@/lib/api";

interface Props {
  activeNotes: TabNote[];
  allNotes: TabNote[];
  startOctave?: number;
  octaveCount?: number;
}

const WHITE_KEY_WIDTH = 22;
const WHITE_KEY_HEIGHT = 80;
const BLACK_KEY_WIDTH = 13;
const BLACK_KEY_HEIGHT = 50;

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11];
const WHITE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_NOTES = [1, 3, 6, 8, 10];
const BLACK_OFFSETS: Record<number, number> = {
  1: WHITE_KEY_WIDTH * (2 / 3),
  3: WHITE_KEY_WIDTH * (5 / 3),
  6: WHITE_KEY_WIDTH * (8 / 3),
  8: WHITE_KEY_WIDTH * (11 / 3),
  10: WHITE_KEY_WIDTH * (14 / 3),
};

export function PianoView({
  activeNotes,
  allNotes,
  startOctave = 2,
  octaveCount = 4,
}: Props) {
  const endOctave = startOctave + octaveCount;
  const totalWhiteKeys = octaveCount * 7;
  const totalWidth = totalWhiteKeys * WHITE_KEY_WIDTH;
  const totalHeight = WHITE_KEY_HEIGHT;

  const activePitches = new Set(activeNotes.map((n) => n.pitch));
  const allPitches = new Set(allNotes.map((n) => n.pitch));

  const keys: { pitch: number; name: string; octave: number; isBlack: boolean; x: number; w: number }[] = [];

  let whiteIdx = 0;
  for (let oct = startOctave; oct < endOctave; oct++) {
    // White keys
    for (let w = 0; w < WHITE_NAMES.length; w++) {
      const pitch = oct * 12 + WHITE_NOTES[w];
      keys.push({
        pitch,
        name: `${WHITE_NAMES[w]}${oct}`,
        octave: oct,
        isBlack: false,
        x: whiteIdx * WHITE_KEY_WIDTH,
        w: WHITE_KEY_WIDTH,
      });
      whiteIdx++;
    }
  }

  // Black keys (overlay)
  whiteIdx = 0;
  for (let oct = startOctave; oct < endOctave; oct++) {
    const baseX = (oct - startOctave) * 7 * WHITE_KEY_WIDTH;
    for (const bn of BLACK_NOTES) {
      const pitch = oct * 12 + bn;
      const offset = BLACK_OFFSETS[bn] ?? 0;
      keys.push({
        pitch,
        name: "",
        octave: oct,
        isBlack: true,
        x: baseX + offset - BLACK_KEY_WIDTH / 2 + 1,
        w: BLACK_KEY_WIDTH,
      });
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="w-full min-w-[400px]"
        style={{ maxWidth: 640 }}
      >
        {/* White keys */}
        {keys
          .filter((k) => !k.isBlack)
          .map((key) => {
            const isActive = activePitches.has(key.pitch);
            const isInSong = allPitches.has(key.pitch);
            const fill = isActive
              ? "#22d3ee"
              : isInSong
                ? "rgba(34, 211, 238, 0.2)"
                : "#1e1e2e";
            const stroke = isInSong && !isActive ? "rgba(34, 211, 238, 0.3)" : "rgba(148, 163, 184, 0.2)";
            return (
              <g key={`wk-${key.pitch}`}>
                <rect
                  x={key.x}
                  y={0}
                  width={key.w}
                  height={WHITE_KEY_HEIGHT}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.5}
                  rx={0}
                />
                {isActive && (
                  <animate
                    attributeName="opacity"
                    values="1;0.7;1"
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                )}
                <text
                  x={key.x + key.w / 2}
                  y={WHITE_KEY_HEIGHT - 8}
                  textAnchor="middle"
                  fill={isActive ? "#0f172a" : "rgba(148, 163, 184, 0.4)"}
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {key.name}
                </text>
              </g>
            );
          })}

        {/* Black keys */}
        {keys
          .filter((k) => k.isBlack)
          .map((key) => {
            const isActive = activePitches.has(key.pitch);
            const isInSong = allPitches.has(key.pitch);
            const fill = isActive ? "#22d3ee" : isInSong ? "rgba(34, 211, 238, 0.3)" : "#11111a";
            return (
              <rect
                key={`bk-${key.pitch}`}
                x={key.x}
                y={0}
                width={key.w}
                height={BLACK_KEY_HEIGHT}
                fill={fill}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.5}
                rx={1}
              />
            );
          })}

        {/* Bottom bar */}
        <rect x={0} y={WHITE_KEY_HEIGHT - 2} width={totalWidth} height={2} fill="rgba(167, 139, 250, 0.15)" />
      </svg>
    </div>
  );
}
