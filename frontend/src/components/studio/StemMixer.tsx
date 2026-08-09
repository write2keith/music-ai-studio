"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Mic, Music, Disc, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StemMixerHandle {
  getMixGains: () => { vocals: number; backing: number; instrumental: number };
  getOutputNode: () => GainNode | null;
}

interface StemMixerProps {
  audioCtx: AudioContext | null;
  stemBuffers: { vocals?: AudioBuffer; backing?: AudioBuffer; instrumental?: AudioBuffer } | null;
  isPlaying: boolean;
  onPlaybackEnd: () => void;
  className?: string;
}

export const StemMixer = forwardRef<StemMixerHandle, StemMixerProps>(
  function StemMixer({ audioCtx, stemBuffers, isPlaying, onPlaybackEnd, className }, ref) {
    const [vocalsGain, setVocalsGain] = useState(0.8);
    const [backingGain, setBackingGain] = useState(0.8);
    const [instGain, setInstGain] = useState(0.8);
    const [vocalsMuted, setVocalsMuted] = useState(false);
    const [backingMuted, setBackingMuted] = useState(false);
    const [instMuted, setInstMuted] = useState(false);

    const vocalsNodeRef = useRef<GainNode | null>(null);
    const backingNodeRef = useRef<GainNode | null>(null);
    const instNodeRef = useRef<GainNode | null>(null);
    const masterRef = useRef<GainNode | null>(null);
    const sourcesRef = useRef<AudioBufferSourceNode[]>([]);

    const stopAll = useCallback(() => {
      sourcesRef.current.forEach((s) => {
        try { s.stop(); } catch {}
      });
      sourcesRef.current = [];
    }, []);

    useEffect(() => {
      if (!audioCtx || !stemBuffers || !isPlaying) {
        if (!isPlaying) stopAll();
        return;
      }

      stopAll();

      masterRef.current = audioCtx.createGain();
      masterRef.current.gain.value = 1;
      masterRef.current.connect(audioCtx.destination);

      const createSource = (buffer: AudioBuffer, gainVal: number, muted: boolean) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = muted ? 0 : gainVal;
        source.connect(gainNode);
        gainNode.connect(masterRef.current!);
        sourcesRef.current.push(source);
        return { source, gainNode };
      };

      if (stemBuffers.vocals) {
        const { source, gainNode } = createSource(stemBuffers.vocals, vocalsGain, vocalsMuted);
        vocalsNodeRef.current = gainNode;
        source.start(0);
      }
      if (stemBuffers.backing) {
        const { source, gainNode } = createSource(stemBuffers.backing, backingGain, backingMuted);
        backingNodeRef.current = gainNode;
        source.start(0);
      }
      if (stemBuffers.instrumental) {
        const { source, gainNode } = createSource(stemBuffers.instrumental, instGain, instMuted);
        instNodeRef.current = gainNode;
        source.start(0);
      }

      const lastEnd = () => {
        onPlaybackEnd();
      };

      const lastSrc = sourcesRef.current[sourcesRef.current.length - 1];
      if (lastSrc) {
        lastSrc.onended = lastEnd;
      }

      return () => {
        stopAll();
        try { masterRef.current?.disconnect(); } catch {}
      };
    }, [audioCtx, stemBuffers, isPlaying]);

    useEffect(() => {
      if (vocalsNodeRef.current) {
        vocalsNodeRef.current.gain.setTargetAtTime(
          vocalsMuted ? 0 : vocalsGain, audioCtx?.currentTime ?? 0, 0.02
        );
      }
    }, [vocalsGain, vocalsMuted, audioCtx]);

    useEffect(() => {
      if (backingNodeRef.current) {
        backingNodeRef.current.gain.setTargetAtTime(
          backingMuted ? 0 : backingGain, audioCtx?.currentTime ?? 0, 0.02
        );
      }
    }, [backingGain, backingMuted, audioCtx]);

    useEffect(() => {
      if (instNodeRef.current) {
        instNodeRef.current.gain.setTargetAtTime(
          instMuted ? 0 : instGain, audioCtx?.currentTime ?? 0, 0.02
        );
      }
    }, [instGain, instMuted, audioCtx]);

    useImperativeHandle(ref, () => ({
      getMixGains: () => ({
        vocals: vocalsMuted ? 0 : vocalsGain,
        backing: backingMuted ? 0 : backingGain,
        instrumental: instMuted ? 0 : instGain,
      }),
      getOutputNode: () => masterRef.current,
    }));

    const GainSlider = ({
      label,
      icon: Icon,
      value,
      muted,
      color,
      onChange,
      onToggleMute,
    }: {
      label: string;
      icon: typeof Mic;
      value: number;
      muted: boolean;
      color: string;
      onChange: (v: number) => void;
      onToggleMute: () => void;
    }) => (
      <div className="flex items-center gap-2 py-1.5">
        <button
          onClick={onToggleMute}
          className={cn(
            "p-1 rounded transition-colors",
            muted ? "text-daw-text-dim bg-daw-surface-2" : `${color} bg-current/10`
          )}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <Icon className={cn("w-3.5 h-3.5 shrink-0", muted ? "text-daw-text-dim" : color)} />
        <span className={cn("text-[10px] w-14 shrink-0", muted ? "text-daw-text-dim" : "text-daw-text")}>
          {label}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "flex-1 h-1 rounded-full appearance-none cursor-pointer",
            color === "text-rose-400" && "accent-rose-400",
            color === "text-amber-400" && "accent-amber-400",
            color === "text-cyan-400" && "accent-cyan-400",
          )}
        />
        <span className="text-[10px] text-daw-text-dim w-8 text-right font-mono">
          {Math.round(value * 100)}%
        </span>
      </div>
    );

    return (
      <div className={cn("space-y-0.5", className)}>
        <p className="text-[10px] uppercase tracking-wider text-daw-text-dim mb-1">Stem Mixer</p>
        {stemBuffers?.vocals && (
          <GainSlider
            label="Vocals"
            icon={Mic}
            value={vocalsGain}
            muted={vocalsMuted}
            color="text-rose-400"
            onChange={setVocalsGain}
            onToggleMute={() => setVocalsMuted(!vocalsMuted)}
          />
        )}
        {stemBuffers?.backing && (
          <GainSlider
            label="Backing"
            icon={Music}
            value={backingGain}
            muted={backingMuted}
            color="text-amber-400"
            onChange={setBackingGain}
            onToggleMute={() => setBackingMuted(!backingMuted)}
          />
        )}
        {stemBuffers?.instrumental && (
          <GainSlider
            label="Instrumental"
            icon={Disc}
            value={instGain}
            muted={instMuted}
            color="text-cyan-400"
            onChange={setInstGain}
            onToggleMute={() => setInstMuted(!instMuted)}
          />
        )}
      </div>
    );
  }
);
