"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Square, Plus, Mic, Download, Trash2, Music, Zap, Waves, Gauge, ChevronDown, ChevronUp } from "lucide-react";
import { TrackRow, type TrackData } from "@/components/studio/TrackRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MasterClock } from "@/lib/master-clock";
import { useStemSeparator } from "@/hooks/use-stem-separator";

function MetronomeIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2v2" />
      <path d="M12 8v2" />
      <path d="M4.93 10.93l1.41 1.41" />
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      <path d="M18.07 12.34l-1.41-1.41" />
      <path d="M12 10a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8z" />
    </svg>
  );
}

const TRACK_COLORS = ["violet", "cyan", "rose", "green", "yellow", "blue", "orange"];

function createTrack(id: string, name: string, color: string): TrackData {
  return {
    id,
    name,
    color,
    audioUrl: "",
    audioBlob: null,
    isRecording: false,
    isArmed: false,
    muted: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    reverbSend: 0,
    duration: 0,
    startOffset: 0,
    trimStart: 0,
    trimEnd: 0,
    volumeEnvelope: [],
    panEnvelope: [],
    showAutomation: false,
    automationType: "volume",
  };
}

export default function EditorPage() {
  const [tracks, setTracks] = useState<TrackData[]>([
    createTrack("1", "Vocals", "rose"),
    createTrack("2", "Guitar", "yellow"),
    createTrack("3", "Drums", "green"),
    createTrack("4", "Bass", "cyan"),
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [bpm, setBpm] = useState(120);
  const seekVersionRef = useRef(0);
  const [seekVersion, setSeekVersion] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTrackRef = useRef<string>("");
  const wasPlayingRef = useRef(false);
  const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);

  const clockRef = useRef<MasterClock | null>(null);
  const metronomeIntervalRef = useRef<number | null>(null);
  const metronomeCtxRef = useRef<AudioContext | null>(null);
  const beatCountRef = useRef(0);
  const [metronomeOn, setMetronomeOn] = useState(false);

  // Master effects state
  const [reverbLevel, setReverbLevel] = useState(0.25);
  const [compressorOn, setCompressorOn] = useState(true);
  const [compressorThreshold, setCompressorThreshold] = useState(-24);
  const [effectsPanelOpen, setEffectsPanelOpen] = useState(false);

  const { job: stemJob, reset: resetStemJob, separate, getTrackAssignments } = useStemSeparator();

  function getClock(): MasterClock {
    if (!clockRef.current) clockRef.current = MasterClock.instance;
    return clockRef.current;
  }

  // Initialize effects on client-side mount only
  useEffect(() => {
    getClock().ensureEffects();
  }, []);

  const maxDuration = Math.max(...tracks.map((t) => t.startOffset + t.duration), 10);

  useEffect(() => {
    const clock = getClock();
    clock.onTick = (t) => {
      if (t >= maxDuration) {
        stopAll();
        return;
      }
      setPlayheadTime(t);
    };
    return () => {
      clock.onTick = null;
    };
  }, [maxDuration]);

  // Sync master reverb level to engine
  useEffect(() => {
    const clock = clockRef.current;
    if (clock?.effectsReady) {
      clock.reverbWetGain.gain.value = reverbLevel;
    }
  }, [reverbLevel]);

  // Sync compressor params to engine
  useEffect(() => {
    const clock = clockRef.current;
    if (clock?.effectsReady) {
      clock.compressorNode.threshold.value = compressorOn ? compressorThreshold : 0;
    }
  }, [compressorOn, compressorThreshold]);

  useEffect(() => {
    return () => {
      if (metronomeIntervalRef.current) clearInterval(metronomeIntervalRef.current);
      metronomeCtxRef.current?.close();
      stopMonitor();
      clockRef.current?.destroy();
    };
  }, []);

  function tickMetronome() {
    const ctx = metronomeCtxRef.current;
    if (!ctx || ctx.state === "closed") return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    const isDownbeat = beatCountRef.current % 4 === 0;
    osc.frequency.value = isDownbeat ? 880 : 660;
    gain.gain.setValueAtTime(isDownbeat ? 0.3 : 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
    beatCountRef.current++;
  }

  function startMetronome() {
    if (metronomeCtxRef.current?.state === "closed" || !metronomeCtxRef.current) {
      metronomeCtxRef.current = new AudioContext();
    }
    const intervalMs = (60 / bpm) * 1000;
    beatCountRef.current = 0;
    tickMetronome();
    metronomeIntervalRef.current = window.setInterval(tickMetronome, intervalMs);
  }

  function stopMetronome() {
    if (metronomeIntervalRef.current) {
      clearInterval(metronomeIntervalRef.current);
      metronomeIntervalRef.current = null;
    }
    metronomeCtxRef.current?.close();
    metronomeCtxRef.current = null;
  }

  function stopMonitor() {
    if (monitorSourceRef.current) {
      try { monitorSourceRef.current.disconnect(); } catch {}
      monitorSourceRef.current = null;
    }
    if (monitorGainRef.current) {
      try { monitorGainRef.current.disconnect(); } catch {}
      monitorGainRef.current = null;
    }
  }

  function playAll() {
    const clock = getClock();
    if (clock.ctx.state === "suspended") clock.ctx.resume();
    clock.play();
    setIsPlaying(true);
    if (metronomeOn) startMetronome();
  }

  function stopAll() {
    const clock = getClock();
    clock.stop();
    setIsPlaying(false);
    setIsRecording(false);
    stopMetronome();
    stopMonitor();
    mediaRecorderRef.current?.stop();
    setTracks((prev) =>
      prev.map((t) => ({ ...t, isRecording: false, isArmed: false })),
    );
  }

  function pauseAll() {
    getClock().pause();
    setIsPlaying(false);
    stopMetronome();
  }

  function seekTo(time: number) {
    const clamped = Math.max(0, Math.min(time, maxDuration));
    wasPlayingRef.current = isPlaying;

    seekVersionRef.current += 1;
    setSeekVersion(seekVersionRef.current);

    const clock = getClock();
    clock.seekTo(clamped);
    setPlayheadTime(clamped);

    if (wasPlayingRef.current) {
      clock.play();
    }
  }

  async function startRecording() {
    const armedTrack = tracks.find((t) => t.isArmed);
    if (!armedTrack) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingTrackRef.current = armedTrack.id;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onloadedmetadata = () => {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === recordingTrackRef.current
                ? { ...t, audioBlob: blob, audioUrl: URL.createObjectURL(blob), duration: audio.duration, isRecording: false, isArmed: false }
                : t,
            ),
          );
        };
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();

      const clock = getClock();
      clock.ensureEffects();
      if (clock.ctx.state === "suspended") clock.ctx.resume();

      // Low-latency monitoring: feed mic directly to output at low level
      stopMonitor();
      const monSource = clock.ctx.createMediaStreamSource(stream);
      const monGain = clock.ctx.createGain();
      monGain.gain.value = 0.15;
      monSource.connect(monGain);
      monGain.connect(clock.ctx.destination);
      monitorSourceRef.current = monSource;
      monitorGainRef.current = monGain;

      setIsRecording(true);
      setIsPlaying(true);
      clock.play();
      if (metronomeOn) startMetronome();

      setTracks((prev) =>
        prev.map((t) =>
          t.id === armedTrack.id ? { ...t, isRecording: true } : t,
        ),
      );
    } catch {
      // microphone denied
    }
  }

  function addTrack() {
    const id = String(Date.now());
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const name = `Track ${tracks.length + 1}`;
    setTracks((prev) => [...prev, createTrack(id, name, color)]);
  }

  function loadFileToTrack(trackId: string, file: File) {
    const blob = new Blob([file], { type: file.type || "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? { ...t, audioBlob: blob, audioUrl: url, duration: audio.duration, name: file.name.replace(/\.[^.]+$/, "") }
            : t,
        ),
      );
    };
  }

  function setTrackOffset(trackId: string, offset: number) {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, startOffset: Math.max(0, offset) } : t)),
    );
  }

  function removeTrack(id: string) {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  }

  function exportMix() {
    const activeTracks = tracks.filter((t) => t.audioBlob && !t.muted);
    if (activeTracks.length === 0) return;

    const ctx = new AudioContext();
    Promise.all(
      activeTracks.map(
        (t) =>
          new Promise<AudioBuffer>((resolve) => {
            const reader = new FileReader();
            reader.onload = async () => {
              const buf = await ctx.decodeAudioData(reader.result as ArrayBuffer);
              resolve(buf);
            };
            reader.readAsArrayBuffer(t.audioBlob!);
          }),
      ),
    ).then((buffers) => {
      const sampleRate = ctx.sampleRate;
      const maxEnd = Math.max(
        ...activeTracks.map((t, i) => t.startOffset * sampleRate + buffers[i].length),
      );
      const length = Math.ceil(maxEnd);
      const out = ctx.createBuffer(2, length, sampleRate);
      const left = out.getChannelData(0);
      const right = out.getChannelData(1);

      activeTracks.forEach((t, idx) => {
        const buf = buffers[idx];
        const offsetSamples = Math.round(t.startOffset * sampleRate);
        const pan = t.pan;
        const leftGain = pan <= 0 ? 1 : 1 - pan;
        const rightGain = pan >= 0 ? 1 : 1 + pan;

        for (let c = 0; c < Math.min(buf.numberOfChannels, 2); c++) {
          const data = buf.getChannelData(c);
          for (let i = 0; i < data.length; i++) {
            const outIdx = offsetSamples + i;
            if (outIdx >= length) break;
            left[outIdx] += data[i] * t.volume * leftGain * 0.5;
            right[outIdx] += data[i] * t.volume * rightGain * 0.5;
          }
        }
      });

      const wav = encodeWav(out);
      const blob = new Blob([wav], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mixdown.wav";
      a.click();
      URL.revokeObjectURL(url);
      ctx.close();
    });
  }

  const handleGlobalDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && /\.(mp3|wav|m4a|flac|ogg)$/i.test(file.name)) {
        separate(file);
      }
    },
    [separate],
  );

  const stemInputRef = useRef<HTMLInputElement>(null);

  const handleStemBrowse = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) separate(file);
      if (stemInputRef.current) stemInputRef.current.value = "";
    },
    [separate],
  );

  useEffect(() => {
    if (stemJob.status === "completed" && stemJob.result) {
      const assignments = getTrackAssignments(stemJob.result);
      const newTracks: TrackData[] = [];
      assignments.forEach((assign) => {
        const id = String(Date.now()) + "_" + assign.stemKey;
        newTracks.push(createTrack(id, assign.name, assign.color));
      });
      if (newTracks.length > 0) {
        setTracks(newTracks);
        setTimeout(() => {
          assignments.forEach((assign, idx) => {
            fetch(assign.url)
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.onloadedmetadata = () => {
                  setTracks((prev) =>
                    prev.map((t, i) =>
                      i === idx ? { ...t, audioBlob: blob, audioUrl: url, duration: audio.duration } : t,
                    ),
                  );
                };
              });
          });
        }, 100);
      }
    }
  }, [stemJob.status, stemJob.result, getTrackAssignments]);

  const anySolo = tracks.some((t) => t.solo);
  const isProcessing = stemJob.status === "uploading" || stemJob.status === "processing";

  return (
    <div
      className="max-w-4xl space-y-4 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={isProcessing ? undefined : handleGlobalDrop}
    >
      {/* Global drop zone overlay */}
      {isProcessing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
        >
          <div className="bg-daw-surface-2 rounded-xl p-8 text-center space-y-5 border border-daw-border shadow-2xl max-w-sm w-full mx-4">
            <Zap className="w-10 h-10 text-daw-accent mx-auto animate-pulse" />
            <div>
              <h2 className="text-lg font-bold text-daw-text">Stem Separation</h2>
              <p className="text-sm text-daw-text-muted mt-1">{stemJob.progress}</p>
            </div>
            <div className="w-full bg-daw-surface-3 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-daw-accent to-daw-cyan rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stemJob.progressPct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <p className="text-xs text-daw-text-dim">{stemJob.progressPct}%</p>
          </div>
        </motion.div>
      ) : null}

      {stemJob.status === "failed" && stemJob.progress ? (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{stemJob.progress}</span>
          <button
            onClick={resetStemJob}
            className="text-xs text-daw-text-dim hover:text-daw-text underline underline-offset-2 ml-4 shrink-0"
          >
            dismiss
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-daw-text">Multitrack Editor</h1>
          <p className="text-xs text-daw-text-muted">
            Drop a full song to auto-separate stems. Record and layer instruments.
          </p>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-daw-surface-2 text-xs">
            <input
              type="number"
              min={40}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(300, Number(e.target.value) || 120)))}
              className="w-10 bg-transparent text-daw-text text-center outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-daw-text-dim">BPM</span>
          </div>

          <button
            onClick={() => {
              const next = !metronomeOn;
              setMetronomeOn(next);
              if (!next) stopMetronome();
              else if (isPlaying) startMetronome();
            }}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              metronomeOn
                ? "bg-daw-accent/20 text-daw-accent"
                : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text",
            )}
            title="Toggle metronome"
          >
            <MetronomeIcon className="w-4 h-4" />
          </button>
          {metronomeOn && isPlaying && (
            <div className="w-1.5 h-1.5 rounded-full bg-daw-accent animate-pulse" />
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={stopAll}
            disabled={!isPlaying && !isRecording}
            className="px-2"
          >
            <Square className="w-4 h-4" fill="currentColor" />
          </Button>

          <Button
            size="sm"
            variant={isPlaying ? "secondary" : "primary"}
            onClick={isPlaying ? pauseAll : playAll}
            disabled={isRecording}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button
            size="sm"
            onClick={startRecording}
            disabled={isRecording || !tracks.some((t) => t.isArmed)}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            <Mic className="w-4 h-4" />
            {isRecording ? "Recording..." : "Record"}
          </Button>

          <Button size="sm" variant="secondary" onClick={exportMix} className="px-2">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Global drop zone */}
      <div
        className={cn(
          "p-4 rounded-lg border-2 border-dashed transition-colors text-center",
          isProcessing && "pointer-events-none opacity-50",
          stemJob.status === "idle"
            ? "border-daw-border hover:border-daw-accent/50 hover:bg-daw-accent/5"
            : "border-daw-accent/30 bg-daw-accent/5",
        )}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) separate(file);
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={stemInputRef}
          type="file"
          accept="audio/*"
          onChange={handleStemBrowse}
          className="hidden"
        />
        <div className="flex items-center justify-center gap-2 text-sm text-daw-text-muted">
          <Music className="w-4 h-4" />
          <span>
            Drop a full song here to auto-separate stems
            <span className="text-daw-text-dim"> (MP3, WAV, M4A, FLAC)</span>
          </span>
          <span className="text-daw-text-dim mx-1">or</span>
          <button
            onClick={() => stemInputRef.current?.click()}
            className="text-daw-accent hover:text-daw-accent-glow underline underline-offset-2 transition-colors"
          >
            browse
          </button>
        </div>
        {stemJob.status !== "idle" && (
          <p className="text-xs text-daw-accent mt-1">{stemJob.progress}</p>
        )}
      </div>

      {/* Master Effects Panel */}
      <div className="rounded-lg bg-daw-surface-2 border border-daw-border overflow-hidden">
        <button
          onClick={() => setEffectsPanelOpen(!effectsPanelOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-daw-text-muted hover:text-daw-text transition-colors"
        >
          <span className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-daw-accent" />
            <span className="font-medium">Master Effects</span>
            <span className="text-[10px] text-daw-text-dim hidden sm:inline">
              Reverb Send / Compressor
            </span>
          </span>
          {effectsPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {effectsPanelOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-4 pt-1 border-t border-daw-border grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {/* Reverb control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-daw-text-muted uppercase tracking-wider">
                  Reverb
                </span>
                <span className="text-xs font-mono tabular-nums text-daw-pink">
                  {Math.round(reverbLevel * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={reverbLevel}
                onChange={(e) => setReverbLevel(parseFloat(e.target.value))}
                className="w-full h-1.5 accent-daw-pink"
              />
              <div className="flex justify-between text-[9px] text-daw-text-dim">
                <span>Dry</span>
                <span>Wet</span>
              </div>
            </div>

            {/* Compressor control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-daw-text-muted uppercase tracking-wider">
                  <Gauge className="w-3 h-3 inline mr-1" />
                  Compressor
                </span>
                <button
                  onClick={() => setCompressorOn(!compressorOn)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    compressorOn
                      ? "bg-daw-cyan/20 text-daw-cyan border border-daw-cyan/30"
                      : "bg-daw-surface-3 text-daw-text-dim border border-daw-border"
                  )}
                >
                  {compressorOn ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-daw-text-dim">Threshold</span>
                <span className="text-xs font-mono tabular-nums text-daw-cyan">
                  {compressorThreshold} dB
                </span>
              </div>
              <input
                type="range"
                min="-60"
                max="0"
                step="1"
                value={compressorThreshold}
                onChange={(e) => setCompressorThreshold(parseInt(e.target.value))}
                disabled={!compressorOn}
                className="w-full h-1.5 accent-daw-cyan disabled:opacity-30"
              />
              <div className="flex justify-between text-[9px] text-daw-text-dim">
                <span>-60 dB</span>
                <span>0 dB</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Timeline ruler */}
      <div className="h-6 bg-daw-surface-2 rounded-t-lg relative overflow-hidden border-b border-daw-border">
        {Array.from({ length: Math.ceil(maxDuration) }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-daw-border"
            style={{ left: `${(i / maxDuration) * 100}%` }}
          >
            <span className="absolute top-1 left-1 text-[9px] text-daw-text-dim">
              {i}s
            </span>
          </div>
        ))}
      </div>

      {/* Scrubber Slider */}
      <div className="px-1 py-0.5 bg-daw-surface-2 border-b border-daw-border">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={maxDuration}
            step={0.05}
            value={playheadTime}
            onChange={(e) => {
              seekTo(parseFloat(e.target.value));
            }}
            className="w-full h-3 appearance-none bg-transparent cursor-pointer
              [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-daw-surface-3
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-daw-accent [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-daw-accent/40 [&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing
              [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-daw-surface-3
              [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-daw-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:shadow-daw-accent/40 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:active:cursor-grabbing"
          />
          <div
            className="absolute -bottom-1 text-[9px] text-daw-accent font-mono pointer-events-none"
            style={{
              left: `max(0%, min(95%, ${(playheadTime / maxDuration) * 100}%))`,
              transform: "translateX(-50%)",
            }}
          >
            {playheadTime.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Tracks */}
      <motion.div className="space-y-1 overflow-hidden" layout>
        {tracks.map((track) => {
          const effectiveAudible = anySolo ? track.solo && !track.muted : !track.muted;
          return (
            <div key={track.id} className="flex items-start gap-1 min-w-0">
              <div className="flex-1 min-w-0">
                <TrackRow
                  track={track}
                  effectiveAudible={effectiveAudible}
                  isPlaying={isPlaying}
                  playheadTime={playheadTime}
                  seekVersion={seekVersion}
                  ctx={clockRef.current?.ctx ?? null}
                  masterBus={clockRef.current?.masterBus ?? null}
                  reverbWetGain={clockRef.current?.effectsReady ? clockRef.current.reverbWetGain : null}
                  effectsReady={clockRef.current?.effectsReady ?? false}
                  onToggleMute={() =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, muted: !t.muted } : t,
                      ),
                    )
                  }
                  onToggleSolo={() =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, solo: !t.solo } : t,
                      ),
                    )
                  }
                  onToggleArm={() =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id
                          ? { ...t, isArmed: !t.isArmed }
                          : { ...t, isArmed: false },
                      ),
                    )
                  }
                  onVolumeChange={(v) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, volume: v } : t,
                      ),
                    )
                  }
                  onPanChange={(v) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, pan: v } : t,
                      ),
                    )
                  }
                  onReverbSendChange={(v) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, reverbSend: v } : t,
                      ),
                    )
                  }
                  onNameChange={(name) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, name } : t,
                      ),
                    )
                  }
                  onFileLoad={(file) => loadFileToTrack(track.id, file)}
                  onOffsetChange={(offset) => setTrackOffset(track.id, offset)}
                  onTrimChange={(trimStart, trimEnd) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, trimStart, trimEnd } : t,
                      ),
                    )
                  }
                  onVolumeEnvelopeChange={(pts) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, volumeEnvelope: pts } : t,
                      ),
                    )
                  }
                  onPanEnvelopeChange={(pts) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, panEnvelope: pts } : t,
                      ),
                    )
                  }
                  onAutomationToggle={() =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, showAutomation: !t.showAutomation } : t,
                      ),
                    )
                  }
                  onAutomationTypeChange={(type) =>
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === track.id ? { ...t, automationType: type } : t,
                      ),
                    )
                  }
                  bpm={bpm}
                  maxDuration={maxDuration}
                />
              </div>
              <button
                onClick={() => removeTrack(track.id)}
                className="p-1 mt-3 text-daw-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </motion.div>

      {/* Add track */}
      <button
        onClick={addTrack}
        className="w-full py-3 rounded-lg border-2 border-dashed border-daw-border text-daw-text-dim hover:text-daw-text hover:border-daw-text-dim/50 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <Plus className="w-4 h-4" />
        Add Track
      </button>
    </div>
  );
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
