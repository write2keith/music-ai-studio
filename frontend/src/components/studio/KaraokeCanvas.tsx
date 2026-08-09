"use client";

import { useRef, useEffect, useCallback } from "react";

export type LyricWord = { text: string; start: number; end: number };
export type LyricLine = { words: LyricWord[]; start: number; end: number };

interface KaraokeCanvasProps {
  lines: LyricLine[];
  currentTime: number;
  backgroundImage: HTMLImageElement | null;
  backgroundVideo: HTMLVideoElement | null;
  backgroundColor: string;
  width: number;
  height: number;
  isRecording: boolean;
  className?: string;
}

const LINE_HEIGHT = 52;
const FONT_FAMILY = "'Inter', system-ui, sans-serif";
const ACTIVE_COLOR = "#22d3ee";
const INACTIVE_COLOR = "rgba(148, 163, 184, 0.35)";
const SUNG_COLOR = "#a855f7";

export function KaraokeCanvas({
  lines,
  currentTime,
  backgroundImage,
  backgroundVideo,
  backgroundColor,
  width,
  height,
  isRecording,
  className,
}: KaraokeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (backgroundVideo && backgroundVideo.readyState >= 2) {
      ctx.drawImage(backgroundVideo, 0, 0, width, height);
    } else if (backgroundImage) {
      const imgW = backgroundImage.width;
      const imgH = backgroundImage.height;
      const scale = Math.max(width / imgW, height / imgH);
      const sw = width / scale;
      const sh = height / scale;
      const sx = (imgW - sw) / 2;
      const sy = (imgH - sh) / 2;
      ctx.drawImage(backgroundImage, sx, sy, sw, sh, 0, 0, width, height);
    }

    // Darken background for text readability
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    // Find active line
    let activeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].start && currentTime <= lines[i].end) {
        activeLineIdx = i;
        break;
      }
    }

    const totalLines = lines.length;
    const visibleStart = Math.max(0, activeLineIdx - 2);
    const visibleLines = lines.slice(visibleStart, visibleStart + 5);
    const centerY = height / 2;

    visibleLines.forEach((line, vi) => {
      const lineIdx = visibleStart + vi;
      const isActive = lineIdx === activeLineIdx;
      const y = centerY + (vi - 1.5) * LINE_HEIGHT;

      // Calculate per-word progress
      let lineProgress = 0;
      if (isActive) {
        const duration = line.end - line.start;
        lineProgress = duration > 0 ? (currentTime - line.start) / duration : 0;
      }

      if (line.words.length === 0) {
        ctx.textAlign = "center";
        ctx.font = `bold 28px ${FONT_FAMILY}`;
        ctx.fillStyle = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
        const text = lines[lineIdx]?.words.map((w) => w.text).join(" ") || "";
        ctx.fillText(text, width / 2, y);
        return;
      }

      // Calculate total line width for centering
      ctx.font = `bold 28px ${FONT_FAMILY}`;
      let totalWidth = 0;
      const wordWidths: number[] = [];
      for (const w of line.words) {
        const m = ctx.measureText(w.text);
        wordWidths.push(m.width);
        totalWidth += m.width;
        if (w !== line.words[line.words.length - 1]) totalWidth += ctx.measureText(" ").width;
      }

      // Draw word by word
      let x = width / 2 - totalWidth / 2;
      const wordsProgress = isActive ? lineProgress * line.words.length : 0;

      for (let wi = 0; wi < line.words.length; wi++) {
        const word = line.words[wi];
        const wordW = wordWidths[wi];
        const spaceW = wi < line.words.length - 1 ? ctx.measureText(" ").width : 0;

        // Draw sung part (violet)
        if (isActive && wi < Math.floor(wordsProgress)) {
          ctx.fillStyle = SUNG_COLOR;
          ctx.fillText(word.text, x, y);
        }
        // Draw the active word being sung (cyan)
        else if (isActive && wi === Math.floor(wordsProgress)) {
          const frac = wordsProgress - Math.floor(wordsProgress);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y - 28, wordW, 36);
          ctx.clip();

          // Background sung
          ctx.fillStyle = SUNG_COLOR;
          ctx.fillText(word.text, x, y);

          // Foreground unsung portion (clipped right)
          ctx.fillStyle = ACTIVE_COLOR;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + wordW * frac, y - 28, wordW * (1 - frac), 36);
          ctx.clip();
          ctx.fillText(word.text, x, y);
          ctx.restore();

          ctx.restore();

          // Glow
          ctx.save();
          ctx.shadowColor = ACTIVE_COLOR;
          ctx.shadowBlur = 12;
          ctx.fillStyle = ACTIVE_COLOR;
          ctx.fillText(word.text, x, y);
          ctx.restore();
        }
        // Inactive words
        else {
          ctx.fillStyle = isActive && wi > Math.floor(wordsProgress) ? INACTIVE_COLOR : INACTIVE_COLOR;
          if (lineIdx < activeLineIdx) ctx.fillStyle = SUNG_COLOR + "99";
          if (lineIdx > activeLineIdx) ctx.fillStyle = INACTIVE_COLOR;
          ctx.fillText(word.text, x, y);
        }

        x += wordW + spaceW;
      }
    });

    // Recording indicator
    if (isRecording) {
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(20, 20, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
      ctx.beginPath();
      ctx.arc(20, 20, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(draw);
  }, [lines, currentTime, backgroundImage, backgroundVideo, backgroundColor, width, height, isRecording]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
