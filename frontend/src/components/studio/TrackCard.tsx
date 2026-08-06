"use client";

import { motion } from "framer-motion";
import { Play, Pause, Heart, Download, MoreHorizontal, Scissors, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconButton } from "@/components/ui/button";
import { useState } from "react";
import { useAudioPlayer } from "@/lib/audio-player";
import { useFork } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import type { Track } from "@/lib/types";

interface TrackCardProps {
  track: Track;
  variant?: "grid" | "list";
}

export function TrackCard({ track, variant = "grid" }: TrackCardProps) {
  const audioPlayer = useAudioPlayer();
  const [liked, setLiked] = useState(false);
  const isPlaying = audioPlayer.isCurrentUrl(track.url) && audioPlayer.isPlaying;
  const { execute: forkTrack, loading: forking } = useFork();
  const { add: addToast } = useToast();

  const handlePlay = () => {
    audioPlayer.toggle(track.url);
  };

  const handleFork = async () => {
    try {
      await forkTrack(track.id);
      addToast("Track forked!", "Added to your library", "success");
    } catch {}
  };

  if (variant === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl glass-hover transition-all cursor-pointer group"
      >
        {/* Play button / cover art */}
        <button
          onClick={handlePlay}
          className="w-10 h-10 rounded-lg bg-gradient-to-br from-daw-accent/30 to-daw-cyan/30 flex items-center justify-center shrink-0 group-hover:from-daw-accent/50 group-hover:to-daw-cyan/50 transition-all"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" />
          )}
        </button>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-daw-text truncate">{track.title}</p>
          <p className="text-xs text-daw-text-muted">{track.artist} · {track.key} · {track.bpm} BPM</p>
        </div>

        {/* Tags */}
        <div className="hidden md:flex items-center gap-1.5">
          <Badge>{track.genre}</Badge>
          <Badge variant="cyan">{track.mood}</Badge>
          {track.has_stems && (
            <Badge variant="vocal">Stems</Badge>
          )}
        </div>

        {/* Duration */}
        <span className="text-xs text-daw-text-dim tabular-nums w-10 text-right">
          {formatDuration(track.duration)}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton onClick={() => setLiked(!liked)}>
            <Heart className={cn("w-3.5 h-3.5", liked && "fill-daw-red text-daw-red")} />
          </IconButton>
          <IconButton>
            <Download className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl overflow-hidden group cursor-pointer"
    >
      {/* Cover */}
      <div className="relative aspect-square bg-gradient-to-br from-daw-surface-2 to-daw-surface-3 flex items-center justify-center">
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity flex items-center justify-center">
          <button
            onClick={handlePlay}
            className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-6 h-6 text-white ml-0.5" />
            )}
          </button>
        </div>
        <MusicNoteVisual />
        <div className="absolute top-2.5 right-2.5">
          <StatusBadge status={track.status} />
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5 space-y-2.5">
        <div>
          <p className="text-sm font-medium text-daw-text truncate">{track.title}</p>
          <p className="text-xs text-daw-text-muted">{track.artist}</p>
        </div>

        <Progress value={isPlaying ? 45 : 0} color="accent" />

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge>{track.genre}</Badge>
          <Badge variant="cyan">{track.bpm} BPM</Badge>
          {track.has_stems && <Badge variant="vocal">Stems</Badge>}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-daw-text-dim tabular-nums">
            {formatDuration(track.duration)}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-daw-text-dim flex items-center gap-0.5">
              <Heart className={cn("w-2.5 h-2.5", liked && "fill-daw-red text-daw-red")} />
              {track.likes}
            </span>
            <span className="text-[10px] text-daw-text-dim flex items-center gap-0.5">
              <Play className="w-2.5 h-2.5" />
              {track.play_count}
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-1 pt-1 border-t border-daw-border opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] text-daw-text-muted hover:bg-daw-surface-3 hover:text-daw-text transition-colors">
            <Download className="w-3 h-3" /> MP3
          </button>
          <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] text-daw-text-muted hover:bg-daw-surface-3 hover:text-daw-text transition-colors">
            <Scissors className="w-3 h-3" /> Stems
          </button>
          <button
            onClick={handleFork}
            disabled={forking}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] text-daw-text-muted hover:bg-daw-surface-3 hover:text-daw-text transition-colors disabled:opacity-50"
          >
            {forking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />} Fork
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: Track["status"] }) {
  const colors = {
    completed: "bg-daw-green/20 text-daw-green border-daw-green/30",
    processing: "bg-daw-orange/20 text-daw-orange border-daw-orange/30",
    draft: "bg-daw-text-dim/20 text-daw-text-dim border-daw-text-dim/30",
  };
  return (
    <span className={cn("text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-md border", colors[status])}>
      {status}
    </span>
  );
}

function MusicNoteVisual() {
  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-10">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="1.5" className="text-daw-accent" />
        <circle cx="40" cy="40" r="30" stroke="currentColor" strokeWidth="1" className="text-daw-cyan" strokeDasharray="4 4" />
        <path d="M52 24L52 48M52 48C52 45.7909 50.2091 44 48 44C45.7909 44 44 45.7909 44 48C44 50.2091 45.7909 52 48 52C50.2091 52 52 50.2091 52 48Z" stroke="currentColor" strokeWidth="1.5" className="text-daw-accent" />
      </svg>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
