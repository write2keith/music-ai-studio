"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Minimize2, Pause, Play, SkipForward, SkipBack, Download, Sparkles, FileDown } from "lucide-react";
import type { LyricLineDetailed } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FullscreenLyricsProps {
  lines: LyricLineDetailed[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  title: string;
  artist: string;
  /** URL for album/artist artwork */
  artworkUrl?: string;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onExit: () => void;
  onSkipForward?: () => void;
  onSkipBack?: () => void;
  onSkipNext?: () => void;
  onExportCdg?: () => void;
  onExportAss?: () => void;
  onCorrectLyrics?: () => void;
}

const getActiveFontSize = (text: string | undefined) => {
  if (!text) return "clamp(2.5rem, 6vw, 4.5rem)";
  const len = text.length;
  if (len < 25) return "clamp(2.5rem, 6vw, 4.5rem)";
  if (len < 45) return "clamp(2rem, 5.2vw, 3.8rem)";
  if (len < 70) return "clamp(1.6rem, 4.5vw, 3rem)";
  return "clamp(1.2rem, 3.8vw, 2.2rem)";
};

const getSecondaryFontSize = (text: string | undefined, isNext = false) => {
  if (!text) return isNext ? "clamp(1.5rem, 3vw, 2.2rem)" : "clamp(1.2rem, 2.5vw, 1.8rem)";
  const len = text.length;
  if (len < 30) {
    return isNext ? "clamp(1.5rem, 3vw, 2.2rem)" : "clamp(1.2rem, 2.5vw, 1.8rem)";
  }
  if (len < 60) {
    return isNext ? "clamp(1.2rem, 2.5vw, 1.8rem)" : "clamp(1rem, 2vw, 1.5rem)";
  }
  return isNext ? "clamp(1rem, 2.2vw, 1.4rem)" : "clamp(0.85rem, 1.8vw, 1.2rem)";
};

export default function FullscreenLyrics({
  lines,
  currentTime,
  duration,
  isPlaying,
  title,
  artist,
  artworkUrl,
  onTogglePlay,
  onSeek,
  onExit,
  onSkipForward,
  onSkipBack,
  onSkipNext,
  onExportCdg,
  onExportAss,
  onCorrectLyrics,
}: FullscreenLyricsProps) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showControls = () => {
      setControlsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };

    showControls();
    window.addEventListener("mousemove", showControls);
    window.addEventListener("keydown", showControls);
    window.addEventListener("mousedown", showControls);

    return () => {
      window.removeEventListener("mousemove", showControls);
      window.removeEventListener("keydown", showControls);
      window.removeEventListener("mousedown", showControls);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); onTogglePlay(); }
      if (e.code === "ArrowLeft") { onSeek(Math.max(0, currentTime - 5)); }
      if (e.code === "ArrowRight") { onSeek(Math.min(duration, currentTime + 5)); }
      if (e.code === "Escape" || e.code === "KeyF") { onExit(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentTime, duration, onTogglePlay, onSeek, onExit]);

  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].start && currentTime < lines[i].end) {
      activeIdx = i;
      break;
    }
    if (currentTime < lines[i].start) {
      activeIdx = Math.max(0, i - 1);
      break;
    }
  }
  if (activeIdx < 0 && lines.length > 0) activeIdx = lines.length - 1;

  const activeText = activeIdx >= 0 && activeIdx < lines.length
    ? lines[activeIdx].words.map((w) => w.word).join(" ")
    : "\u266A Instrumental \u266A";
  const prevText = activeIdx > 0
    ? lines[activeIdx - 1].words.map((w) => w.word).join(" ")
    : "";
  const nextText = activeIdx < lines.length - 1
    ? lines[activeIdx + 1].words.map((w) => w.word).join(" ")
    : "";

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const seekPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#030712] flex flex-col"
      style={{ cursor: controlsVisible ? "default" : "none" }}
    >
      {artworkUrl && (
        <div
          className="absolute inset-0 z-0 opacity-25"
          style={{
            backgroundImage: `url(${artworkUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) brightness(0.3)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Title bar */}
      <div
        className="absolute top-12 left-12 right-12 z-10 flex justify-between items-center gap-6 transition-opacity duration-400"
        style={{ opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? "auto" : "none" }}
      >
        <div className="min-w-0 flex-1">
          <span className="text-[0.85rem] text-cyan-400 font-bold uppercase tracking-widest">
            Karaoke Mode
          </span>
          <h2 className="m-0 text-[clamp(1.5rem,3.5vw,2.5rem)] font-extrabold whitespace-nowrap overflow-hidden text-ellipsis"
            title={title}>
            {title}
          </h2>
          <p className="mt-1 text-[clamp(1rem,2vw,1.25rem)] text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis"
            title={artist}>
            {artist}
          </p>
        </div>
        <button
          onClick={onExit}
          className="shrink-0 px-6 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors flex items-center gap-2"
        >
          <Minimize2 size={18} />
          Exit (Esc / F)
        </button>
      </div>

      {/* Central lyrics */}
      <div className="flex flex-col gap-6 text-center mx-auto w-full max-w-[1000px] flex-1 min-h-0 justify-center overflow-hidden box-border relative z-10">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-4 p-6 text-gray-500">
            <span className="text-[clamp(1.2rem,3vw,1.8rem)]">No synced lyrics available</span>
          </div>
        ) : (
          <>
            <p
              className="m-0 transition-all duration-300 opacity-40"
              style={{ fontSize: getSecondaryFontSize(prevText, false), color: "var(--tw-daw-text-dim, #6b7280)" }}
            >
              {prevText}
            </p>

            <p
              className="font-black text-white my-3 leading-[1.25]"
              style={{
                fontSize: getActiveFontSize(activeText),
                background: "linear-gradient(to right, #00f2fe 0%, #4facfe 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textShadow: "0 0 30px rgba(6, 182, 212, 0.4)",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {activeText}
            </p>

            <p
              className="m-0 transition-all duration-300 opacity-75"
              style={{ fontSize: getSecondaryFontSize(nextText, true), color: "var(--tw-daw-text-muted, #9ca3af)" }}
            >
              {nextText}
            </p>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="absolute bottom-12 left-12 right-12 z-10 p-6 rounded-2xl bg-black/40 backdrop-blur-lg flex items-center gap-6 transition-opacity duration-400 box-border"
        style={{ opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? "auto" : "none" }}
      >
        <div className="flex gap-3 items-center">
          {onSkipBack && (
            <button onClick={onSkipBack} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <SkipBack size={18} />
            </button>
          )}
          <button
            onClick={onTogglePlay}
            className={cn(
              "px-5 py-3 rounded-xl transition-colors flex items-center gap-2",
              isPlaying ? "bg-white/10 text-white hover:bg-white/20" : "bg-cyan-500 text-black hover:bg-cyan-400"
            )}
          >
            {isPlaying ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Play</>}
          </button>
          {onSkipForward && (
            <button onClick={onSkipForward} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <SkipForward size={18} />
            </button>
          )}
          {onSkipNext && (
            <button onClick={onSkipNext} className="px-4 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
              <SkipForward size={18} /> Next
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-2 appearance-none bg-white/10 rounded-full accent-cyan-400 cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgb(6, 182, 212) ${seekPercent}%, rgba(255,255,255,0.1) ${seekPercent}%)`,
            }}
          />
          <div className="flex justify-between text-[11px] text-white/40 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Correct Lyrics */}
          {onCorrectLyrics && (
            <button
              onClick={onCorrectLyrics}
              title="Search for reference lyrics online"
              className="px-3 py-2 rounded-lg border border-white/15 text-white/60 hover:text-cyan-400 hover:border-cyan-400/40 transition-colors flex items-center gap-1.5 text-xs"
            >
              <Sparkles size={14} />
              Correct
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1.5 text-xs"
            >
              <Download size={14} />
              Export
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 bottom-full mb-2 bg-white/10 backdrop-blur-xl border border-white/15 rounded-lg p-1.5 space-y-0.5 min-w-[120px]"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                {onExportAss && (
                  <button
                    onClick={() => { onExportAss(); setShowExportMenu(false); }}
                    className="w-full text-left px-3 py-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <FileDown size={12} />
                    Export .ass (Karaoke)
                  </button>
                )}
                {onExportCdg && (
                  <button
                    onClick={() => { onExportCdg(); setShowExportMenu(false); }}
                    className="w-full text-left px-3 py-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <FileDown size={12} />
                    Export .cdg (Karaoke)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="text-[0.85rem] text-white/40 flex gap-3 select-none">
          <span>Space: Play/Pause</span>
          <span>Arrow keys: Seek</span>
          <span>F/Esc: Exit</span>
        </div>
      </div>
    </div>
  );
}
