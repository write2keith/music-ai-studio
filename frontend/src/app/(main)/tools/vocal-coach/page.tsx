"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileAudio,
  Mic,
  Loader2,
  AlertCircle,
  Play,
  Pause,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/lib/audio-player";
import { api } from "@/lib/api";
import { PitchGraph } from "@/components/PitchGraph";

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface PitchPoint {
  time: number;
  midi: number;
}

interface VocalScoreResult {
  score: number;
  grade: string;
  ref_pitch: PitchPoint[];
  user_pitch: PitchPoint[];
  total_frames: number;
  matched_frames: number;
}

export default function VocalCoachPage() {
  const audioPlayer = useAudioPlayer();

  const [vocalRefFile, setVocalRefFile] = useState<File | null>(null);
  const [vocalRecording, setVocalRecording] = useState<File | null>(null);
  const [vocalRecordingUrl, setVocalRecordingUrl] = useState<string>("");
  const [vocalRefUrl, setVocalRefUrl] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [vocalScore, setVocalScore] = useState<VocalScoreResult | null>(null);
  const [vocalError, setVocalError] = useState<string>("");
  const [vocalPrepJobId, setVocalPrepJobId] = useState<string>("");
  const [vocalPrepStatus, setVocalPrepStatus] = useState<string>("");
  const [vocalPrepPitch, setVocalPrepPitch] = useState<PitchPoint[]>([]);
  const [vocalPrepUrl, setVocalPrepUrl] = useState<string>("");
  const [livePitch, setLivePitch] = useState<{ time: number; midi: number } | null>(null);
  const [livePitchHistory, setLivePitchHistory] = useState<{ time: number; midi: number }[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      recordStartRef.current = Date.now();
      setLivePitchHistory([]);

      const buffer = new Float32Array(analyser.fftSize);

      const detectPitch = () => {
        if (!analyserRef.current) return;
        const sampleRate = audioCtx.sampleRate;
        analyserRef.current.getFloatTimeDomainData(buffer);

        const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);
        if (rms < 0.01) {
          setLivePitch(null);
          animFrameRef.current = requestAnimationFrame(detectPitch);
          return;
        }

        let bestOffset = -1;
        let bestCorr = 0;
        const minLag = Math.floor(sampleRate / 1200);
        const maxLag = Math.floor(sampleRate / 65);

        for (let lag = minLag; lag <= maxLag; lag++) {
          let corr = 0;
          for (let i = 0; i < buffer.length - lag; i++) {
            corr += buffer[i] * buffer[i + lag];
          }
          if (corr > bestCorr) {
            bestCorr = corr;
            bestOffset = lag;
          }
        }

        if (bestOffset > 0 && bestCorr > 0.1) {
          const freq = sampleRate / bestOffset;
          const midi = Math.round(69 + 12 * Math.log2(freq / 440));
          if (midi >= 30 && midi <= 90) {
            const elapsed = (Date.now() - recordStartRef.current) / 1000;
            setLivePitch({ time: elapsed, midi });
            setLivePitchHistory((prev) => [...prev.slice(-200), { time: elapsed, midi }]);
          } else {
            setLivePitch(null);
          }
        } else {
          setLivePitch(null);
        }
        animFrameRef.current = requestAnimationFrame(detectPitch);
      };

      detectPitch();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        cancelAnimationFrame(animFrameRef.current);
        analyserRef.current = null;
        audioCtx.close();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setVocalRecordingUrl(url);
        const file = new File([blob], "recording.webm", { type: "audio/webm" });
        setVocalRecording(file);
        stream.getTracks().forEach((t) => t.stop());
        setLivePitch(null);
      };

      setRecordTime(0);
      timerRef.current = setInterval(() => {
        setRecordTime((t) => t + 1);
      }, 1000);

      recorder.start();
      setIsRecording(true);
    } catch {
      setVocalError("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleVocalPrep(file: File) {
    setVocalRefFile(file);
    setVocalRefUrl(URL.createObjectURL(file));
    setVocalScore(null);
    setVocalPrepPitch([]);
    setVocalPrepUrl("");
    setVocalPrepStatus("Uploading...");

    try {
      const job = await api.tools.vocalPrep(file);
      setVocalPrepJobId(job.job_id);
      setVocalPrepStatus("Separating vocals...");

      let polls = 0;
      const poll = setInterval(async () => {
        polls++;
        try {
          const status = await api.tools.vocalPrepStatus(job.job_id);
          if (status.status === "completed") {
            clearInterval(poll);
            setVocalPrepStatus("ready");
            setVocalPrepPitch(status.pitch_data || []);
            setVocalPrepUrl(status.vocals_url || "");
          } else if (status.status === "failed") {
            clearInterval(poll);
            setVocalPrepStatus("failed");
            setVocalError("Vocal separation failed");
          } else if (polls >= 300) {
            clearInterval(poll);
            setVocalPrepStatus("failed");
            setVocalError("Vocal prep timed out");
          }
        } catch {
          if (polls >= 300) {
            clearInterval(poll);
            setVocalPrepStatus("failed");
            setVocalError("Vocal prep timed out");
          }
        }
      }, 3000);
    } catch (err) {
      setVocalPrepStatus("failed");
      const msg = err instanceof Error ? err.message : String(err);
      setVocalError(msg || "Prep failed");
    }
  }

  async function handleVocalScore() {
    if (!vocalRefFile || !vocalRecording) return;
    setScoring(true);
    setVocalError("");
    setVocalScore(null);

    try {
      const data = await api.tools.vocalScore(vocalRefFile, vocalRecording);
      setVocalScore(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVocalError(msg || "Scoring failed");
    }
    setScoring(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (vocalRecordingUrl) URL.revokeObjectURL(vocalRecordingUrl);
      if (vocalRefUrl) URL.revokeObjectURL(vocalRefUrl);
    };
  }, [vocalRecordingUrl, vocalRefUrl]);

  return (
    <div className="max-w-2xl">
      {/* Vocal Coach */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-rose-400" />
          Vocal Coach
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Upload any song — vocals are auto-separated. Record yourself, view live pitch, and get scored.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* Reference Upload + Prep */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">1. Upload a song (vocals auto-separated)</p>
          <div
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files[0];
              if (f) handleVocalPrep(f);
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => { if (!vocalPrepStatus) document.getElementById("vocal-ref-input")?.click(); }}
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
              vocalRefFile
                ? "border-daw-green/50 bg-daw-green/5"
                : "border-daw-border hover:border-rose-400/40 hover:bg-daw-surface-2"
            )}
          >
            <input
              id="vocal-ref-input"
              type="file"
              accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleVocalPrep(f);
              }}
            />
            {vocalRefFile ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileAudio className="w-4 h-4 text-daw-green" />
                {vocalRefFile.name}
                {vocalPrepStatus === "Separating vocals..." && (
                  <span className="text-yellow-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Separating vocals...
                  </span>
                )}
                {vocalPrepStatus === "ready" && (
                  <span className="text-daw-green">vocals ready</span>
                )}
                {vocalPrepStatus === "failed" && (
                  <span className="text-red-400">failed</span>
                )}
                {vocalPrepUrl && (
                  <button
                    onClick={(e) => { e.stopPropagation(); audioPlayer.play(vocalPrepUrl); }}
                    className="p-1 rounded hover:bg-daw-surface-2"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-daw-text-muted">Drop a song here (MP3, WAV, etc.)</p>
            )}
          </div>
        </div>

        {/* Reference pitch graph */}
        {vocalPrepPitch.length > 0 && (
          <div className="rounded-lg border border-daw-border overflow-hidden">
            <div className="px-3 py-1.5 bg-daw-surface-2 text-[10px] text-daw-text-dim flex justify-between">
              <span>Reference vocal pitch</span>
              <span>{vocalPrepPitch[vocalPrepPitch.length - 1]?.time?.toFixed(1)}s</span>
            </div>
            <PitchGraph
              refPitch={vocalPrepPitch}
              userPitch={isRecording ? livePitchHistory : []}
              width={568}
              height={180}
            />
          </div>
        )}

        {/* Live pitch indicator */}
        {isRecording && livePitch && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-daw-text">{NOTE_NAMES_SHORT[livePitch.midi % 12]}{Math.floor(livePitch.midi / 12) - 1}</span>
            <span className="text-daw-text-dim tabular-nums">MIDI {livePitch.midi}</span>
          </div>
        )}

        {/* Recording */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">2. Record your voice</p>
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                disabled={!!vocalRecording}
                className="flex items-center gap-2"
                variant="secondary"
              >
                <div className="w-3 h-3 rounded-full bg-red-500" />
                {vocalRecording ? "Recorded" : "Start Recording"}
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                className="flex items-center gap-2"
                variant="secondary"
              >
                <div className="w-3 h-3 rounded-sm bg-red-500 animate-pulse" />
                Stop ({recordTime}s)
              </Button>
            )}
            {vocalRecording && (
              <>
                <button
                  onClick={() => audioPlayer.play(vocalRecordingUrl)}
                  className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors"
                >
                  <Play className="w-4 h-4" />
                </button>
                <span className="text-xs text-daw-text-dim">
                  {vocalRecording.size > 0 ? formatSize(vocalRecording.size) : ""}
                </span>
                <button
                  onClick={() => {
                    setVocalRecording(null);
                    setVocalRecordingUrl("");
                    setLivePitchHistory([]);
                  }}
                  className="text-xs text-daw-text-dim hover:text-daw-text"
                >
                  re-record
                </button>
              </>
            )}
          </div>
        </div>

        {/* Score Button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleVocalScore}
          disabled={scoring || !vocalRefFile || !vocalRecording}
        >
          {scoring ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing pitch...
            </>
          ) : (
            "Score My Performance"
          )}
        </Button>

        {vocalError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {vocalError}
          </div>
        )}

        {/* Score Result */}
        <AnimatePresence>
          {vocalScore && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2a2a3e" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke={vocalScore.score >= 85 ? "#22c55e" : vocalScore.score >= 55 ? "#eab308" : "#ef4444"}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${(vocalScore.score / 100) * 97.4} 97.4`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-daw-text">{vocalScore.score}</span>
                    <span className="text-[10px] text-daw-text-dim">/100</span>
                  </div>
                </div>
                <div>
                  <div className={cn(
                    "text-2xl font-bold",
                    vocalScore.grade === "S" || vocalScore.grade === "A" ? "text-green-400" :
                    vocalScore.grade === "B" || vocalScore.grade === "C" ? "text-yellow-400" : "text-red-400"
                  )}>
                    Grade {vocalScore.grade}
                  </div>
                  <p className="text-xs text-daw-text-dim">
                    {vocalScore.matched_frames}/{vocalScore.total_frames} frames in pitch
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-daw-border overflow-hidden">
                <PitchGraph
                  refPitch={vocalScore.ref_pitch}
                  userPitch={vocalScore.user_pitch}
                  width={568}
                  height={200}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
