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
  isPlaying: boolean;
  titleText?: string;
  className?: string;
}

const LINE_HEIGHT = 56;
const FONT_FAMILY = "'Inter', system-ui, -apple-system, sans-serif";
const FONT_SIZE = 30;
const FONT_SONG = "bold 30px";
const FONT_INACTIVE = "24px";
const VISIBLE_BEFORE = 2;
const VISIBLE_AFTER = 2;

export function formatTime(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "00:00.00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export function KaraokeCanvas({
  lines,
  currentTime,
  backgroundImage,
  backgroundVideo,
  backgroundColor,
  width,
  height,
  isRecording,
  isPlaying,
  titleText,
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (backgroundVideo && backgroundVideo.readyState >= 2) {
      const vw = backgroundVideo.videoWidth || width;
      const vh = backgroundVideo.videoHeight || height;
      const scale = Math.max(width / vw, height / vh);
      const sw = width / scale;
      const sh = height / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      ctx.drawImage(backgroundVideo, sx, sy, sw, sh, 0, 0, width, height);
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, width, height);

    // Vignette effect
    const vignetteGrad = ctx.createRadialGradient(width / 2, height / 2, width * 0.4, width / 2, height / 2, width * 0.75);
    vignetteGrad.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGrad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);

    // Title text (bottom-left)
    if (titleText) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = `10px ${FONT_FAMILY}`;
      ctx.textAlign = "left";
      ctx.fillText(titleText, 14, height - 14);
    }

    // Time display (top-right)
    if (isPlaying || currentTime > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = `10px monospace`;
      ctx.textAlign = "right";
      ctx.fillText(formatTime(currentTime), width - 14, 18);
    }

    // Find active line index
    let activeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].start && currentTime <= lines[i].end) {
        activeLineIdx = i;
        break;
      }
    }
    if (activeLineIdx < 0 && lines.length > 0) {
      if (currentTime < lines[0].start) activeLineIdx = 0;
      else if (currentTime > lines[lines.length - 1].end) activeLineIdx = lines.length - 1;
    }

    const visibleStart = Math.max(0, activeLineIdx - VISIBLE_BEFORE);
    const visibleEnd = Math.min(lines.length, activeLineIdx + VISIBLE_AFTER + 1);
    const visibleLines = lines.slice(visibleStart, visibleEnd);
    const centerY = height / 2;

    // Pre-compute layout centers for all visible lines
    const lineLayouts: { totalW: number; wordWidths: number[]; spaceW: number }[] = [];
    ctx.font = FONT_SONG + " " + FONT_FAMILY;
    for (const line of visibleLines) {
      if (line.words.length === 0) {
        lineLayouts.push({ totalW: 0, wordWidths: [], spaceW: 0 });
        continue;
      }
      const wordWidths = line.words.map((w) => ctx.measureText(w.text).width);
      const spaceW = ctx.measureText(" ").width;
      const totalW = wordWidths.reduce((a, b) => a + b, 0) + spaceW * (line.words.length - 1);
      lineLayouts.push({ totalW, wordWidths, spaceW });
    }

    // Track active line's active word for glow effect
    let activeWordW = 0;
    let activeWordX = 0;
    let activeWordFrac = 0;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    visibleLines.forEach((line, vi) => {
      const lineIdx = visibleStart + vi;
      const isActive = lineIdx === activeLineIdx;
      const y = centerY + (vi - VISIBLE_BEFORE - 0.5) * LINE_HEIGHT;

      if (line.words.length === 0) return;

      const layout = lineLayouts[vi];
      if (layout.wordWidths.length === 0) return;

      const fullText = line.words.map((w) => w.text).join(" ");

      if (!isActive) {
        // Inactive line: draw full text centered
        ctx.font = `${FONT_INACTIVE} ${FONT_FAMILY}`;
        const m = ctx.measureText(fullText);

        if (lineIdx < activeLineIdx) {
          // Past line: dim violet
          ctx.fillStyle = "rgba(168, 85, 247, 0.45)";
        } else {
          // Future line: dim gray
          ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
        }
        ctx.textAlign = "center";
        ctx.fillText(fullText, width / 2, y);
        ctx.textAlign = "left";
        return;
      }

      // Active line: per-word timing wipe
      ctx.font = FONT_SONG + " " + FONT_FAMILY;
      let x = width / 2 - layout.totalW / 2;

      for (let wi = 0; wi < line.words.length; wi++) {
        const word = line.words[wi];
        const wW = layout.wordWidths[wi];
        const wordDur = word.end - word.start;
        const wordProgress = wordDur > 0
          ? Math.max(0, Math.min(1, (currentTime - word.start) / wordDur))
          : (currentTime >= word.start ? 1 : 0);

        if (wordProgress >= 1) {
          // Fully sung word
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#a855f7";
          ctx.fillText(word.text, x, y);
        } else if (wordProgress > 0) {
          // Partially sung — color wipe
          const sungW = wW * wordProgress;
          const unsungW = wW * (1 - wordProgress);

          // Sung portion (purple)
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y - LINE_HEIGHT / 2, sungW + 1, LINE_HEIGHT);
          ctx.clip();
          ctx.fillStyle = "#a855f7";
          ctx.fillText(word.text, x, y);
          ctx.restore();

          // Unsung portion (cyan glow)
          ctx.save();
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.rect(x + sungW, y - LINE_HEIGHT / 2, unsungW + 2, LINE_HEIGHT);
          ctx.clip();
          ctx.fillStyle = "#22d3ee";
          ctx.fillText(word.text, x, y);
          ctx.restore();

          // Track for glow underline
          activeWordW = wW;
          activeWordX = x;
          activeWordFrac = wordProgress;
        } else {
          // Not yet sung
          ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
          ctx.fillText(word.text, x, y);
        }

        x += wW + layout.spaceW;
      }
    });

    // Glowing underline for the active syllable
    if (activeWordW > 0 && activeLineIdx >= 0) {
      const activeVi = activeLineIdx - visibleStart;
      if (activeVi >= 0 && activeVi < visibleLines.length) {
        const ay = centerY + (activeVi - VISIBLE_BEFORE - 0.5) * LINE_HEIGHT;
        const line = visibleLines[activeVi];
        if (line.words.length > 0 && lineLayouts[activeVi]) {
          const layout = lineLayouts[activeVi];
          const startX = width / 2 - layout.totalW / 2;
          const sungEndX = activeWordX + activeWordW * activeWordFrac;

          // Underline: sung portion
          ctx.strokeStyle = "#a855f7";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(startX, ay + LINE_HEIGHT * 0.35);
          ctx.lineTo(sungEndX, ay + LINE_HEIGHT * 0.35);
          ctx.stroke();

          // Underline: remaining with glow
          ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(sungEndX, ay + LINE_HEIGHT * 0.35);
          ctx.lineTo(startX + layout.totalW, ay + LINE_HEIGHT * 0.35);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    ctx.textBaseline = "alphabetic";

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

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `9px monospace`;
      ctx.textAlign = "left";
      ctx.fillText("REC", 32, 23);
    }

    if (!isRecording) {
      animRef.current = requestAnimationFrame(draw);
    }
  }, [lines, currentTime, backgroundImage, backgroundVideo, backgroundColor, width, height, isRecording, isPlaying, titleText]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: `${width}px`, height: `${height}px`, maxWidth: "100%" }}
    />
  );
}
