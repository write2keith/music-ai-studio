"use client";

import { ArrowLeft, ArrowRight, Music } from "lucide-react";
import type { QueueSong } from "@/hooks/use-queue";

interface QueueCountdownOverlayProps {
  queue: QueueSong[];
  currentIndex: number | null;
  isTransitioning: boolean;
  countdown: number;
  onPlayNext: () => void;
  onCancel: () => void;
  onPlayPast: () => void;
  onPlayNextOfNext: () => void;
}

export default function QueueCountdownOverlay({
  queue,
  currentIndex,
  isTransitioning,
  countdown,
  onPlayNext,
  onCancel,
  onPlayPast,
  onPlayNextOfNext,
}: QueueCountdownOverlayProps) {
  if (!isTransitioning || queue.length === 0 || currentIndex === null || currentIndex >= queue.length - 1) {
    return null;
  }

  const nextSong = queue[currentIndex + 1];
  const pastSong = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const nextOfNextSong = currentIndex + 2 < queue.length ? queue[currentIndex + 2] : null;

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col items-center justify-center gap-8 p-6 overflow-hidden"
      style={{ background: "rgba(3, 7, 18, 0.9)", backdropFilter: "blur(20px)" }}>
      {nextSong.thumbnailUrl && (
        <div
          className="absolute inset-0 opacity-70 z-[-1]"
          style={{
            backgroundImage: `url(${nextSong.thumbnailUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(40px) brightness(0.25)",
            transform: "scale(1.1)",
          }}
        />
      )}

      <div className="text-center flex flex-col gap-2 z-10">
        <span className="text-base text-violet-400 font-extrabold uppercase tracking-[0.15em]">Up Next</span>
        <h2 className="m-0 text-5xl font-black text-white">{nextSong.title}</h2>
        <p className="m-0 text-2xl text-gray-400">{nextSong.artist}</p>
      </div>

      <div className="flex items-center gap-12 my-6 w-full max-w-[900px] justify-center z-10">
        {pastSong ? (
          <button
            onClick={onPlayPast}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer transition-all hover:bg-white/10 hover:scale-[1.03] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] text-left w-[280px] text-white"
          >
            <ArrowLeft size={20} className="text-violet-400 shrink-0" />
            {pastSong.thumbnailUrl ? (
              <img src={pastSong.thumbnailUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Music size={20} className="text-gray-500" />
              </div>
            )}
            <div className="flex flex-col overflow-hidden flex-1">
              <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Past Song</span>
              <span className="text-[15px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">{pastSong.title}</span>
              <span className="text-[13px] text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">{pastSong.artist}</span>
            </div>
          </button>
        ) : (
          <div className="w-[280px]" />
        )}

        <div className="w-[180px] h-[180px] rounded-full border-4 border-violet-500 shrink-0 flex flex-col items-center justify-center gap-1"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(0,0,0,0.4) 100%)",
            boxShadow: "0 0 40px rgba(139,92,246,0.3)",
          }}>
          <span className="text-[4.5rem] font-black leading-none text-white">{countdown}</span>
          <span className="text-[13px] text-gray-500 uppercase font-bold tracking-wider">Seconds</span>
        </div>

        {nextOfNextSong ? (
          <button
            onClick={onPlayNextOfNext}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 cursor-pointer transition-all hover:bg-white/10 hover:scale-[1.03] hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] text-left w-[280px] text-white"
          >
            <div className="flex flex-col overflow-hidden flex-1">
              <span className="text-[11px] text-violet-400 font-bold uppercase tracking-wider">After Next</span>
              <span className="text-[15px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">{nextOfNextSong.title}</span>
              <span className="text-[13px] text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">{nextOfNextSong.artist}</span>
            </div>
            {nextOfNextSong.thumbnailUrl ? (
              <img src={nextOfNextSong.thumbnailUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Music size={20} className="text-gray-500" />
              </div>
            )}
            <ArrowRight size={20} className="text-violet-400 shrink-0" />
          </button>
        ) : (
          <div className="w-[280px]" />
        )}
      </div>

      <div className="flex gap-4 z-10">
        <button
          onClick={onPlayNext}
          className="px-7 py-3.5 rounded-xl bg-violet-500 text-white font-semibold hover:bg-violet-400 transition-colors"
        >
          Skip Countdown
        </button>
        <button
          onClick={onCancel}
          className="px-7 py-3.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          Cancel Queue
        </button>
      </div>
    </div>
  );
}
