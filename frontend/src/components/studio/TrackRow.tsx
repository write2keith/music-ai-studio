"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Mic, Volume2, VolumeX, ChevronDown, ChevronUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineClip } from "./TimelineClip";
import { AutomationLane, type AutomationPoint } from "./AutomationLane";
import { interpolateEnvelope as curveInterpolate } from "@/lib/audio-utils";

export interface TrackData {
  id: string;
  name: string;
  color: string;
  audioUrl: string;
  audioBlob: Blob | null;
  isRecording: boolean;
  isArmed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  reverbSend: number;
  duration: number;
  startOffset: number;
  trimStart: number;
  trimEnd: number;
  volumeEnvelope: AutomationPoint[];
  panEnvelope: AutomationPoint[];
  showAutomation: boolean;
  automationType: "volume" | "pan";
}

interface TrackRowProps {
  track: TrackData;
  effectiveAudible: boolean;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
  onVolumeChange: (v: number) => void;
  onPanChange: (v: number) => void;
  onReverbSendChange: (v: number) => void;
  onNameChange: (name: string) => void;
  onFileLoad: (file: File) => void;
  onOffsetChange: (offset: number) => void;
  onTrimChange: (trimStart: number, trimEnd: number) => void;
  onVolumeEnvelopeChange: (pts: AutomationPoint[]) => void;
  onPanEnvelopeChange: (pts: AutomationPoint[]) => void;
  onAutomationToggle: () => void;
  onAutomationTypeChange: (type: "volume" | "pan") => void;
  isPlaying: boolean;
  playheadTime: number;
  seekVersion: number;
  bpm: number;
  maxDuration: number;
  ctx: AudioContext | null;
  masterBus: GainNode | null;
  reverbWetGain: GainNode | null;
  effectsReady: boolean;
}

const COLORS: Record<string, string> = {
  rose: "#f43f5e",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  violet: "#a855f7",
  orange: "#f97316",
  cyan: "#22d3ee",
};

export function interpolateEnvelope(points: AutomationPoint[], time: number, defaultValue: number): number {
  if (points.length === 0) return defaultValue;
  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const dt = sorted[i + 1].time - sorted[i].time;
      if (dt < 0.001) return sorted[i].value;
      const t = (time - sorted[i].time) / dt;
      return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * t;
    }
  }
  return defaultValue;
}

export function TrackRow({
  track,
  effectiveAudible,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onVolumeChange,
  onPanChange,
  onReverbSendChange,
  onNameChange,
  onFileLoad,
  onOffsetChange,
  onTrimChange,
  onVolumeEnvelopeChange,
  onPanEnvelopeChange,
  onAutomationToggle,
  onAutomationTypeChange,
  isPlaying,
  playheadTime,
  seekVersion,
  bpm,
  maxDuration,
  ctx,
  masterBus,
  reverbWetGain,
  effectsReady,
}: TrackRowProps) {
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const panRef = useRef<StereoPannerNode | null>(null);
  const panSetRef = useRef<((value: number) => void) | null>(null);
  const reverbSendRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startedRef = useRef(false);
  const rafRef = useRef(0);
  const color = COLORS[track.color] || COLORS.violet;

  // Automation envelope playback
  useEffect(() => {
    if (!isPlaying || !startedRef.current) return;

    function tick() {
      if (gainRef.current && track.volumeEnvelope.length > 0) {
        const v = curveInterpolate(track.volumeEnvelope, playheadTime, "exponential");
        gainRef.current.gain.value = v;
      }
      if (panSetRef.current && track.panEnvelope.length > 0) {
        const p = interpolateEnvelope(track.panEnvelope, playheadTime, track.pan);
        panSetRef.current(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, track.volumeEnvelope, track.panEnvelope, track.volume, track.pan, playheadTime]);

  // Reset gain/pan when not automated or stopped
  useEffect(() => {
    if (!isPlaying) {
      if (gainRef.current) gainRef.current.gain.value = track.volume;
      if (panSetRef.current) panSetRef.current(track.pan);
    } else if (track.volumeEnvelope.length === 0 && gainRef.current) {
      gainRef.current.gain.value = track.volume;
    }
  }, [isPlaying, track.volume, track.pan, track.volumeEnvelope.length]);

  useEffect(() => {
    if (!track.audioBlob || !ctx) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
        bufferRef.current = buffer;
      } catch {}
    };
    reader.readAsArrayBuffer(track.audioBlob);
    return () => { stopSource(); };
  }, [track.audioBlob, ctx]);

  const effectiveDuration = track.duration - track.trimStart - track.trimEnd;

  useEffect(() => {
    if (!ctx) return;
    const localTime = playheadTime - track.startOffset;
    const shouldPlay = isPlaying && effectiveAudible && localTime >= 0 && localTime < effectiveDuration;

    if (shouldPlay && !startedRef.current && bufferRef.current) {
      startSource(localTime + track.trimStart);
    } else if (!shouldPlay && startedRef.current) {
      stopSource();
    }
  }, [isPlaying, playheadTime, effectiveAudible, track.startOffset, track.trimStart, effectiveDuration, ctx]);

  useEffect(() => {
    stopSource();
  }, [seekVersion]);

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = track.volume;
    }
  }, [track.volume]);

  useEffect(() => {
    if (panSetRef.current) {
      panSetRef.current(track.pan);
    }
  }, [track.pan]);

  useEffect(() => {
    if (reverbSendRef.current) {
      reverbSendRef.current.gain.value = track.reverbSend;
    }
  }, [track.reverbSend]);

  function startSource(offset: number) {
    if (!ctx || !bufferRef.current || !masterBus) return;
    stopSource();

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;

    const { input, panLeft, panRight, output: pannerOut, setPan } = masterClock.createEqualPowerPanner(track.pan);

    const gain = ctx.createGain();
    gain.gain.value = track.volume;

    source.connect(input);
    pannerOut.connect(gain);
    gain.connect(masterBus);

    if (effectsReady && reverbWetGain) {
      const reverbSend = ctx.createGain();
      reverbSend.gain.value = track.reverbSend;
      pannerOut.connect(reverbSend);
      reverbSend.connect(reverbWetGain);
      reverbSendRef.current = reverbSend;
    }

    source.start(0, offset);
    sourceRef.current = source;
    panRef.current = { left: panLeft, right: panRight } as unknown as StereoPannerNode;
    gainRef.current = gain;
    panSetRef.current = setPan;
    startedRef.current = true;

    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null;
        panRef.current = null;
        gainRef.current = null;
        reverbSendRef.current = null;
        panSetRef.current = null;
        startedRef.current = false;
      }
    };
  }

  function stopSource() {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    panRef.current = null;
    gainRef.current = null;
    reverbSendRef.current = null;
    panSetRef.current = null;
    startedRef.current = false;
  }

  useEffect(() => {
    return () => { stopSource(); };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileLoad(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onFileLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFileLoad(file);
    },
    [onFileLoad],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-lg transition-colors group",
        track.isRecording ? "bg-red-500/10 border border-red-500/30" : "bg-daw-surface-2 hover:bg-daw-surface-3",
        !effectiveAudible && "opacity-40",
        track.solo && "ring-1 ring-yellow-500/30",
      )}
    >
      {/* Track header */}
      <div className="flex items-center gap-3 p-2">
        <div className="flex items-center gap-2 w-36 shrink-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <input
            value={track.name}
            onChange={(e) => onNameChange(e.target.value)}
            className="bg-transparent text-xs font-medium text-daw-text w-full outline-none border-b border-transparent focus:border-daw-border px-1"
          />
        </div>

        {/* Timeline clip with waveform */}
        {bufferRef.current ? (
          <TimelineClip
            buffer={bufferRef.current}
            color={color}
            startOffset={track.startOffset}
            duration={track.duration}
            trimStart={track.trimStart}
            trimEnd={track.trimEnd}
            playheadTime={playheadTime}
            isPlaying={isPlaying}
            maxDuration={maxDuration}
            bpm={bpm}
            onOffsetChange={onOffsetChange}
            onTrimChange={onTrimChange}
          />
        ) : (
          <div
            className={cn(
              "flex-1 min-w-0 h-14 rounded bg-daw-surface-1 relative transition-colors",
              isDragOver && "ring-1 ring-daw-accent bg-daw-accent/5",
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex items-center justify-center h-full text-[10px] text-daw-text-dim cursor-pointer">
              {track.isArmed ? (
                <span className="text-red-400 animate-pulse">Ready to record...</span>
              ) : (
                "Drop audio or click to load"
              )}
            </div>
          </div>
        )}

        {/* Offset input */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            step={0.1}
            value={track.startOffset}
            onChange={(e) => onOffsetChange(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-12 bg-daw-surface-1 text-daw-text text-[10px] text-center rounded px-1 py-0.5 outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title="Start offset (seconds)"
          />
          <span className="text-[9px] text-daw-text-dim">s</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onToggleArm}
            className={cn(
              "p-1.5 rounded transition-colors",
              track.isArmed ? "bg-red-500/20 text-red-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1",
            )}
            title="Arm for recording"
          >
            <Mic className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleSolo}
            className={cn(
              "p-1 rounded text-[10px] font-bold transition-colors w-7",
              track.solo ? "bg-yellow-500/20 text-yellow-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1",
            )}
            title="Solo"
          >
            S
          </button>

          <button
            onClick={onToggleMute}
            className={cn(
              "p-1 rounded text-[10px] font-bold transition-colors w-7",
              track.muted ? "bg-red-500/20 text-red-400" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1",
            )}
            title="Mute"
          >
            M
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1 w-14">
            {effectiveAudible ? (
              <Volume2 className="w-3 h-3 text-daw-text-dim" />
            ) : (
              <VolumeX className="w-3 h-3 text-daw-text-dim" />
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={track.volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1 accent-daw-accent"
            />
          </div>

          {/* Pan */}
          <div className="flex items-center gap-1 shrink-0 w-14">
            <span className="text-[9px] text-daw-text-dim w-3 text-center">
              {track.pan === 0 ? "C" : track.pan < 0 ? "L" : "R"}
            </span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={track.pan}
              onChange={(e) => onPanChange(parseFloat(e.target.value))}
              className="w-full h-1 accent-daw-cyan"
              title="Pan"
            />
          </div>

          {/* Reverb send */}
          <div className="flex items-center gap-1 shrink-0 w-12">
            <span className="text-[9px] text-daw-text-dim w-4 text-center tabular-nums">
              {Math.round(track.reverbSend * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={track.reverbSend}
              onChange={(e) => onReverbSendChange(parseFloat(e.target.value))}
              className="w-full h-1 accent-daw-pink"
              title="Reverb send"
            />
          </div>

          {/* Automation toggle */}
          <button
            onClick={onAutomationToggle}
            className={cn(
              "p-1 rounded text-[10px] transition-colors w-7",
              track.showAutomation ? "bg-daw-accent/20 text-daw-accent" : "text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-1"
            )}
            title="Toggle automation lane"
          >
            <Square className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Automation lane (expandable) */}
      {track.showAutomation && (
        <div className="px-2 pb-2 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onAutomationTypeChange("volume")}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] transition-colors",
                track.automationType === "volume"
                  ? "bg-daw-accent/20 text-daw-accent"
                  : "text-daw-text-dim hover:text-daw-text"
              )}
            >
              Volume
            </button>
            <button
              onClick={() => onAutomationTypeChange("pan")}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] transition-colors",
                track.automationType === "pan"
                  ? "bg-daw-cyan/20 text-daw-cyan"
                  : "text-daw-text-dim hover:text-daw-text"
              )}
            >
              Pan
            </button>
          </div>
          {track.automationType === "volume" && (
            <AutomationLane
              points={track.volumeEnvelope}
              maxDuration={maxDuration}
              label="Volume Envelope"
              color={color}
              height={70}
              valueMin={0}
              valueMax={1}
              formatValue={(v) => (v * 100).toFixed(0) + "%"}
              onPointsChange={onVolumeEnvelopeChange}
              curve="exponential"
            />
          )}
          {track.automationType === "pan" && (
            <AutomationLane
              points={track.panEnvelope}
              maxDuration={maxDuration}
              label="Pan Envelope"
              color={color}
              height={70}
              valueMin={-1}
              valueMax={1}
              formatValue={(v) => (v > 0 ? "+" : "") + (v * 100).toFixed(0) + "%"}
              onPointsChange={onPanEnvelopeChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
