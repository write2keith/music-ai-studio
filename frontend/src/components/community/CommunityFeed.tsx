"use client";

import { motion } from "framer-motion";
import { Play, Heart, Repeat2, Share2, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCommunity, useFork } from "@/lib/hooks";
import { useAudioPlayer } from "@/lib/audio-player";
import { useToast } from "@/components/ui/toast";
import type { CommunityPost } from "@/lib/types";
import { useState } from "react";

export function CommunityFeed() {
  const { data: posts, loading, error, refetch } = useCommunity();
  const audioPlayer = useAudioPlayer();

  if (error) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-sm text-daw-red mb-2">Failed to load community feed</p>
        <p className="text-xs text-daw-text-dim">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-daw-text">Discover</h2>
        <div className="flex gap-2">
          {["Trending", "New", "Top", "For You"].map((tab) => (
            <button
              key={tab}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "Trending"
                  ? "bg-daw-accent/20 text-daw-accent"
                  : "text-daw-text-muted hover:text-daw-text hover:bg-daw-surface-3"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-14 h-14 rounded-xl bg-daw-surface-3 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-daw-surface-3 rounded w-3/4" />
                  <div className="h-3 bg-daw-surface-3 rounded w-1/2" />
                  <div className="h-3 bg-daw-surface-3 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts?.map((post, i) => (
            <CommunityCard key={post.id} post={post} index={i} onForkSuccess={refetch} />
          ))}
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button className="text-xs text-daw-text-muted hover:text-daw-text transition-colors py-2 px-4 rounded-lg hover:bg-daw-surface-3">
          Load more...
        </button>
      </div>
    </div>
  );
}

function CommunityCard({
  post,
  index,
  onForkSuccess,
}: {
  post: CommunityPost;
  index: number;
  onForkSuccess: () => void;
}) {
  const audioPlayer = useAudioPlayer();
  const isPlaying = audioPlayer.isCurrentUrl(post.url) && audioPlayer.isPlaying;
  const { execute: forkTrack, loading: forking } = useFork(() => onForkSuccess());
  const { add: addToast } = useToast();
  const [forkCount, setForkCount] = useState(post.forks);

  async function handleFork() {
    try {
      await forkTrack(post.id);
      setForkCount((c) => c + 1);
      addToast("Track forked!", "Added to your library", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("Fork failed", msg || "Please try again.", "error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass rounded-xl p-4 hover:border-daw-border-hover transition-all group"
    >
      <div className="flex gap-3">
        <button
          onClick={() => audioPlayer.toggle(post.url)}
          className="w-14 h-14 rounded-xl bg-gradient-to-br from-daw-surface-3 to-daw-surface-2 flex items-center justify-center shrink-0 group-hover:from-daw-accent/20 group-hover:to-daw-cyan/20 transition-all"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-daw-accent" />
          ) : (
            <Play className="w-5 h-5 text-daw-text-muted ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-daw-text truncate">{post.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-4 h-4 rounded-full bg-daw-accent/30 flex items-center justify-center text-[7px] font-bold text-daw-accent">
                  {post.artist_avatar}
                </div>
                <span className="text-xs text-daw-text-muted">{post.artist}</span>
                <Badge>{post.genre}</Badge>
              </div>
            </div>
          </div>

          <p className="text-xs text-daw-text-dim mt-2 line-clamp-2 italic">
            &ldquo;{post.prompt}&rdquo;
          </p>

          <div className="flex items-center gap-3 mt-3">
            <button className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-text transition-colors">
              <Heart className="w-3.5 h-3.5" />
              {post.likes}
            </button>
            <button
              onClick={handleFork}
              disabled={forking}
              className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-accent transition-colors disabled:opacity-50"
            >
              {forking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Repeat2 className="w-3.5 h-3.5" />
              )}
              {forkCount}
            </button>
            <button className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-text transition-colors ml-auto">
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
