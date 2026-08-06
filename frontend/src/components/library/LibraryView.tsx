"use client";

import { motion } from "framer-motion";
import { Play, Download, Edit3, Scissors, MoreHorizontal, Music, Globe, GlobeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconButton } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { TrackCardSkeleton } from "@/components/ui/skeleton";
import { useLibrary, usePublish, useUnpublish } from "@/lib/hooks";
import type { Track } from "@/lib/types";
import { useState } from "react";

export function LibraryView() {
  const [tab, setTab] = useState("all");
  const { data: tracks, loading, error, refetch } = useLibrary(
    tab === "all" ? undefined : tab
  );
  const { execute: publishTrack } = usePublish(() => refetch());
  const { execute: unpublishTrack } = useUnpublish(() => refetch());

  const allTracks = tracks ?? [];
  const completed = allTracks.filter((t) => t.status === "completed").length;
  const drafts = allTracks.filter((t) => t.status === "processing").length;
  const published = allTracks.filter((t) => t.is_published).length;

  const tabs = [
    { id: "all", label: "All", count: allTracks.length },
    { id: "completed", label: "Completed", count: completed },
    { id: "processing", label: "Drafts", count: drafts },
    { id: "published", label: "Published", count: published },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-daw-text">My Library</h2>
          <p className="text-xs text-daw-text-muted mt-0.5">
            {allTracks.length} tracks · {completed} completed
          </p>
        </div>
        <Button size="sm">
          <Music className="w-3.5 h-3.5" />
          New Track
        </Button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {error && (
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-sm text-daw-red mb-2">Failed to load library</p>
          <p className="text-xs text-daw-text-dim">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <TrackCardSkeleton key={i} />
          ))}
        </div>
      ) : allTracks.length === 0 ? (
        <div className="text-center py-16">
          <Music className="w-12 h-12 text-daw-text-dim mx-auto mb-3" />
          <p className="text-sm text-daw-text-muted">No tracks yet</p>
          <p className="text-xs text-daw-text-dim mt-1">Create your first AI-generated track</p>
          <Button className="mt-4" size="sm">
            <Music className="w-3.5 h-3.5" />
            Create Track
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {allTracks.map((track, i) => (
            <LibraryRow
              key={track.id}
              track={track}
              index={i}
              onPublish={() => publishTrack(track.id)}
              onUnpublish={() => unpublishTrack(track.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryRow({
  track,
  index,
  onPublish,
  onUnpublish,
}: {
  track: Track;
  index: number;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl glass-hover transition-all group"
    >
      <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-daw-accent/20 to-daw-cyan/20 flex items-center justify-center shrink-0 group-hover:from-daw-accent/40 group-hover:to-daw-cyan/40 transition-all">
        <Play className="w-4 h-4 text-daw-text-muted ml-0.5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-daw-text truncate">{track.title}</p>
          {track.status === "processing" && (
            <span className="text-[9px] text-daw-orange animate-pulse">Generating...</span>
          )}
        </div>
        <p className="text-xs text-daw-text-muted">
          {track.key} · {track.bpm} BPM · {formatDuration(track.duration)} · {track.created_at.slice(0, 10)}
        </p>
      </div>

      <div className="hidden md:flex items-center gap-1.5">
        <Badge>{track.genre}</Badge>
        <Badge variant="cyan">{track.mood}</Badge>
        {track.has_stems && <Badge variant="vocal">Stems</Badge>}
        {track.is_published && <Badge variant="green">Published</Badge>}
      </div>

      <div className="hidden lg:flex items-center gap-1">
        {track.exports.map((fmt) => (
          <button
            key={fmt}
            className="text-[10px] font-medium text-daw-text-muted hover:text-daw-text bg-daw-surface-3 hover:bg-daw-border-hover px-2 py-0.5 rounded-md transition-colors uppercase"
          >
            {fmt}
          </button>
        ))}
      </div>

      {track.status === "processing" && (
        <div className="w-20 hidden md:block">
          <Progress value={67} color="orange" />
        </div>
      )}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {track.status === "completed" && (
          <IconButton
            title={track.is_published ? "Unpublish" : "Publish"}
            onClick={track.is_published ? onUnpublish : onPublish}
          >
            {track.is_published ? (
              <GlobeOff className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
          </IconButton>
        )}
        <IconButton><Edit3 className="w-3.5 h-3.5" /></IconButton>
        <IconButton><Download className="w-3.5 h-3.5" /></IconButton>
        <IconButton><Scissors className="w-3.5 h-3.5" /></IconButton>
        <IconButton><MoreHorizontal className="w-3.5 h-3.5" /></IconButton>
      </div>
    </motion.div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
