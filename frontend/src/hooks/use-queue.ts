"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface QueueSong {
  id: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
}

export function useQueue() {
  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [timerDuration, setTimerDuration] = useState(() => {
    if (typeof window === "undefined") return 10;
    return Number(localStorage.getItem("karaoke_queue_countdown") || 10);
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCountdown = useCallback(() => {
    setIsTransitioning(true);
    setCountdown(timerDuration);
  }, [timerDuration]);

  const playNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(false);
    if (currentIndex !== null && currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => prev! + 1);
    }
  }, [currentIndex, queue.length]);

  const playPast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(false);
  }, []);

  const playNextOfNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(false);
    if (currentIndex !== null && currentIndex < queue.length - 2) {
      setCurrentIndex((prev) => prev! + 2);
    }
  }, [currentIndex, queue.length]);

  const cancelCountdown = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(false);
    setCurrentIndex(null);
    setQueue([]);
  }, []);

  const addToQueue = useCallback((song: QueueSong) => {
    setQueue((prev) => {
      const updated = [...prev, song];
      if (prev.length === 0) {
        setCurrentIndex(0);
      }
      return updated;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    if (currentIndex === index) {
      setCurrentIndex(null);
    } else if (currentIndex !== null && currentIndex > index) {
      setCurrentIndex((prev) => (prev !== null ? prev - 1 : null));
    }
  }, [currentIndex]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(null);
  }, []);

  const setQueueList = useCallback((songs: QueueSong[], startIndex = 0) => {
    setQueue(songs);
    setCurrentIndex(startIndex);
  }, []);

  const updateTimerDuration = useCallback((seconds: number) => {
    setTimerDuration(seconds);
    localStorage.setItem("karaoke_queue_countdown", String(seconds));
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (!isTransitioning) return;
    const delay = countdown > 0 ? 1000 : 0;
    timerRef.current = setTimeout(() => {
      if (countdown > 0) {
        setCountdown((prev) => prev - 1);
      } else {
        playNext();
      }
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isTransitioning, countdown, playNext]);

  return {
    queue,
    currentIndex,
    currentSong: currentIndex !== null && currentIndex < queue.length ? queue[currentIndex] : null,
    isTransitioning,
    countdown,
    timerDuration,
    updateTimerDuration,
    addToQueue,
    removeFromQueue,
    clearQueue,
    setQueueList,
    playNext,
    cancelCountdown,
    startCountdown,
    playPast,
    playNextOfNext,
  };
}
