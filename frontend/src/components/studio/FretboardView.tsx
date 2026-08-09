"use client";

import type { TabNote } from "@/lib/api";

interface Props {
  tuning: string[];
  activeNotes: TabNote[];
  allNotes: TabNote[];
  showAll?: boolean;
}

const FRET_COUNT = 12;
const FRET_WIDTH = 36;
const STRING_SPACING = 28;
const PADDING_X = 48;
const PADDING_Y = 20;
const NUT_WIDTH = 4;

const FRET_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DOT_FRETS = [3, 5, 7, 9, 12];

export function FretboardView({ tuning, activeNotes, allNotes, showAll = false }: Props) {
  const stringCount = tuning.length;
  const totalWidth = PADDING_X * 2 + FRET_COUNT * FRET_WIDTH;
  const totalHeight = PADDING_Y * 2 + (stringCount - 1) * STRING_SPACING;

  const notesToShow = showAll ? allNotes : activeNotes;
  const noteStrings = new Set(notesToShow.map((n) => n.string));
  const noteFrets = new Map<string, boolean>();
  for (const n of notesToShow) {
    noteFrets.set(`${n.string}-${n.fret}`, true);
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="w-full min-w-[520px]"
        style={{ maxWidth: 600 }}
      >
        {/* Background */}
        <rect x="0" y="0" width={totalWidth} height={totalHeight} fill="#181825" rx="6" />

        {/* Nut */}
        <rect
          x={PADDING_X - NUT_WIDTH}
          y={PADDING_Y - 4}
          width={NUT_WIDTH}
          height={(stringCount - 1) * STRING_SPACING + 8}
          fill="#a78bfa"
        />

        {/* Frets */}
        {FRET_POSITIONS.map((fret, i) => {
          const x = PADDING_X + (i + 1) * FRET_WIDTH;
          return (
            <line
              key={fret}
              x1={x}
              y1={PADDING_Y - 2}
              x2={x}
              y2={PADDING_Y + (stringCount - 1) * STRING_SPACING + 2}
              stroke={fret === 1 ? "#a78bfa" : "rgba(167, 139, 250, 0.3)"}
              strokeWidth={fret === 12 ? 2 : 1}
            />
          );
        })}

        {/* Fret markers */}
        {DOT_FRETS.map((fret) => {
          const idx = FRET_POSITIONS.indexOf(fret);
          const x = PADDING_X + (idx + 0.5) * FRET_WIDTH;
          const centerY = PADDING_Y + ((stringCount - 1) * STRING_SPACING) / 2;
          const radius = fret === 12 ? 6 : 4;
          return (
            <circle
              key={`dot-${fret}`}
              cx={x}
              cy={fret === 12 ? centerY - FRET_WIDTH * 0.4 : centerY}
              r={radius}
              fill="rgba(167, 139, 250, 0.25)"
            />
          );
        })}

        {/* Strings */}
        {Array.from({ length: stringCount }).map((_, i) => {
          const y = PADDING_Y + i * STRING_SPACING;
          const thickness = i === 0 ? 2.5 : i === 1 ? 2.2 : i === 2 ? 2 : i === 3 ? 1.2 : i === 4 ? 1 : 0.8;
          return (
            <line
              key={`string-${i}`}
              x1={PADDING_X}
              y1={y}
              x2={PADDING_X + FRET_COUNT * FRET_WIDTH}
              y2={y}
              stroke={i < 3 ? "#e2e8f0" : "#94a3b8"}
              strokeWidth={thickness}
            />
          );
        })}

        {/* Tuning labels */}
        {tuning.slice().reverse().map((name, i) => {
          const y = PADDING_Y + (stringCount - 1 - i) * STRING_SPACING;
          return (
            <text
              key={`label-${i}`}
              x={PADDING_X - 12}
              y={y + 4}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="10"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {name}
            </text>
          );
        })}

        {/* Fret number labels */}
        {FRET_POSITIONS.map((fret, i) => {
          if (fret % 2 !== 0 && fret !== 1) return null;
          const x = PADDING_X + (i + 0.5) * FRET_WIDTH;
          return (
            <text
              key={`fnum-${fret}`}
              x={x}
              y={totalHeight - 4}
              textAnchor="middle"
              fill="rgba(148, 163, 184, 0.5)"
              fontSize="9"
              fontFamily="monospace"
            >
              {fret}
            </text>
          );
        })}

        {/* Note markers */}
        {notesToShow.map((note, i) => {
          const y = PADDING_Y + (stringCount - 1 - note.string) * STRING_SPACING;
          const fretIdx = FRET_POSITIONS.indexOf(note.fret);
          const x = fretIdx >= 0
            ? PADDING_X + (fretIdx + 0.5) * FRET_WIDTH
            : PADDING_X + (note.fret - 0.5) * (FRET_WIDTH * 0.6);

          const isActive = !showAll;
          const size = isActive ? 12 : 8;
          return (
            <g key={`note-${i}`}>
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r={size + 3}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={1.5}
                  opacity={0.6}
                >
                  <animate
                    attributeName="r"
                    values={`${size + 2};${size + 5};${size + 2}`}
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0.2;0.6"
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={x}
                cy={y}
                r={size}
                fill={isActive ? "#22d3ee" : "rgba(34, 211, 238, 0.4)"}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill={isActive ? "#0f172a" : "#e2e8f0"}
                fontSize={isActive ? "9" : "7"}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {note.fret}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
