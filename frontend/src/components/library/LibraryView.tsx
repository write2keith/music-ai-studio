"use client";

import { motion } from "framer-motion";
import { Play, Download, Trash2, Edit3, Scissors, MoreHorizontal, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconButton } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { useState } from "react";

interface LibraryTrack {
  id: string;
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  duration: number;
  status: "completed" | "processing" | "draft";
  hasStems: boolean;
  isPublished: boolean;
  createdAt: string;
  exports: string[];
}

const tracks: LibraryTrack[] = [
  {
    id: "1", title: "Late Night Lo-Fi", genre: "Lo-Fi", mood: "Chill",
    bpm: 85, key: "Am", duration: 187, status: "completed", hasStems: true,
    isPublished: true, createdAt: "2026-08-04", exports: ["mp3", "wav", "stems"],
  },
  {
    id: "2", title: "Trap Anthem WIP", genre: "Trap", mood: "Dark",
    bpm: 140, key: "Dm", duration: 92, status: "draft", hasStems: false,
    isPublished: false, createdAt: "2026-08-05", exports: ["mp3"],
  },
  {
    id: "3", title: "Summer Vibes", genre: "House", mood: "Energetic",
    bpm: 126, key: "F", duration: 230, status: "completed", hasStems: true,
    isPublished: true, createdAt: "2026-08-03", exports: ["mp3", "wav", "stems"],
  },
  {
    id: "4", title: "Ambient Texture", genre: "Ambient", mood: "Dreamy",
    bpm: 70, key: "Cm", duration: 0, status: "processing", hasStems: false,
    isPublished: false, createdAt: "2026-08-06", exports: [],
  },
];

export function LibraryView() {
  const [tab, setTab] = useState("all");
  const tabs = [
    { id: "all", label: "All", count: tracks.length },
    { id: "completed", label: "Completed", count: tracks.filter(t => t.status === "completed").length },
    { id: "drafts", label: "Drafts", count: tracks.filter(t => t.status === "draft").length },
    { id: "published", label: "Published", count: tracks.filter(t => t.isPublished).length },
  ];

  const filtered = tab === "all"
    ? tracks
    : tab === "published"
    ? tracks.filter(t => t.isPublished)
    : tracks.filter(t => t.status === tab);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-daw-text">My Library</h2>
          <p className="text-xs text-daw-text-muted mt-0.5">
            {tracks.length} tracks · {tracks.filter(t => t.status === "completed").length} completed
          </p>
        </div>
        <Button size="sm">
          <Music className="w-3.5 h-3.5" />
          New Track
        </Button>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {filtered.length === 0 ? (
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
          {filtered.map((track, i) => (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl glass-hover transition-all group"
            >
              {/* Play */}
              <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-daw-accent/20 to-daw-cyan/20 flex items-center justify-center shrink-0 group-hover:from-daw-accent/40 group-hover:to-daw-cyan/40 transition-all">
                <Play className="w-4 h-4 text-daw-text-muted ml-0.5" />
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-daw-text truncate">{track.title}</p>
                  {track.status === "processing" && (
                    <span className="text-[9px] text-daw-orange animate-pulse">Generating...</span>
                  )}
                </div>
                <p className="text-xs text-daw-text-muted">
                  {track.key} · {track.bpm} BPM · {formatDuration(track.duration)} · {track.createdAt}
                </p>
              </div>

              {/* Tags */}
              <div className="hidden md:flex items-center gap-1.5">
                <Badge>{track.genre}</Badge>
                <Badge variant="cyan">{track.mood}</Badge>
                {track.hasStems && <Badge variant="vocal">Stems</Badge>}
                {track.isPublished && <Badge variant="green">Published</Badge>}
              </div>

              {/* Exports */}
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

              {/* Progress for processing */}
              {track.status === "processing" && (
                <div className="w-20 hidden md:block">
                  <Progress value={67} color="orange" />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <IconButton><Edit3 className="w-3.5 h-3.5" /></IconButton>
                <IconButton><Download className="w-3.5 h-3.5" /></IconButton>
                <IconButton><Scissors className="w-3.5 h-3.5" /></IconButton>
                <IconButton><MoreHorizontal className="w-3.5 h-3.5" /></IconButton>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
