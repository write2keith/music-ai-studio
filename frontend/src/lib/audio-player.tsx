"use client";

import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";

interface AudioPlayerState {
  currentUrl: string | null;
  isPlaying: boolean;
  play: (url: string) => void;
  pause: () => void;
  toggle: (url: string) => void;
  isCurrentUrl: (url: string) => boolean;
}

const AudioPlayerContext = createContext<AudioPlayerState>({
  currentUrl: null,
  isPlaying: false,
  play: () => {},
  pause: () => {},
  toggle: () => {},
  isCurrentUrl: () => false,
});

export function useAudioPlayer() {
  return useContext(AudioPlayerContext);
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentUrl(null);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onError = () => {
      setIsPlaying(false);
      setCurrentUrl(null);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const play = useCallback((url: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentUrl === url) {
      audio.currentTime = 0;
      audio.play();
      return;
    }

    audio.src = url;
    audio.play();
    setCurrentUrl(url);
  }, [currentUrl]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback((url: string) => {
    if (currentUrl === url && isPlaying) {
      pause();
    } else {
      play(url);
    }
  }, [currentUrl, isPlaying, play, pause]);

  const isCurrentUrl = useCallback((url: string) => currentUrl === url, [currentUrl]);

  return (
    <AudioPlayerContext.Provider
      value={{ currentUrl, isPlaying, play, pause, toggle, isCurrentUrl }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}
