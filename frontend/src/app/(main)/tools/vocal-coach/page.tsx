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
  Repeat,
  SkipBack,
  SkipForward,
  Repeat1,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PitchGraph } from "@/components/PitchGraph";
import { WaveformLoop } from "@/components/studio/WaveformLoop";
import { StemMixer, type StemMixerHandle } from "@/components/studio/StemMixer";

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function ScorePillar({ label, score, detail, color }: { label: string; score: number; detail: string; color: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-daw-surface-2/60 border border-daw-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-daw-text-dim">{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{score}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-daw-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[9px] text-daw-text-dim mt-1 leading-tight">{detail}</p>
    </div>
  );
}

interface PitchPoint { time: number; midi: number; }

interface VocalScoreResult {
  score: number;
  grade: string;
  ref_pitch: PitchPoint[];
  user_pitch: PitchPoint[];
  total_frames: number;
  matched_frames: number;
  pitch_accuracy?: { cents_mad: number; cents_std: number; score: number; in_tune_pct: number } | null;
  stability?: { f0_variance_cents: number; vibrato_rate_hz: number; score: number } | null;
  timing?: { dtw_cost: number; duration_ratio: number; score: number } | null;
  dynamics?: { rms_correlation: number; dynamic_range_match: number; score: number } | null;
}

export default function VocalCoachPage() {
  // ── State ──
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

  // ── Practice mode state ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopA, setLoopA] = useState(0);
  const [loopB, setLoopB] = useState(0);
  const [stemBuffers, setStemBuffers] = useState<{
    vocals?: AudioBuffer; backing?: AudioBuffer; instrumental?: AudioBuffer;
  } | null>(null);

  // ── Refs ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const backingBufferRef = useRef<AudioBuffer | null>(null);
  const stemMixerRef = useRef<StemMixerHandle>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const animFrameRef2 = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const prepPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Format helpers ──
  const formatTime = (t: number) => {
    const m = Math.floor(t / 60); const s = Math.floor(t % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ── Shared AudioContext ──
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  // ── Load audio stem URL into AudioBuffer ──
  const loadStemBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    try {
      const ctx = getAudioCtx();
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuf);
    } catch {
      return null;
    }
  }, [getAudioCtx]);

  // ── Stop all playback ──
  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
    if (animFrameRef2.current) cancelAnimationFrame(animFrameRef2.current);
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  // ── Start playback ──
  const startPlayback = useCallback(() => {
    if (!backingBufferRef.current) return;
    const ctx = getAudioCtx();
    stopPlayback();

    const source = ctx.createBufferSource();
    source.buffer = backingBufferRef.current;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    source.connect(masterGain);
    masterGain.connect(ctx.destination);
    sourcesRef.current.push(source);

    const offset = loopEnabled ? loopA : playbackTime;
    source.start(0, offset);

    startTimeRef.current = ctx.currentTime - offset;

    const updatePlayhead = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      const limit = loopEnabled ? loopB : duration;
      if (elapsed >= limit) {
        if (loopEnabled) {
          stopPlayback();
          startPlayback();
        } else {
          stopPlayback();
        }
        return;
      }
      setPlaybackTime(elapsed);
      animFrameRef2.current = requestAnimationFrame(updatePlayhead);
    };
    animFrameRef2.current = requestAnimationFrame(updatePlayhead);

    source.onended = () => {
      if (!loopEnabled) stopPlayback();
    };

    setIsPlaying(true);
  }, [getAudioCtx, stopPlayback, playbackTime, duration, loopEnabled, loopA, loopB]);

  // ── Seek ──
  const handleSeek = useCallback((t: number) => {
    setPlaybackTime(Math.max(0, Math.min(t, duration)));
    if (isPlaying) {
      stopPlayback();
      setTimeout(startPlayback, 50);
    }
  }, [duration, isPlaying, stopPlayback, startPlayback]);

  // ── Set loop A (from current position) ──
  const setLoopAToCurrent = useCallback(() => {
    setLoopA(playbackTime);
    if (playbackTime >= loopB || loopB === 0) setLoopB(duration);
  }, [playbackTime, loopB, duration]);

  // ── Set loop B ──
  const setLoopBToCurrent = useCallback(() => {
    setLoopB(Math.max(playbackTime, loopA + 0.1));
  }, [playbackTime, loopA]);

  // ── Reset loop ──
  const resetLoop = useCallback(() => {
    setLoopA(0); setLoopB(duration); setLoopEnabled(false);
  }, [duration]);

  // ── Start recording with backing track ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      const audioCtx = getAudioCtx();
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
        if (rms < 0.01) { setLivePitch(null); animFrameRef.current = requestAnimationFrame(detectPitch); return; }
        let bestOffset = -1, bestCorr = 0;
        const minLag = Math.floor(sampleRate / 1200), maxLag = Math.floor(sampleRate / 65);
        for (let lag = minLag; lag <= maxLag; lag++) {
          let corr = 0;
          for (let i = 0; i < buffer.length - lag; i++) corr += buffer[i] * buffer[i + lag];
          if (corr > bestCorr) { bestCorr = corr; bestOffset = lag; }
        }
        if (bestOffset > 0 && bestCorr > 0.1) {
          const freq = sampleRate / bestOffset;
          const midi = Math.round(69 + 12 * Math.log2(freq / 440));
          if (midi >= 30 && midi <= 90) {
            const elapsed = (Date.now() - recordStartRef.current) / 1000;
            setLivePitch({ time: elapsed, midi });
            setLivePitchHistory((prev) => [...prev.slice(-200), { time: elapsed, midi }]);
          } else { setLivePitch(null); }
        } else { setLivePitch(null); }
        animFrameRef.current = requestAnimationFrame(detectPitch);
      };
      detectPitch();

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        cancelAnimationFrame(animFrameRef.current);
        analyserRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setVocalRecordingUrl(url);
        setVocalRecording(new File([blob], "recording.webm", { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
        setLivePitch(null);
      };

      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
      recorder.start();
      setIsRecording(true);

      // Start backing track simultaneously
      if (backingBufferRef.current) startPlayback();
    } catch {
      setVocalError("Microphone access denied");
    }
  }, [getAudioCtx, startPlayback]);

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    stopPlayback();
  }

  // ── Vocal Prep (upload + separation) ──
  async function handleVocalPrep(file: File) {
    setVocalRefFile(file);
    setVocalRefUrl(URL.createObjectURL(file));
    setVocalScore(null);
    setVocalPrepPitch([]);
    setVocalPrepUrl("");
    setVocalPrepStatus("Uploading...");
    setStemBuffers(null);
    backingBufferRef.current = null;
    setDuration(0);
    stopPlayback();

    try {
      const job = await api.tools.vocalPrep(file);
      setVocalPrepJobId(job.job_id);
      setVocalPrepStatus("Separating vocals...");
      let polls = 0;
      prepPollRef.current = setInterval(async () => {
        polls++;
        try {
          const status = await api.tools.vocalPrepStatus(job.job_id);
          if (status.status === "completed") {
            clearInterval(prepPollRef.current!); prepPollRef.current = null;
            setVocalPrepStatus("ready");
            setVocalPrepPitch(status.pitch_data || []);
            setVocalPrepUrl(status.vocals_url || "");
            setVocalError("");

            // Load instrumental for practice playback
            const instUrl = status.instrumental_url || status.vocals_url;
            if (instUrl) {
              const buf = await loadStemBuffer(instUrl);
              if (buf) {
                backingBufferRef.current = buf;
                setDuration(buf.duration);
                setLoopB(buf.duration);
              }
            }
            // Load individual stems for mixer
            const vocals = status.vocals_url ? await loadStemBuffer(status.vocals_url) : undefined;
            const backing = status.backing_url ? await loadStemBuffer(status.backing_url) : undefined;
            const inst = instUrl ? await loadStemBuffer(instUrl) : undefined;
            if (vocals || backing || inst) {
              setStemBuffers({
                vocals: vocals ?? undefined,
                backing: (backing || inst) ?? undefined,
                instrumental: inst ?? undefined,
              });
            }
          } else if (status.status === "failed") {
            clearInterval(prepPollRef.current!); prepPollRef.current = null;
            setVocalPrepStatus("failed");
            setVocalError("Vocal separation failed");
          } else if (polls >= 300) {
            clearInterval(prepPollRef.current!); prepPollRef.current = null;
            setVocalPrepStatus("failed");
            setVocalError("Vocal prep timed out");
          }
        } catch {
          if (polls >= 300) {
            clearInterval(prepPollRef.current!); prepPollRef.current = null;
            setVocalPrepStatus("failed");
            setVocalError("Vocal prep timed out");
          }
        }
      }, 3000);
    } catch (err) {
      setVocalPrepStatus("failed");
      setVocalError(err instanceof Error ? err.message : "Prep failed");
    }
  }

  // ── Scoring ──
  async function handleVocalScore() {
    if (!vocalRefFile || !vocalRecording) return;
    setScoring(true); setVocalError(""); setVocalScore(null);
    try {
      const data = await api.tools.vocalScore(vocalRefFile, vocalRecording);
      setVocalScore(data);
    } catch (err) {
      setVocalError(err instanceof Error ? err.message : "Scoring failed");
    }
    setScoring(false);
  }

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (prepPollRef.current) clearInterval(prepPollRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (animFrameRef2.current) cancelAnimationFrame(animFrameRef2.current);
      if (vocalRecordingUrl) URL.revokeObjectURL(vocalRecordingUrl);
      if (vocalRefUrl) URL.revokeObjectURL(vocalRefUrl);
      stopPlayback();
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, [vocalRecordingUrl, vocalRefUrl, stopPlayback]);

  const isReady = vocalPrepStatus === "ready" && backingBufferRef.current;

  return (
    <div className="max-w-2xl">
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-rose-400" />
          Vocal Coach
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Upload any song — vocals auto-separated. Set loop points, mix stems, record yourself, get scored.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* ── 1. Upload ── */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">1. Upload a song (vocals auto-separated)</p>
          <div
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleVocalPrep(f); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => { if (!vocalPrepStatus) document.getElementById("vocal-ref-input")?.click(); }}
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
              vocalRefFile ? "border-daw-green/50 bg-daw-green/5" : "border-daw-border hover:border-rose-400/40 hover:bg-daw-surface-2"
            )}
          >
            <input id="vocal-ref-input" type="file" accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVocalPrep(f); }} />
            {vocalRefFile ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileAudio className="w-4 h-4 text-daw-green" />
                {vocalRefFile.name}
                {vocalPrepStatus === "Separating vocals..." && (
                  <span className="text-yellow-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Separating...</span>
                )}
                {vocalPrepStatus === "ready" && <span className="text-daw-green">ready</span>}
                {vocalPrepStatus === "failed" && <span className="text-red-400">failed</span>}
              </div>
            ) : (
              <p className="text-sm text-daw-text-muted">Drop a song here (MP3, WAV, etc.)</p>
            )}
          </div>
        </div>

        {/* ── 2. Waveform & Loop Controls (after prep) ── */}
        <AnimatePresence>
          {isReady && backingBufferRef.current && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-xs text-daw-text-dim">2. Practice with waveform</p>

              <WaveformLoop
                buffer={backingBufferRef.current}
                currentTime={playbackTime}
                duration={duration}
                isPlaying={isPlaying}
                loopA={loopA}
                loopB={loopB}
                onLoopAChange={setLoopA}
                onLoopBChange={setLoopB}
                onSeek={handleSeek}
              />

              {/* Playback Controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => { setPlaybackTime(0); if (isPlaying) { stopPlayback(); startPlayback(); } }}
                  className="p-1.5 rounded hover:bg-daw-surface-2 text-daw-text-dim hover:text-daw-text transition-colors">
                  <SkipBack className="w-4 h-4" />
                </button>

                <button onClick={() => isPlaying ? stopPlayback() : startPlayback()}
                  className="p-2 rounded-lg bg-daw-accent/20 text-daw-accent hover:bg-daw-accent/30 transition-colors">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button onClick={setLoopAToCurrent}
                  className="px-2 py-1 rounded text-[10px] bg-daw-surface-2 text-daw-accent hover:bg-daw-accent/20 transition-colors font-mono">
                  Set A
                </button>
                <button onClick={setLoopBToCurrent}
                  className="px-2 py-1 rounded text-[10px] bg-daw-surface-2 text-daw-accent hover:bg-daw-accent/20 transition-colors font-mono">
                  Set B
                </button>

                <div className="w-px h-5 bg-daw-border mx-1" />

                <button onClick={() => { setLoopEnabled(!loopEnabled); if (!loopEnabled && (loopA > 0 || loopB < duration)) { setLoopEnabled(true); } }}
                  className={cn("p-1.5 rounded transition-colors", loopEnabled ? "bg-daw-accent/20 text-daw-accent" : "text-daw-text-dim hover:text-daw-text")}>
                  <Repeat1 className="w-4 h-4" />
                </button>

                <button onClick={resetLoop} className="p-1.5 rounded text-[10px] text-daw-text-dim hover:text-daw-text transition-colors">
                  Reset
                </button>

                <span className="text-[10px] text-daw-text-dim ml-auto font-mono">
                  {formatTime(playbackTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Stem Mixer */}
              <StemMixer
                ref={stemMixerRef}
                audioCtx={getAudioCtx()}
                stemBuffers={stemBuffers}
                isPlaying={isPlaying}
                onPlaybackEnd={() => setIsPlaying(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Reference pitch graph ── */}
        {vocalPrepPitch.length > 0 && (
          <div className="rounded-lg border border-daw-border overflow-hidden">
            <div className="px-3 py-1.5 bg-daw-surface-2 text-[10px] text-daw-text-dim flex justify-between">
              <span>Reference vocal pitch</span>
              <span>{vocalPrepPitch[vocalPrepPitch.length - 1]?.time?.toFixed(1)}s</span>
            </div>
            <PitchGraph refPitch={vocalPrepPitch} userPitch={isRecording ? livePitchHistory : []} width={568} height={180} />
          </div>
        )}

        {/* ── Live pitch indicator ── */}
        {isRecording && livePitch && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-daw-text">{NOTE_NAMES_SHORT[livePitch.midi % 12]}{Math.floor(livePitch.midi / 12) - 1}</span>
            <span className="text-daw-text-dim tabular-nums">MIDI {livePitch.midi}</span>
          </div>
        )}

        {/* ── 3. Record ── */}
        <div>
          <p className="text-xs text-daw-text-dim mb-2">3. Record your voice{isReady ? " (plays with backing track)" : ""}</p>
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button onClick={startRecording} disabled={!!vocalRecording} className="flex items-center gap-2" variant="secondary">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                {vocalRecording ? "Recorded" : "Start Recording"}
              </Button>
            ) : (
              <Button onClick={stopRecording} className="flex items-center gap-2" variant="secondary">
                <div className="w-3 h-3 rounded-sm bg-red-500 animate-pulse" />
                Stop ({formatTime(recordTime)})
              </Button>
            )}
            {vocalRecording && (
              <>
                <button onClick={() => {
                  const a = new Audio(vocalRecordingUrl); a.play();
                }} className="p-2 rounded-lg bg-daw-surface-2 hover:bg-daw-surface-3 transition-colors">
                  <Play className="w-4 h-4" />
                </button>
                <span className="text-xs text-daw-text-dim">{vocalRecording.size > 0 ? formatSize(vocalRecording.size) : ""}</span>
                <button onClick={() => { setVocalRecording(null); setVocalRecordingUrl(""); setLivePitchHistory([]); }}
                  className="text-xs text-daw-text-dim hover:text-daw-text">re-record</button>
              </>
            )}
          </div>
        </div>

        {/* ── Score Button ── */}
        <Button size="lg" className="w-full" onClick={handleVocalScore} disabled={scoring || !vocalRefFile || !vocalRecording}>
          {scoring ? (<><Loader2 className="w-4 h-4 animate-spin" />Analyzing pitch...</>) : "Score My Performance"}
        </Button>

        {vocalError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />{vocalError}
          </div>
        )}

        {/* ── Score Result ── */}
        <AnimatePresence>
          {vocalScore && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2a2a3e" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none"
                      stroke={vocalScore.score >= 85 ? "#22c55e" : vocalScore.score >= 55 ? "#eab308" : "#ef4444"}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${(vocalScore.score / 100) * 97.4} 97.4`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-daw-text">{vocalScore.score}</span>
                    <span className="text-[10px] text-daw-text-dim">/100</span>
                  </div>
                </div>
                <div>
                  <div className={cn("text-2xl font-bold",
                    vocalScore.grade === "S" || vocalScore.grade === "A" ? "text-green-400" :
                    vocalScore.grade === "B" || vocalScore.grade === "C" ? "text-yellow-400" : "text-red-400")}>
                    Grade {vocalScore.grade}
                  </div>
                  <p className="text-xs text-daw-text-dim">{vocalScore.matched_frames}/{vocalScore.total_frames} frames in pitch</p>
                </div>
              </div>

              {/* Multi-dimensional breakdown */}
              {vocalScore.pitch_accuracy && (
                <div className="grid grid-cols-2 gap-2">
                  <ScorePillar
                    label="Pitch Accuracy"
                    score={vocalScore.pitch_accuracy.score}
                    detail={`${vocalScore.pitch_accuracy.cents_mad} cents MAD · ${vocalScore.pitch_accuracy.in_tune_pct}% in tune (<25\u00A2)`}
                    color="#a78bfa"
                  />
                  <ScorePillar
                    label="Stability"
                    score={vocalScore.stability?.score ?? 0}
                    detail={vocalScore.stability
                      ? `${vocalScore.stability.f0_variance_cents} cents\u00B2 var${vocalScore.stability.vibrato_rate_hz > 0 ? ` · vibrato ${vocalScore.stability.vibrato_rate_hz} Hz` : ""}`
                      : "N/A"}
                    color="#22d3ee"
                  />
                  <ScorePillar
                    label="Timing"
                    score={vocalScore.timing?.score ?? 0}
                    detail={vocalScore.timing
                      ? `DTW ${vocalScore.timing.dtw_cost.toFixed(2)} · dur ${vocalScore.timing.duration_ratio.toFixed(2)}x`
                      : "N/A"}
                    color="#f59e0b"
                  />
                  <ScorePillar
                    label="Dynamics"
                    score={vocalScore.dynamics?.score ?? 0}
                    detail={vocalScore.dynamics
                      ? `corr ${vocalScore.dynamics.rms_correlation.toFixed(2)} · range ${vocalScore.dynamics.dynamic_range_match.toFixed(2)}`
                      : "N/A"}
                    color="#34d399"
                  />
                </div>
              )}

              <div className="rounded-lg border border-daw-border overflow-hidden">
                <PitchGraph refPitch={vocalScore.ref_pitch} userPitch={vocalScore.user_pitch} width={568} height={200} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
