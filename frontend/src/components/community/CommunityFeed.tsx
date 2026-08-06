"use client";

import { motion } from "framer-motion";
import { Play, Heart, Repeat2, Share2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { useState } from "react";

interface CommunityPost {
  id: string;
  title: string;
  artist: string;
  artistAvatar: string;
  genre: string;
  likes: number;
  forks: number;
  duration: number;
  createdAt: string;
  prompt: string;
}

const posts: CommunityPost[] = [
  {
    id: "1",
    title: "Midnight Lo-Fi Study",
    artist: "SynthWizard",
    artistAvatar: "SW",
    genre: "Lo-Fi",
    likes: 234,
    forks: 45,
    duration: 187,
    createdAt: "2h ago",
    prompt: "A lo-fi hip hop beat for late night studying with soft piano and vinyl crackle",
  },
  {
    id: "2",
    title: "Cyberpunk 2077 Type Beat",
    artist: "NeonDreams",
    artistAvatar: "ND",
    genre: "Synthwave",
    likes: 567,
    forks: 123,
    duration: 210,
    createdAt: "5h ago",
    prompt: "Dark synthwave with heavy bass, arpeggiated leads, cyberpunk atmosphere",
  },
  {
    id: "3",
    title: "Summer House Groove",
    artist: "BeachVibes",
    artistAvatar: "BV",
    genre: "House",
    likes: 189,
    forks: 32,
    duration: 240,
    createdAt: "1d ago",
    prompt: "Uplifting summer house track with funky bassline, piano chords, and sax solo",
  },
  {
    id: "4",
    title: "Dark Trap Banger",
    artist: "ShadowBeats",
    artistAvatar: "SB",
    genre: "Trap",
    likes: 892,
    forks: 201,
    duration: 165,
    createdAt: "3d ago",
    prompt: "Aggressive trap beat with 808 slides, spooky melody, and heavy hi-hats",
  },
];

export function CommunityFeed() {
  const [playing, setPlaying] = useState<string | null>(null);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {posts.map((post, i) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-4 hover:border-daw-border-hover transition-all group"
          >
            <div className="flex gap-3">
              {/* Cover */}
              <button
                onClick={() => setPlaying(playing === post.id ? null : post.id)}
                className="w-14 h-14 rounded-xl bg-gradient-to-br from-daw-surface-3 to-daw-surface-2 flex items-center justify-center shrink-0 group-hover:from-daw-accent/20 group-hover:to-daw-cyan/20 transition-all"
              >
                {playing === post.id ? (
                  <Pause className="w-5 h-5 text-daw-accent" />
                ) : (
                  <Play className="w-5 h-5 text-daw-text-muted ml-0.5" />
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-daw-text truncate">{post.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-4 h-4 rounded-full bg-daw-accent/30 flex items-center justify-center text-[7px] font-bold text-daw-accent">
                        {post.artistAvatar}
                      </div>
                      <span className="text-xs text-daw-text-muted">{post.artist}</span>
                      <Badge>{post.genre}</Badge>
                    </div>
                  </div>
                  <span className="text-[10px] text-daw-text-dim shrink-0">{post.createdAt}</span>
                </div>

                {/* Prompt */}
                <p className="text-xs text-daw-text-dim mt-2 line-clamp-2 italic">
                  &ldquo;{post.prompt}&rdquo;
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3">
                  <button className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-text transition-colors">
                    <Heart className="w-3.5 h-3.5" />
                    {post.likes}
                  </button>
                  <button className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-text transition-colors">
                    <Repeat2 className="w-3.5 h-3.5" />
                    {post.forks}
                  </button>
                  <button className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-text transition-colors ml-auto">
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center pt-2">
        <button className="text-xs text-daw-text-muted hover:text-daw-text transition-colors py-2 px-4 rounded-lg hover:bg-daw-surface-3">
          Load more...
        </button>
      </div>
    </div>
  );
}
