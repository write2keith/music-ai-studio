"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "./api";
import type { Track, CommunityPost } from "./types";

interface UseDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useData<T>(fetcher: () => Promise<T>): UseDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const refetch = useCallback(() => setKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load data");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { data, loading, error, refetch };
}

export function useTracks() {
  return useData<Track[]>(() => api.getTracks());
}

export function useCommunity() {
  return useData<CommunityPost[]>(() => api.getCommunity());
}

export function useLibrary(status?: string) {
  return useData<Track[]>(() => api.getLibrary(status));
}

interface UseMutationReturn<T> {
  execute: (...args: any[]) => Promise<T>;
  loading: boolean;
  error: string | null;
}

export function useMutation<T>(
  fn: (...args: any[]) => Promise<T>,
  onSuccess?: (result: T) => void
): UseMutationReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(...args);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Operation failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fn, onSuccess]
  );

  return { execute, loading, error };
}

export function usePublish(onSuccess?: () => void) {
  return useMutation(
    (id: string) => api.publishTrack(id),
    onSuccess ? () => onSuccess() : undefined
  );
}

export function useUnpublish(onSuccess?: () => void) {
  return useMutation(
    (id: string) => api.unpublishTrack(id),
    onSuccess ? () => onSuccess() : undefined
  );
}

export function useFork(onSuccess?: () => void) {
  return useMutation(
    (id: string) => api.forkTrack(id),
    onSuccess ? () => onSuccess() : undefined
  );
}
