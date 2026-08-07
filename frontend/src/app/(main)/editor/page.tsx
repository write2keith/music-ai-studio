"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Square, Plus, Mic, Download, Trash2 } from "lucide-react";
import { TrackRow, type TrackData } from "@/components/studio/TrackRow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    duration: 0,
  };
}

export default function EditorPage() {
  const [tracks, setTracks] = useState<TrackData[]>([
    createTrack("1", "Vocals", "rose"),
    createTrack("2", "Guitar", "cyan"),
    createTrack("3", "Drums", "green"),
    createTrack("4", "Bass", "violet"),
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [bpm, setBpm] = useState(120);
  const playheadRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTrackRef = useRef<string>("");

  const maxDuration = Math.max(...tracks.map((t) => t.duration), 10);

  const animatePlayhead = useCallback(() => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    playheadRef.current = elapsed;
    setPlayheadTime(elapsed);
    if (elapsed >= maxDuration) {
      stopAll();
      return;
    }
    animRef.current = requestAnimationFrame(animatePlayhead);
  }, [maxDuration]);

  function playAll() {
    setIsPlaying(true);
    startRef.current = Date.now() - playheadRef.current * 1000;
    animRef.current = requestAnimationFrame(animatePlayhead);
  }

  function stopAll() {
    setIsPlaying(false);
    setIsRecording(false);
    cancelAnimationFrame(animRef.current);
    playheadRef.current = 0;
    setPlayheadTime(0);
    mediaRecorderRef.current?.stop();
    setTracks((prev) =>
      prev.map((t) => ({ ...t, isRecording: false, isArmed: false }))
    );
  }

  function pauseAll() {
    setIsPlaying(false);
    cancelAnimationFrame(animRef.current);
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
                : t
            )
          );
        };
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();

      setIsRecording(true);
      setIsPlaying(true);
      startRef.current = Date.now() - playheadRef.current * 1000;
      animRef.current = requestAnimationFrame(animatePlayhead);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === armedTrack.id ? { ...t, isRecording: true } : t
        )
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
          })
      )
    ).then((buffers) => {
      const length = Math.max(...buffers.map((b) => b.length));
      const out = ctx.createBuffer(2, length, ctx.sampleRate);
      const left = out.getChannelData(0);
      const right = out.getChannelData(1);

      for (const buf of buffers) {
        for (let c = 0; c < Math.min(buf.numberOfChannels, 2); c++) {
          const data = buf.getChannelData(c);
          const outChan = c === 0 ? left : right;
          for (let i = 0; i < data.length; i++) {
            outChan[i] += data[i] * 0.5;
          }
        }
      }

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

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-daw-text">Multitrack Editor</h1>
          <p className="text-xs text-daw-text-muted">
            Record and layer instruments. Arm a track, press record.
          </p>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-daw-surface-2 text-xs text-daw-text-dim">
            <span>{bpm}</span>
            <span>BPM</span>
          </div>

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

      {/* Tracks */}
      <motion.div className="space-y-1" layout>
        {tracks.map((track) => (
          <div key={track.id} className="flex items-start gap-1">
            <div className="flex-1">
              <TrackRow
                track={track}
                isPlaying={isPlaying}
                playheadTime={playheadTime}
                onToggleMute={() =>
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === track.id ? { ...t, muted: !t.muted } : t
                    )
                  )
                }
                onToggleSolo={() =>
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === track.id ? { ...t, solo: !t.solo } : t
                    )
                  )
                }
                onToggleArm={() =>
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === track.id
                        ? { ...t, isArmed: !t.isArmed }
                        : { ...t, isArmed: false }
                    )
                  )
                }
                onVolumeChange={(v) =>
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === track.id ? { ...t, volume: v } : t
                    )
                  )
                }
                onNameChange={(name) =>
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === track.id ? { ...t, name } : t
                    )
                  )
                }
              />
            </div>
            <button
              onClick={() => removeTrack(track.id)}
              className="p-1 mt-3 text-daw-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
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
