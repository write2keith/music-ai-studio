"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlphaTabApi } from "@coderline/alphatab";

export interface AlphaTabViewerProps {
  fileUrl?: string;
  fileBuffer?: ArrayBuffer | null;
  className?: string;
  onReady?: () => void;
}

export default function AlphaTabViewer({
  fileUrl,
  fileBuffer,
  className,
  onReady,
}: AlphaTabViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundFontProgress, setSoundFontProgress] = useState(0);

  const initApi = useCallback(() => {
    if (!containerRef.current) return;
    if (apiRef.current) return;

    const api = new AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: "/alphatab/font/",
        useWorkers: true,
      },
      display: {
        scale: 0.9,
        staveProfile: "score-tab",
        barsPerRow: -1,
      },
      player: {
        enablePlayer: true,
        enableCursor: true,
        enableUserInteraction: true,
        soundFont: "/alphatab/soundfont/sonivox.sf2",
        scrollElement: containerRef.current.parentElement ?? undefined,
      },
    } as any);

    apiRef.current = api;

    api.soundFontLoad.on((e) => {
      const pct = e.total > 0 ? Math.round(((e.loaded as number) / (e.total as number)) * 100) : 0;
      setSoundFontProgress(pct);
    });

    api.playerReady.on(() => {
      setIsReady(true);
    });

    api.renderFinished.on(() => {
      onReady?.();
    });

    api.playerStateChanged.on((e) => {
      setIsPlaying(e.state === 1);
    });

    return api;
  }, [onReady]);

  useEffect(() => {
    return () => {
      if (apiRef.current) {
        apiRef.current.destroy();
        apiRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const api = initApi();
    if (!api) return;

    if (fileUrl) {
      api.load(fileUrl);
    } else if (fileBuffer) {
      api.load(fileBuffer);
    }
  }, [initApi, fileUrl, fileBuffer]);

  const handlePlayPause = useCallback(() => {
    apiRef.current?.playPause();
  }, []);

  const handleStop = useCallback(() => {
    apiRef.current?.stop();
  }, []);

  return (
    <div className={cn("relative", className)}>
      {!isReady && soundFontProgress < 100 && (
        <div className="absolute inset-0 flex items-center justify-center bg-daw-surface/80 z-10 rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <span className="text-xs text-daw-text-dim">
              Loading SoundFont... {soundFontProgress}%
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={handlePlayPause}
          disabled={!isReady}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            isPlaying
              ? "text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20"
              : "text-daw-text hover:text-cyan-400 hover:bg-cyan-400/10",
            !isReady && "opacity-40 cursor-not-allowed"
          )}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button
          onClick={handleStop}
          disabled={!isReady}
          className={cn(
            "p-1.5 rounded text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 transition-colors",
            !isReady && "opacity-40 cursor-not-allowed"
          )}
          title="Stop"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="w-full min-h-[400px] rounded-xl overflow-hidden border border-daw-border bg-white"
      />
    </div>
  );
}
