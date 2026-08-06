"use client";

import dynamic from "next/dynamic";
import { Scissors, Wand2 } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const WaveformEditor = dynamic(
  () => import("@/components/WaveformEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner text="Loading editor..." />
      </div>
    ),
  }
);

export default function EditorPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-daw-accent/20 to-daw-cyan/20 flex items-center justify-center">
          <Wand2 className="w-5 h-5 text-daw-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-daw-text">Audio Editor</h1>
          <p className="text-xs text-daw-text-muted mt-0.5">
            Trim, fade, normalize, apply effects, and merge stems
          </p>
        </div>
      </div>

      <WaveformEditor />
    </div>
  );
}
