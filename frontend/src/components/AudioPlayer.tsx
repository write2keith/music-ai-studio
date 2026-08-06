"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download, Volume2 } from "lucide-react";

interface AudioPlayerProps {
  url: string;
  label?: string;
  compact?: boolean;
}

export function AudioPlayer({ url, label, compact = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-daw-surface-3/50 rounded-lg p-2">
        <audio ref={audioRef} src={url} />
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-daw-accent hover:bg-daw-accent-glow transition-colors"
        >
          {playing ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-xs font-medium text-daw-text truncate">
              {label}
            </p>
          )}
          <p className="text-xs text-daw-text-muted">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </p>
        </div>
        <a
          href={url}
          download
          className="p-1.5 text-daw-text-muted hover:text-daw-text transition-colors"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="bg-daw-surface/30 border border-daw-border rounded-xl p-4">
      <audio ref={audioRef} src={url} className="hidden" />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-daw-accent hover:bg-daw-accent-glow transition-colors shrink-0"
        >
          {playing ? (
            <Pause className="w-5 h-5 text-white" />
          ) : (
            <Play className="w-5 h-5 text-white ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-sm font-medium text-daw-text truncate">
              {label}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-daw-text-muted">
            <Volume2 className="w-3 h-3" />
            <span>
              {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </span>
          </div>
        </div>
        <a
          href={url}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 bg-daw-border hover:bg-daw-border-hover text-daw-text rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
    </div>
  );
}
