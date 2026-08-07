"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Link,
  Music,
  Play,
  Pause,
  Loader2,
  Film,
  AlertCircle,
  Check,
  ExternalLink,
  Scissors,
  Upload,
  Shrink,
  FileAudio,
  Mic,
} from "lucide-react";
import { cn, formatSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAudioPlayer } from "@/lib/audio-player";
import { api } from "@/lib/api";
import type { CompressResult, TranscribeResult, TranscribeNote, ChordDetectResult, ChordEvent, PitchTempoResult, LyricTranscribeResult, GuitarTabResult, TabNote, CalibrationResponse } from "@/lib/api";
import { PitchGraph } from "@/components/PitchGraph";

interface DownloadResult {
  title: string;
  artist: string;
  filename: string;
  url: string;
  duration_secs: number;
  thumbnail: string;
}

const NOTE_NAMES_SHORT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SAMPLE_RATES = [
  { value: 44100, label: "44.1k" },
  { value: 22050, label: "22k" },
  { value: 16000, label: "16k" },
  { value: 11025, label: "11k" },
  { value: 8000, label: "8k" },
];

const BIT_DEPTHS = [
  { value: 16, label: "16-bit" },
  { value: 8, label: "8-bit" },
];

export default function ToolsPage() {
  const [url, setUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<DownloadResult[]>([]);
  const audioPlayer = useAudioPlayer();

  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressRate, setCompressRate] = useState(22050);
  const [compressDepth, setCompressDepth] = useState(16);
  const [compressMono, setCompressMono] = useState(true);
  const [compressFormat, setCompressFormat] = useState<"wav" | "mp3">("wav");
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState("");
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

  const [transcribeFile, setTranscribeFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMethod, setTranscribeMethod] = useState<"fft" | "polyphonic">("fft");
  const [transcribeError, setTranscribeError] = useState("");
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);

  const [vocalRefFile, setVocalRefFile] = useState<File | null>(null);
  const [vocalRecording, setVocalRecording] = useState<File | null>(null);
  const [vocalRecordingUrl, setVocalRecordingUrl] = useState<string>("");
  const [vocalRefUrl, setVocalRefUrl] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [vocalScore, setVocalScore] = useState<any>(null);
  const [vocalError, setVocalError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [vocalPrepJobId, setVocalPrepJobId] = useState<string>("");
  const [vocalPrepStatus, setVocalPrepStatus] = useState<string>("");
  const [vocalPrepPitch, setVocalPrepPitch] = useState<any[]>([]);
  const [vocalPrepUrl, setVocalPrepUrl] = useState<string>("");
  const [livePitch, setLivePitch] = useState<{ time: number; midi: number } | null>(null);
  const [livePitchHistory, setLivePitchHistory] = useState<{ time: number; midi: number }[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);

  const [removerFile, setRemoverFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removerJobId, setRemoverJobId] = useState("");
  const [removerStatus, setRemoverStatus] = useState("");
  const [removerPollId, setRemoverPollId] = useState<NodeJS.Timeout | null>(null);

  const [chordFile, setChordFile] = useState<File | null>(null);
  const [chordDetecting, setChordDetecting] = useState(false);
  const [chordError, setChordError] = useState("");
  const [chordResult, setChordResult] = useState<ChordDetectResult | null>(null);

  const [pitchTempoFile, setPitchTempoFile] = useState<File | null>(null);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [tempoFactor, setTempoFactor] = useState(1.0);
  const [pitchTempoAdjusting, setPitchTempoAdjusting] = useState(false);
  const [pitchTempoError, setPitchTempoError] = useState("");
  const [pitchTempoResult, setPitchTempoResult] = useState<PitchTempoResult | null>(null);

  const [lyricFile, setLyricFile] = useState<File | null>(null);
  const [lyricJobId, setLyricJobId] = useState("");
  const [lyricPolling, setLyricPolling] = useState(false);
  const [lyricTranscribing, setLyricTranscribing] = useState(false);
  const [lyricError, setLyricError] = useState("");
  const [lyricResult, setLyricResult] = useState<LyricTranscribeResult | null>(null);

  const [tabFile, setTabFile] = useState<File | null>(null);
  const [tabGenerating, setTabGenerating] = useState(false);
  const [tabError, setTabError] = useState("");
  const [tabResult, setTabResult] = useState<GuitarTabResult | null>(null);

  const [correctionMode, setCorrectionMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editNoteValue, setEditNoteValue] = useState("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("audio/") || f?.name.endsWith(".wav")) {
      setCompressFile(f);
      setCompressResult(null);
      setCompressError("");
    }
  }, []);

  async function handleDownload() {
    if (!url.trim()) return;
    setDownloading(true);
    setError("");
    setResult(null);

    try {
      const cleanUrl = url.trim().split("&list=")[0].split("?si=")[0];
      const data = await api.tools.youtube(cleanUrl);

      if (data.title) {
        setResult(data);
        setHistory((prev) => [data, ...prev.slice(0, 9)]);
        setUrl("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Network error");
    }
    setDownloading(false);
  }

  async function handleCompress() {
    if (!compressFile) return;
    setCompressing(true);
    setCompressError("");
    setCompressResult(null);

    try {
      const data = await api.tools.compress(compressFile, compressRate, compressDepth, compressMono, compressFormat);
      setCompressResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCompressError(msg || "Network error");
    }
    setCompressing(false);
  }

  async function handleTranscribe() {
    if (!transcribeFile) return;
    setTranscribing(true);
    setTranscribeError("");
    setTranscribeResult(null);

    try {
      const data = await api.tools.transcribe(transcribeFile, transcribeMethod);
      setTranscribeResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTranscribeError(msg || "Network error");
    }
    setTranscribing(false);
  }

  async function handleVocalRemove() {
    if (!removerFile) return;
    setRemoving(true);
    setRemoverStatus("");
    try {
      const data = await api.tools.vocalRemove(removerFile);
      setRemoverJobId(data.filename.replace("instrumental_", "").replace(".wav", ""));
      setRemoverStatus("processing");
      pollRemover(data.filename.replace("instrumental_", "").replace(".wav", ""));
    } catch (err) {
      setRemoverStatus("failed");
      setRemoving(false);
    }
  }

  async function pollRemover(jobId: string) {
    const t = setInterval(async () => {
      try {
        const s = await api.tools.vocalRemoveStatus(jobId);
        if (s.instrumental_ready) {
          setRemoverStatus("ready");
          setRemoving(false);
          clearInterval(t);
        }
      } catch {
        setRemoverStatus("failed");
        setRemoving(false);
        clearInterval(t);
      }
    }, 2000);
    setRemoverPollId(t);
  }

  useEffect(() => {
    return () => {
      if (removerPollId) clearInterval(removerPollId);
    };
  }, [removerPollId]);

  async function handleChordDetect() {
    if (!chordFile) return;
    setChordDetecting(true);
    setChordError("");
    setChordResult(null);
    try {
      const data = await api.tools.chordDetect(chordFile);
      setChordResult(data);
    } catch (err) {
      setChordError(err instanceof Error ? err.message : String(err));
    }
    setChordDetecting(false);
  }

  async function handlePitchTempo() {
    if (!pitchTempoFile) return;
    setPitchTempoAdjusting(true);
    setPitchTempoError("");
    setPitchTempoResult(null);
    try {
      const data = await api.tools.pitchTempo(pitchTempoFile, pitchSemitones, tempoFactor);
      setPitchTempoResult(data);
    } catch (err) {
      setPitchTempoError(err instanceof Error ? err.message : String(err));
    }
    setPitchTempoAdjusting(false);
  }

  async function handleLyricTranscribe() {
    if (!lyricFile) return;
    setLyricTranscribing(true);
    setLyricError("");
    setLyricResult(null);
    try {
      const data = await api.tools.lyricTranscribe(lyricFile);
      setLyricJobId(data.job_id);
      setLyricPolling(true);
      pollLyrics(data.job_id);
    } catch (err) {
      setLyricError(err instanceof Error ? err.message : String(err));
      setLyricTranscribing(false);
    }
  }

  async function pollLyrics(jobId: string) {
    const t = setInterval(async () => {
      try {
        const data = await api.tools.lyricTranscribeStatus(jobId);
        if (data.status === "completed") {
          setLyricResult(data);
          setLyricPolling(false);
          setLyricTranscribing(false);
          clearInterval(t);
        }
      } catch {
        setLyricError("Transcription failed");
        setLyricPolling(false);
        setLyricTranscribing(false);
        clearInterval(t);
      }
    }, 2000);
  }

  async function handleGuitarTab() {
    if (!tabFile) return;
    setTabGenerating(true);
    setTabError("");
    setTabResult(null);
    try {
      const data = await api.tools.guitarTab(tabFile);
      setTabResult(data);
    } catch (err) {
      setTabError(err instanceof Error ? err.message : String(err));
    }
    setTabGenerating(false);
  }

  async function submitNoteCorrection(
    tool: string,
    originalNote: TranscribeNote | TabNote,
    correctedName: string,
  ) {
    const correctedPitch = nameToMidi(correctedName);
    if (correctedPitch < 0) return;

    try {
      const cal = await api.tools.submitFeedback({
        store_id: "default",
        tool,
        action: "corrected",
        note_pitch: correctedPitch,
        note_name: correctedName,
        original_pitch: originalNote.pitch,
        original_note: originalNote.note_name,
        detail: `User corrected ${originalNote.note_name} to ${correctedName}`,
      });
      setCalibration(cal);
      setEditingNoteIdx(null);
      setEditNoteValue("");
    } catch {}
  }

  async function loadCalibration() {
    try {
      const cal = await api.tools.getCalibration("default");
      setCalibration(cal);
    } catch {}
  }

  useEffect(() => { loadCalibration(); }, []);

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

      const poll = setInterval(async () => {
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
          }
        } catch {
          clearInterval(poll);
          setVocalPrepStatus("failed");
          setVocalError("Separation polling error");
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

  const isPlaying = result && audioPlayer.isCurrentUrl(result.url) && audioPlayer.isPlaying;
  const isPlayingCompressed = compressResult && audioPlayer.isCurrentUrl(compressResult.url) && audioPlayer.isPlaying;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Film className="w-5 h-5 text-red-400" />
          YouTube Audio Extractor
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Paste a YouTube URL to extract audio. Use it for stem separation or editing.
        </p>
      </div>

      {/* URL Input */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-daw-text-dim" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDownload()}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-daw-surface-3 border border-daw-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-red-400/50 transition-colors"
            />
          </div>
          <Button onClick={handleDownload} disabled={downloading || !url.trim()} className="shrink-0">
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Extract
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-daw-green/20"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => audioPlayer.toggle(result.url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-daw-accent/30 to-daw-cyan/30 flex items-center justify-center shrink-0 hover:from-daw-accent/50 hover:to-daw-cyan/50 transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-daw-text truncate">{result.title}</p>
                <p className="text-xs text-daw-text-muted">
                  {result.artist} &middot; {formatDuration(result.duration_secs)}
                </p>
              </div>
              <Badge variant="green">
                <Check className="w-3 h-3" /> Ready
              </Badge>
            </div>

            <div className="flex gap-2">
              <a
                href={result.url}
                download={result.filename}
                className="daw-button daw-button-primary text-xs"
              >
                <Download className="w-3.5 h-3.5" /> Download Audio
              </a>
              <a
                href={`/generate`}
                className="daw-button text-xs"
              >
                <Scissors className="w-3.5 h-3.5" /> Separate Stems
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-daw-text">Recent Downloads</h3>
          <div className="space-y-1.5">
            {history.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-daw-surface-3 transition-colors group"
              >
                <button
                  onClick={() => audioPlayer.toggle(item.url)}
                  className="w-8 h-8 rounded-lg bg-daw-surface-3 flex items-center justify-center shrink-0 group-hover:bg-daw-accent/20 transition-colors"
                >
                  {audioPlayer.isCurrentUrl(item.url) && audioPlayer.isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-daw-accent" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-daw-text-muted ml-0.5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-daw-text truncate">{item.title}</p>
                  <p className="text-[10px] text-daw-text-dim">{item.artist}</p>
                </div>
                <span className="text-[10px] text-daw-text-dim">
                  {formatDuration(item.duration_secs)}
                </span>
                <a
                  href={item.url}
                  download={item.filename}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5 text-daw-text-muted hover:text-daw-text" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audio Compressor */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Shrink className="w-5 h-5 text-amber-400" />
          Audio Compressor
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Reduce audio file size by lowering sample rate, bit depth, or converting to mono.
          Supports WAV files.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* File Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("compress-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            compressFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-daw-accent/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="compress-file-input"
            type="file"
            accept="audio/wav,.wav,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCompressFile(f);
                setCompressResult(null);
                setCompressError("");
              }
            }}
          />
          {compressFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{compressFile.name}</span>
              <span className="text-xs text-daw-text-dim">({formatSize(compressFile.size)})</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop WAV file here or click to browse</p>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Sample Rate</label>
            <div className="flex gap-1">
              {SAMPLE_RATES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setCompressRate(r.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    compressRate === r.value
                      ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-daw-text-dim mb-1.5">Bit Depth</label>
            <div className="flex gap-1">
              {BIT_DEPTHS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setCompressDepth(d.value)}
                  className={cn(
                    "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                    compressDepth === d.value
                      ? "bg-daw-accent/10 text-daw-accent border-daw-accent/30"
                      : "bg-daw-surface-2 text-daw-text-muted border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mono Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compressMono}
            onChange={(e) => setCompressMono(e.target.checked)}
            className="w-4 h-4 rounded border-daw-border bg-daw-surface-2 accent-daw-accent"
          />
          <span className="text-xs text-daw-text-muted">Convert to mono (halves size for stereo files)</span>
        </label>

        {/* Output Format */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-daw-text-muted w-20">Format:</span>
          <div className="flex gap-1 p-0.5 rounded-lg bg-daw-surface-2">
            {(["wav", "mp3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCompressFormat(f)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                  compressFormat === f
                    ? "bg-daw-accent/20 text-daw-accent"
                    : "text-daw-text-muted hover:text-daw-text"
                )}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </label>

        {/* Compress Button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleCompress}
          disabled={compressing || !compressFile}
        >
          {compressing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Compressing...
            </>
          ) : (
            <>
              <Shrink className="w-4 h-4" />
              Compress Audio
            </>
          )}
        </Button>

        {compressError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {compressError}
          </div>
        )}
      </div>

      {/* Compress Result */}
      <AnimatePresence>
        {compressResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-daw-green/20"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => audioPlayer.toggle(compressResult.url)}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center shrink-0 hover:from-amber-500/40 hover:to-orange-500/40 transition-all"
              >
                {isPlayingCompressed ? (
                  <Pause className="w-5 h-5 text-amber-400" />
                ) : (
                  <Play className="w-5 h-5 text-amber-400 ml-0.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-daw-text">Compressed Audio</span>
                  <Badge variant="green">
                    <Check className="w-3 h-3" /> Ready
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-daw-text-dim">
                  <span>{formatSize(compressResult.original_size)} &rarr; {formatSize(compressResult.compressed_size)}</span>
                  <span className="text-daw-green font-medium">-{compressResult.reduction_pct}%</span>
                  <span>{compressResult.sample_rate / 1000}kHz</span>
                  <span>{formatDuration(compressResult.duration_secs)}</span>
                </div>
              </div>
            </div>
            <a
              href={compressResult.url}
              download={compressResult.filename}
              className="daw-button daw-button-primary text-xs inline-flex"
            >
              <Download className="w-3.5 h-3.5" /> Download Compressed
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note Transcriber */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-violet-400" />
          Instrument Note Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Analyze an instrument stem to detect MIDI notes with timing.
          FFT for single-note lines, Polyphonic for chords. Supports WAV, MP3, M4A, FLAC, OGG.
        </p>

        <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-daw-surface-2 w-fit">
          {(["fft", "polyphonic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setTranscribeMethod(m);
                setTranscribeResult(null);
                setTranscribeError("");
              }}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                transcribeMethod === m
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-daw-text-muted hover:text-daw-text"
              )}
            >
              {m === "fft" ? "Mono (FFT)" : "Polyphonic"}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith("audio/") || /\.(wav|mp3|m4a|flac|ogg)$/i.test(f.name)) {
              setTranscribeFile(f);
              setTranscribeResult(null);
              setTranscribeError("");
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("transcribe-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
            transcribeFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-violet-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="transcribe-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setTranscribeFile(f);
                setTranscribeResult(null);
                setTranscribeError("");
              }
            }}
          />
          {transcribeFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{transcribeFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a stem here (guitar, bass, piano) or click to browse</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleTranscribe}
          disabled={transcribing || !transcribeFile}
        >
          {transcribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing notes...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Detect Notes
            </>
          )}
        </Button>

        {transcribeError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {transcribeError}
          </div>
        )}
      </div>

      {/* Transcribe Result */}
      <AnimatePresence>
        {transcribeResult && transcribeResult.notes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass rounded-xl p-4 space-y-3 border border-violet-400/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  <Mic className="w-3 h-3" /> {transcribeResult.note_count} notes
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatDuration(transcribeResult.duration_secs)} &middot; {transcribeResult.method.toUpperCase()}
                </span>
                {calibration && calibration.total_corrections > 0 && (
                  <span className="text-[10px] text-daw-green">
                    accuracy {Math.round(calibration.accuracy * 100)}%
                  </span>
                )}
              </div>
              <button
                onClick={() => setCorrectionMode(!correctionMode)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  correctionMode
                    ? "border-amber-400/50 text-amber-300 bg-amber-400/10"
                    : "border-daw-border text-daw-text-dim hover:text-daw-text"
                )}
              >
                {correctionMode ? "Done Correcting" : "Correct Notes"}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {transcribeResult.notes.slice(0, 50).map((note: TranscribeNote, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 text-xs"
                >
                  <span className="w-14 text-daw-text-dim tabular-nums">
                    {note.start_time.toFixed(2)}s
                  </span>
                  {correctionMode && editingNoteIdx === i ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitNoteCorrection("transcribe", note, editNoteValue);
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={editNoteValue}
                        onChange={(e) => setEditNoteValue(e.target.value)}
                        placeholder={note.note_name}
                        className="w-12 bg-daw-surface-2 border border-amber-400/30 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300 outline-none"
                        autoFocus
                      />
                      <button type="submit" className="text-[10px] text-daw-green hover:underline">ok</button>
                      <button type="button" onClick={() => { setEditingNoteIdx(null); setEditNoteValue(""); }} className="text-[10px] text-daw-text-dim hover:underline">cancel</button>
                    </form>
                  ) : (
                    <span className="w-10 font-mono font-bold text-daw-accent">
                      {note.note_name}
                    </span>
                  )}
                  <span className="text-daw-text-dim tabular-nums">
                    MIDI {note.pitch}
                  </span>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-daw-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-400 to-daw-accent transition-all"
                        style={{ width: `${(note.end_time - note.start_time) * 60}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-daw-text-dim tabular-nums w-10 text-right">
                    {(note.end_time - note.start_time).toFixed(2)}s
                  </span>
                  {correctionMode && editingNoteIdx !== i && (
                    <button
                      onClick={() => { setEditingNoteIdx(i); setEditNoteValue(note.note_name); }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 shrink-0"
                      title="Correct this note"
                    >
                      edit
                    </button>
                  )}
                </div>
              ))}
              {transcribeResult.notes.length > 50 && (
                <p className="text-[10px] text-daw-text-dim text-center py-1">
                  +{transcribeResult.notes.length - 50} more notes
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vocal Remover */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-amber-400" />
          Vocal Remover
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Remove vocals from any song — get clean instrumental backing tracks and isolated vocals.
          Background harmonies are preserved in the instrumental.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setRemoverFile(f); setRemoverStatus(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("remover-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            removerFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-amber-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="remover-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setRemoverFile(f); setRemoverStatus(""); }
            }}
          />
          {removerFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{removerFile.name}</span>
              {removerStatus === "processing" && (
                <span className="flex items-center gap-1 text-yellow-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Separating...
                </span>
              )}
              {removerStatus === "ready" && (
                <span className="text-daw-green text-xs">Ready</span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a song here to remove vocals</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleVocalRemove}
          disabled={removing || !removerFile}
        >
          {removing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Removing Vocals...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Remove Vocals
            </>
          )}
        </Button>

        <AnimatePresence>
          {removerStatus === "ready" && removerJobId && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-2"
            >
              <div className="flex gap-2">
                <a
                  href={`/api/tools/vocal-remove/${removerJobId}/instrumental`}
                  download
                  className="flex-1 daw-button daw-button-primary text-xs text-center py-2"
                >
                  <Download className="w-3.5 h-3.5 inline mr-1" />
                  Download Instrumental
                </a>
                <a
                  href={`/api/tools/vocal-remove/${removerJobId}/vocals`}
                  download
                  className="flex-1 daw-button daw-button-secondary text-xs text-center py-2"
                >
                  <Download className="w-3.5 h-3.5 inline mr-1" />
                  Download Vocals
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chord Detection */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Music className="w-5 h-5 text-cyan-400" />
          Chord Detection
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Detect chords as the song plays. Ideal for learning songs, memorizing progressions, and teaching.
          Drop a separated instrument stem or a full mix.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setChordFile(f); setChordResult(null); setChordError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("chord-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            chordFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-cyan-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="chord-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setChordFile(f); setChordResult(null); setChordError(""); }
            }}
          />
          {chordFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{chordFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a song or instrument stem here</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleChordDetect}
          disabled={chordDetecting || !chordFile}
        >
          {chordDetecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Detecting chords...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Detect Chords
            </>
          )}
        </Button>

        {chordError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {chordError}
          </div>
        )}

        <AnimatePresence>
          {chordResult && chordResult.chords.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-cyan-400/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <Badge variant="accent" className="text-[10px]">
                  {chordResult.chord_count} chords
                </Badge>
                <span className="text-xs text-daw-text-dim">
                  {formatDuration(chordResult.duration_secs)}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {chordResult.chords.map((c: ChordEvent, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 text-xs">
                    <span className="w-14 text-daw-text-dim tabular-nums shrink-0">
                      {c.start_time.toFixed(1)}s
                    </span>
                    <span className="flex-1 font-mono font-bold text-cyan-300">{c.chord}</span>
                    <span className="text-[10px] text-daw-text-dim">{c.notes}</span>
                    <div className="w-12 shrink-0">
                      <div className="h-1 rounded-full bg-daw-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-400 transition-all"
                          style={{ width: `${c.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-daw-text-dim w-10 text-right tabular-nums">
                      {(c.end_time - c.start_time).toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Guitar Tab Generator */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Music className="w-5 h-5 text-orange-400" />
          Guitar Tab Generator
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Generate Guitar-Pro-style tablature from any melody or solo audio.
          Detects notes and maps them to optimal string/fret positions for standard EADGBE tuning.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setTabFile(f); setTabResult(null); setTabError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("tab-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            tabFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-orange-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="tab-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setTabFile(f); setTabResult(null); setTabError(""); }
            }}
          />
          {tabFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{tabFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a melody recording (guitar solo, bass line, vocal melody)</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleGuitarTab}
          disabled={tabGenerating || !tabFile}
        >
          {tabGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating tab...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Generate Tablature
            </>
          )}
        </Button>

        {tabError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {tabError}
          </div>
        )}

        <AnimatePresence>
          {tabResult && tabResult.notes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4 border border-orange-400/20 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="accent" className="text-[10px]">
                    {tabResult.note_count} notes
                  </Badge>
                  <span className="text-xs text-daw-text-dim">
                    {formatDuration(tabResult.duration_secs)} &middot; Standard EADGBE
                  </span>
                  {calibration && calibration.total_corrections > 0 && (
                    <span className="text-[10px] text-daw-green">
                      accuracy {Math.round(calibration.accuracy * 100)}%
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCorrectionMode(!correctionMode)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    correctionMode
                      ? "border-amber-400/50 text-amber-300 bg-amber-400/10"
                      : "border-daw-border text-daw-text-dim hover:text-daw-text"
                  )}
                >
                  {correctionMode ? "Done Correcting" : "Correct Notes"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <div className="inline-flex gap-0 min-w-full">
                  {(tabResult.notes.slice(0, 40) as TabNote[]).map((note, i) => (
                    <div key={i} className="flex flex-col shrink-0" style={{ width: 28 }}>
                      <div className="text-[9px] text-daw-text-dim text-center mb-1">
                        {note.start_time.toFixed(1)}
                      </div>
                      {[0, 1, 2, 3, 4, 5].map((s) => (
                        <div
                          key={s}
                          className={cn(
                            "h-5 border-t border-daw-border flex items-center justify-center text-[10px] font-mono font-bold",
                            s === 0 ? "border-t-2" : "",
                            s === 5 ? "border-b-2" : "",
                            note.string === s
                              ? "text-orange-300"
                              : "text-daw-text-dim"
                          )}
                        >
                          {note.string === s ? note.fret : "-"}
                        </div>
                      ))}
                      <div className="text-[8px] text-daw-text-dim text-center mt-0.5">
                        {note.note_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {tabResult.notes.length > 40 && (
                <p className="text-[10px] text-daw-text-dim text-center">
                  +{tabResult.notes.length - 40} more notes (showing first 40)
                </p>
              )}

              {/* Note list */}
              <details className="cursor-pointer">
                <summary className="text-xs text-daw-text-dim hover:text-daw-text transition-colors">
                  Show all notes ({tabResult.note_count})
                </summary>
                <div className="max-h-48 overflow-y-auto space-y-0.5 mt-2 pr-1">
                  {(tabResult.notes as TabNote[]).map((note, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-daw-surface-3/50 text-xs">
                      <span className="w-12 text-daw-text-dim tabular-nums">{note.start_time.toFixed(2)}s</span>
                      {correctionMode && editingNoteIdx === i ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitNoteCorrection("guitar-tab", note, editNoteValue);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="text"
                            value={editNoteValue}
                            onChange={(e) => setEditNoteValue(e.target.value)}
                            placeholder={note.note_name}
                            className="w-12 bg-daw-surface-2 border border-amber-400/30 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300 outline-none"
                            autoFocus
                          />
                          <button type="submit" className="text-[10px] text-daw-green hover:underline">ok</button>
                          <button type="button" onClick={() => { setEditingNoteIdx(null); setEditNoteValue(""); }} className="text-[10px] text-daw-text-dim hover:underline">cancel</button>
                        </form>
                      ) : (
                        <span className="font-mono font-bold text-orange-300 w-10">{note.note_name}</span>
                      )}
                      <span className="text-daw-text-dim">String {note.string_name}</span>
                      <span className="font-mono font-bold text-daw-text">Fret {note.fret}</span>
                      {correctionMode && editingNoteIdx !== i && (
                        <button
                          onClick={() => { setEditingNoteIdx(i); setEditNoteValue(note.note_name); }}
                          className="text-[10px] text-amber-400 hover:text-amber-300"
                        >
                          edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pitch & Tempo Adjustment */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-blue-400" />
          Pitch &amp; Tempo Adjustment
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Change pitch (up to +/-12 semitones) and tempo (50%-200%) to suit different practice needs.
          Great for learning songs in a different key or slowing down fast passages.
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setPitchTempoFile(f); setPitchTempoResult(null); setPitchTempoError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("pitch-tempo-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            pitchTempoFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-blue-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="pitch-tempo-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setPitchTempoFile(f); setPitchTempoResult(null); setPitchTempoError(""); }
            }}
          />
          {pitchTempoFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{pitchTempoFile.name}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop an audio file here</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-daw-text-dim block mb-1">
              Pitch Shift: {pitchSemitones > 0 ? "+" : ""}{pitchSemitones} semitones
            </label>
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={pitchSemitones}
              onChange={(e) => setPitchSemitones(Number(e.target.value))}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[10px] text-daw-text-dim mt-0.5">
              <span>-12</span>
              <span>0</span>
              <span>+12</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-daw-text-dim block mb-1">
              Tempo: {Math.round(tempoFactor * 100)}%
            </label>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={Math.round(tempoFactor * 100)}
              onChange={(e) => setTempoFactor(Number(e.target.value) / 100)}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[10px] text-daw-text-dim mt-0.5">
              <span>50%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handlePitchTempo}
          disabled={pitchTempoAdjusting || !pitchTempoFile}
        >
          {pitchTempoAdjusting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Music className="w-4 h-4" />
              Apply Changes
            </>
          )}
        </Button>

        {pitchTempoError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {pitchTempoError}
          </div>
        )}

        <AnimatePresence>
          {pitchTempoResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-blue-400/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <Badge variant="accent">
                  <Check className="w-3 h-3" /> Ready
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-daw-text-dim">
                <span>Duration: {formatDuration(pitchTempoResult.duration_secs)}</span>
                <span>Pitch: {pitchSemitones !== 0 ? `${pitchSemitones > 0 ? "+" : ""}${pitchSemitones}st` : "unchanged"}</span>
                <span>Tempo: {Math.round(tempoFactor * 100)}%</span>
              </div>
              <a
                href={pitchTempoResult.url}
                download={pitchTempoResult.filename}
                className="daw-button daw-button-primary text-xs inline-flex"
              >
                <Download className="w-3.5 h-3.5" /> Download Adjusted Audio
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lyric Transcription */}
      <div className="pt-6 border-t border-daw-border">
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-400" />
          Lyric Transcription
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Auto-transcribe lyrics from any track using Whisper speech-to-text.
          Upload a separated vocal stem or a full song (vocals auto-separated).
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        <div
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) { setLyricFile(f); setLyricResult(null); setLyricError(""); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById("lyric-file-input")?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors",
            lyricFile
              ? "border-daw-green/50 bg-daw-green/5"
              : "border-daw-border hover:border-emerald-400/40 hover:bg-daw-surface-2"
          )}
        >
          <input
            id="lyric-file-input"
            type="file"
            accept=".wav,.mp3,.m4a,.flac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setLyricFile(f); setLyricResult(null); setLyricError(""); }
            }}
          />
          {lyricFile ? (
            <div className="flex items-center justify-center gap-2 text-daw-green">
              <FileAudio className="w-5 h-5" />
              <span className="text-sm font-medium">{lyricFile.name}</span>
              {lyricPolling && (
                <span className="flex items-center gap-1 text-yellow-400 text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Transcribing...
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Music className="w-8 h-8 mx-auto text-daw-text-dim" />
              <p className="text-sm text-daw-text-muted">Drop a vocal stem or full song here</p>
            </div>
          )}
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleLyricTranscribe}
          disabled={lyricTranscribing || !lyricFile}
        >
          {lyricTranscribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Transcribing lyrics...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Transcribe Lyrics
            </>
          )}
        </Button>

        {lyricError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {lyricError}
          </div>
        )}

        <AnimatePresence>
          {lyricResult && lyricResult.lyrics.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-3 border border-emerald-400/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-2">
                <Badge variant="green">
                  {lyricResult.lyrics.length} lines
                </Badge>
                {lyricResult.language && (
                  <span className="text-xs text-daw-text-dim">Language: {lyricResult.language}</span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {lyricResult.lyrics.map((line, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-1.5 rounded-md bg-daw-surface-3/50 hover:bg-daw-surface-3/80 transition-colors text-xs"
                  >
                    <span className="w-14 text-daw-text-dim tabular-nums shrink-0 pt-0.5">
                      {line.start.toFixed(1)}s
                    </span>
                    <span className="flex-1 text-daw-text">{line.text}</span>
                    <span className="text-[10px] text-daw-text-dim shrink-0">
                      {Math.round(line.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              {lyricResult.full_text && (
                <div className="p-3 rounded-lg bg-daw-surface-2/50 text-sm text-daw-text leading-relaxed italic border-l-2 border-emerald-400/30">
                  {lyricResult.full_text}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              const f = e.dataTransfer.files[0];
              if (f) handleVocalPrep(f);
            }}
            onDragOver={(e) => e.preventDefault()}
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

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function nameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(\d+)$/i);
  if (!match) return -1;
  const noteIdx = NOTE_NAMES_SHORT.findIndex((n) => n.toUpperCase() === match[1].toUpperCase());
  if (noteIdx < 0) return -1;
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIdx;
}
