"use client";

import { PromptBuilder } from "@/components/studio/PromptBuilder";
import { TrackCard } from "@/components/studio/TrackCard";
import { TrackCardSkeleton } from "@/components/ui/skeleton";
import { useTracks } from "@/lib/hooks";
import { Music } from "lucide-react";

export default function StudioPage() {
  const { data: tracks, loading, error, refetch } = useTracks();

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="sticky top-[88px]">
            <PromptBuilder onGenerate={refetch} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-daw-text">Recent Tracks</h2>
            {(tracks?.length ?? 0) > 0 && (
              <button className="text-xs text-daw-text-muted hover:text-daw-text transition-colors" onClick={refetch}>
                Refresh
              </button>
            )}
          </div>

          {error && (
            <div className="glass rounded-xl p-6 text-center">
              <p className="text-sm text-daw-red mb-2">Failed to load tracks</p>
              <p className="text-xs text-daw-text-dim">{error}</p>
              <button className="mt-3 daw-button daw-button-secondary text-xs" onClick={refetch}>
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <TrackCardSkeleton key={i} />
              ))}
            </div>
          ) : (tracks?.length ?? 0) > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tracks!.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-12 text-center">
              <Music className="w-10 h-10 text-daw-text-dim mx-auto mb-3" />
              <p className="text-sm text-daw-text-muted">No tracks yet</p>
              <p className="text-xs text-daw-text-dim mt-1">
                Describe the music you want and click Generate
              </p>
            </div>
          )}

          {tracks && tracks.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Tracks", value: String(tracks.length) },
                { label: "Completed", value: String(tracks.filter((t) => t.status === "completed").length) },
                { label: "Published", value: String(tracks.filter((t) => t.is_published).length) },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-xl p-4">
                  <p className="text-xs text-daw-text-dim">{stat.label}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-xl font-bold text-daw-text tabular-nums">{stat.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
