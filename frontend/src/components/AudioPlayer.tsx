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
      <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2">
        <audio ref={audioRef} src={url} />
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-violet-500 hover:bg-violet-600 transition-colors"
        >
          {playing ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-xs font-medium text-zinc-300 truncate">
              {label}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </p>
        </div>
        <a
          href={url}
          download
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/30 border border-zinc-800 rounded-xl p-4">
      <audio ref={audioRef} src={url} className="hidden" />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-violet-500 hover:bg-violet-600 transition-colors shrink-0"
        >
          {playing ? (
            <Pause className="w-5 h-5 text-white" />
          ) : (
            <Play className="w-5 h-5 text-white ml-0.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          {label && (
            <p className="text-sm font-medium text-zinc-200 truncate">
              {label}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Volume2 className="w-3 h-3" />
            <span>
              {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </span>
          </div>
        </div>
        <a
          href={url}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      </div>
    </div>
  );
}
