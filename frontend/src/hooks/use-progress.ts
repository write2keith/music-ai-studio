"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface ProgressEvent {
  session: string;
  action: string;
  stage: string;
  progress: number;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
}

export function useProgress(session: string) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!session) return;

    const ws = api.connectProgress(session);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "progress_update") {
          setProgress(msg.data as ProgressEvent);
        }
      } catch { /* ignore malformed messages */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session]);

  return progress;
}
