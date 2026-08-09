"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export interface AutomationPoint {
  time: number;
  value: number;
}

interface Props {
  points: AutomationPoint[];
  maxDuration: number;
  label: string;
  color: string;
  height?: number;
  valueMin?: number;
  valueMax?: number;
  formatValue?: (v: number) => string;
  onPointsChange: (points: AutomationPoint[]) => void;
}

export function AutomationLane({
  points,
  maxDuration,
  label,
  color,
  height = 80,
  valueMin = 0,
  valueMax = 1,
  formatValue = (v) => (v * 100).toFixed(0) + "%",
  onPointsChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalDuration = Math.max(maxDuration, 10);

  function valueToY(v: number): number {
    const range = valueMax - valueMin;
    return height - ((v - valueMin) / range) * height;
  }

  function yToValue(y: number): number {
    const range = valueMax - valueMin;
    return valueMin + ((height - y) / height) * range;
  }

  function timeToX(t: number, w: number): number {
    return (t / totalDuration) * w;
  }

  function xToTime(x: number, w: number): number {
    return (x / w) * totalDuration;
  }

  // Build SVG path for the envelope line
  function buildPath(w: number): string {
    if (points.length === 0) return "";
    const sorted = [...points].sort((a, b) => a.time - b.time);

    // Start from left edge using first point's value (flat)
    let d = `M 0,${valueToY(sorted[0].value)}`;
    for (const p of sorted) {
      d += ` L ${timeToX(p.time, w)},${valueToY(p.value)}`;
    }
    // Extend to right edge using last point's value (flat)
    if (sorted.length > 0) {
      d += ` L ${w},${valueToY(sorted[sorted.length - 1].value)}`;
    }
    return d;
  }

  function buildFillPath(w: number): string {
    const linePath = buildPath(w);
    if (!linePath) return "";
    return `${linePath} L ${w},${height} L 0,${height} Z`;
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;

      const t = xToTime(x, w);
      const v = yToValue(y);
      const clampedV = Math.max(valueMin, Math.min(valueMax, v));
      const clampedT = Math.max(0, Math.min(totalDuration, t));

      onPointsChange(
        [...points, { time: Math.round(clampedT * 100) / 100, value: Math.round(clampedV * 100) / 100 }]
          .sort((a, b) => a.time - b.time)
      );
    },
    [points, onPointsChange, xToTime, yToValue, valueMin, valueMax, totalDuration]
  );

  const handlePointMouseDown = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.stopPropagation();
      setDraggingIdx(idx);
    },
    []
  );

  const handleDoubleClick = useCallback(
    (idx: number) => {
      const newPts = points.filter((_, i) => i !== idx);
      onPointsChange(newPts);
    },
    [points, onPointsChange]
  );

  useEffect(() => {
    if (draggingIdx === null) return;

    function onMove(e: MouseEvent) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;

      const t = xToTime(x, w);
      const v = yToValue(y);
      const newPts = [...points];
      newPts[draggingIdx!] = {
        time: Math.round(Math.max(0, Math.min(totalDuration, t)) * 100) / 100,
        value: Math.round(Math.max(valueMin, Math.min(valueMax, v)) * 100) / 100,
      };
      onPointsChange(newPts);
    }

    function onUp() {
      setDraggingIdx(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingIdx, points, onPointsChange, xToTime, yToValue, valueMin, valueMax, totalDuration]);

  // Sort points for rendering
  const sorted = [...points].sort((a, b) => a.time - b.time);

  return (
    <div className="relative rounded bg-daw-surface-1 border-t border-daw-border">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-[9px] text-daw-text-dim uppercase tracking-wider">{label}</span>
        {points.length > 0 && (
          <span className="text-[9px] text-daw-text-dim">{points.length} pts</span>
        )}
      </div>
      <div style={{ height, position: "relative" }}>
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          className="block cursor-crosshair"
          onMouseDown={handleMouseDown}
          style={{ display: "block" }}
        >
          {/* Grid lines */}
          <line x1="0" y1={height * 0.25} x2="100%" y2={height * 0.25} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <line x1="0" y1={height * 0.5} x2="100%" y2={height * 0.5} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1="0" y1={height * 0.75} x2="100%" y2={height * 0.75} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

          {/* Fill area under the curve */}
          <path d={buildFillPath(100)} fill={color + "15"} />

          {/* Envelope line */}
          <path
            d={buildPath(100)}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />

          {/* Points */}
          {sorted.map((pt, idx) => (
            <g key={idx}>
              <circle
                cx={`${(pt.time / totalDuration) * 100}%`}
                cy={valueToY(pt.value)}
                r={draggingIdx === idx || hoveredIdx === idx ? 7 : 4}
                fill={color}
                stroke={draggingIdx === idx ? "#fff" : "transparent"}
                strokeWidth="2"
                style={{ cursor: "grab" }}
                onMouseDown={(e) => handlePointMouseDown(e, idx)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onDoubleClick={() => handleDoubleClick(idx)}
              />
              {(draggingIdx === idx || hoveredIdx === idx) && (
                <text
                  x={`${(pt.time / totalDuration) * 100}%`}
                  y={valueToY(pt.value) - 12}
                  textAnchor="middle"
                  fill="#e0e0f0"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {pt.time.toFixed(1)}s {formatValue(pt.value)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
