"use client";

import dynamic from "next/dynamic";
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <WaveformEditor />
    </div>
  );
}
