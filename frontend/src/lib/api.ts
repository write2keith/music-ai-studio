import type {
  HealthInfo,
  AudioResult,
  StemResult,
  GenerationJob,
  EffectsParams,
  Track,
  CommunityPost,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === "Failed to fetch") return true;
  const msg = String(err);
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("socket hang up") ||
    msg.includes("UND_ERR_SOCKET") ||
    msg.includes("fetch failed")
  );
}

async function fetchWithRetry(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(input, init);
      return res;
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    ...init,
    ...(API_BASE ? {} : { credentials: "include" as const }),
    headers: {
      ...(init?.headers),
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || body.error || res.statusText);
  }

  return res.json();
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    ...(API_BASE ? {} : { credentials: "include" as const }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || body.error || res.statusText);
  }

  return res.json();
}

export const api = {
  health: () => request<HealthInfo>("/api/health"),

  generate: (prompt: string, duration: number = 10, meta?: {
    genre?: string;
    mood?: string;
    key?: string;
    bpm?: number;
    structure?: string;
  }) => {
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("duration", String(duration));
    if (meta?.genre) fd.append("genre", meta.genre);
    if (meta?.mood) fd.append("mood", meta.mood);
    if (meta?.key) fd.append("key", meta.key);
    if (meta?.bpm) fd.append("bpm", String(meta.bpm));
    if (meta?.structure) fd.append("structure", meta.structure);
    return upload<GenerationJob>("/api/generate", fd);
  },

  getGenerationStatus: (jobId: string) =>
    request<GenerationJob>(`/api/generate/${jobId}`),

  separate: (file: File, model: string = "htdemucs") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", model);
    return upload<GenerationJob>("/api/separate", fd);
  },

  getSeparationStatus: (jobId: string) =>
    request<GenerationJob>(`/api/separate/${jobId}`),

  getTracks: () => request<Track[]>("/api/tracks"),

  getTrack: (id: string) => request<Track>(`/api/tracks/${id}`),

  getCommunity: () => request<CommunityPost[]>("/api/community"),

  getLibrary: (status?: string) => {
    const query = status ? `?status=${status}` : "";
    return request<Track[]>(`/api/library${query}`);
  },

  publishTrack: (id: string) =>
    request<{ status: string; track: Track }>(`/api/tracks/${id}/publish`, { method: "POST" }),

  unpublishTrack: (id: string) =>
    request<{ status: string; track: Track }>(`/api/tracks/${id}/unpublish`, { method: "POST" }),

  forkTrack: (id: string) =>
    request<{ status: string; track: Track }>(`/api/tracks/${id}/fork`, { method: "POST" }),

  enhancePrompt: (prompt: string, meta?: {
    genre?: string;
    mood?: string;
    key?: string;
    bpm?: number;
    structure?: string;
  }) => {
    return request<{ enhanced_prompt: string }>("/api/enhance-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ...meta }),
    });
  },

  auth: {
    login: (email: string, password: string) =>
      request<{ user: any; message: string }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),

    register: (email: string, name: string, password: string) =>
      request<{ user: any; message: string }>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      }),

    logout: () =>
      request<{ message: string }>("/api/auth/logout", { method: "POST" }),

    me: () => request<{ user: any }>("/api/auth/me"),
  },

  edit: {
    trim: (file: File, start: number, end: number) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("start_sec", String(start));
      fd.append("end_sec", String(end));
      return upload<AudioResult>("/api/edit/trim", fd);
    },

    fade: (file: File, fadeIn: number, fadeOut: number) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("fade_in", String(fadeIn));
      fd.append("fade_out", String(fadeOut));
      return upload<AudioResult>("/api/edit/fade", fd);
    },

    volume: (file: File, gainDb: number) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("gain_db", String(gainDb));
      return upload<AudioResult>("/api/edit/volume", fd);
    },

    normalize: (file: File, targetDb: number) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("target_db", String(targetDb));
      return upload<AudioResult>("/api/edit/normalize", fd);
    },

    speed: (file: File, factor: number) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("factor", String(factor));
      return upload<AudioResult>("/api/edit/speed", fd);
    },

    merge: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return upload<AudioResult>("/api/edit/merge", fd);
    },

    effects: (file: File, params: EffectsParams) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("reverb_room_size", String(params.reverb_room_size));
      fd.append("reverb_wet", String(params.reverb_wet));
      fd.append("delay_seconds", String(params.delay_seconds));
      fd.append("delay_feedback", String(params.delay_feedback));
      fd.append("delay_mix", String(params.delay_mix));
      fd.append("eq_low_gain", String(params.eq_low_gain));
      fd.append("eq_mid_gain", String(params.eq_mid_gain));
      fd.append("eq_high_gain", String(params.eq_high_gain));
      fd.append("compressor_threshold", String(params.compressor_threshold));
      fd.append("compressor_ratio", String(params.compressor_ratio));
      fd.append("gain_db", String(params.gain_db));
      fd.append("speed_factor", String(params.speed_factor));
      return upload<AudioResult>("/api/edit/effects", fd);
    },
  },

  tools: {
    transcribe: (file: File, method: string = "fft") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("method", method);
      return upload<TranscribeResult>("/api/tools/transcribe", fd);
    },
    compress: (file: File, sampleRate: number, bitDepth: number, mono: boolean, outputFormat: string = "wav") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sample_rate", String(sampleRate));
      fd.append("bit_depth", String(bitDepth));
      fd.append("to_mono", String(mono));
      fd.append("output_format", outputFormat);
      return upload<CompressResult>("/api/tools/compress", fd);
    },
    youtube: (url: string, mp3: boolean = false) =>
      request<YouTubeResult>("/api/tools/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mp3 }),
      }),
    vocalScore: (reference: File, recording: File) => {
      const fd = new FormData();
      fd.append("reference", reference);
      fd.append("recording", recording);
      return upload<VocalScoreResult>("/api/tools/vocal-score", fd);
    },
    vocalPrep: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<VocalPrepResult>("/api/tools/vocal-prep", fd);
    },
    vocalPrepStatus: (jobId: string) =>
      request<VocalPrepResult>(`/api/tools/vocal-prep/${jobId}`),
    vocalRemove: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<VocalRemoveResult>("/api/tools/vocal-remove", fd);
    },
    vocalRemoveStatus: (jobId: string) =>
      request<{ status: string; instrumental_ready: boolean; vocals_ready: boolean }>(`/api/tools/vocal-remove/${jobId}/status`),
    chordDetect: (file: File, method?: string) => {
      const fd = new FormData();
      fd.append("file", file);
      const qs = method ? `?method=${encodeURIComponent(method)}` : "";
      return upload<ChordDetectResult>(`/api/tools/chord-detect${qs}`, fd);
    },
    pitchTempo: (file: File, pitchSemitones: number, tempoFactor: number, formantPreserved: boolean = true, transientPreservation: number = 0) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("pitch_semitones", String(pitchSemitones));
      fd.append("tempo_factor", String(tempoFactor));
      fd.append("formant_preserved", String(formantPreserved));
      fd.append("transient_preservation", String(transientPreservation));
      return upload<PitchTempoResult>("/api/tools/pitch-tempo", fd);
    },
    lyricTranscribe: (file: File, language: string = "auto", isolateVocals: boolean = false, progressSession: string = "") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("language", language);
      fd.append("isolate_vocals", String(isolateVocals));
      if (progressSession) fd.append("progress_session", progressSession);
      return upload<LyricTranscribeResult>("/api/tools/lyric-transcribe", fd);
    },
    guitarTab: (file: File, tuningKey: string = "standard", separateFirst: boolean = false, analysisMethod: string = "advanced") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tuning_key", tuningKey);
      fd.append("separate_first", separateFirst ? "true" : "false");
      fd.append("analysis_method", analysisMethod);
      return upload<GuitarTabResult>("/api/tools/guitar-tab", fd);
    },
    importGuitarPro: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<GPImportResult>("/api/tools/import-gp", fd);
    },
    exportGuitarPro: async (notes: TabNote[], tuningKey: string, title: string, tempo: number = 120) => {
      const res = await fetchWithRetry(`${API_BASE}/api/tools/export-gp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tuning_key: tuningKey, title, tempo }),
        ...(API_BASE ? {} : { credentials: "include" as const }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.detail || body.error || res.statusText);
      }
      return res.blob();
    },
    searchTabs: (artist: string, title: string, source: string = "songsterr") =>
      request<TabSearchResult>("/api/tools/search-tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, title, source }),
      }),
    submitFeedback: (feedback: FeedbackRequest) =>
      request<CalibrationResponse>("/api/tools/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      }),
    getCalibration: (storeId: string = "default") =>
      request<CalibrationResponse>(`/api/tools/calibration?store_id=${storeId}`),
    midiExport: (notes: { pitch: number; velocity: number; start_time: number; end_time: number }[], tempo: number = 120) =>
      request<{ ok: boolean; filename: string; url: string }>("/api/tools/midi-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tempo }),
      }),
    voiceClean: (file: File, noiseReduction: number = 0.7, method: string = "noisereduce", stationary: boolean = true) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("noise_reduction", String(noiseReduction));
      fd.append("method", method);
      fd.append("stationary", String(stationary));
      return upload<VoiceCleanResult>("/api/tools/voice-clean", fd);
    },
    leadBackSplit: (file: File, method: string = "auto", lyricsText: string = "", stereoAware: boolean = true) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("method", method);
      fd.append("lyrics_text", lyricsText);
      fd.append("stereo_aware", String(stereoAware));
      return upload<LeadBackResult>("/api/tools/lead-back-split", fd);
    },
    voiceChange: (file: File, semitones: number = 0, formantShift: number = 0, method: string = "auto") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("semitones", String(semitones));
      fd.append("formant_shift", String(formantShift));
      fd.append("method", method);
      return upload<VoiceChangeResult>("/api/tools/voice-change", fd);
    },
    dereverb: (file: File, strength: number = 0.7, method: string = "wpe") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("strength", String(strength));
      fd.append("method", method);
      return upload<DereverbResult>("/api/tools/dereverb", fd);
    },
    searchImages: (artist: string, title: string = "") =>
      request<ImageSearchResult>(`/api/tools/image-search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`),
    searchLyrics: (artist: string, title: string) =>
      request<{ ok: boolean; results: { title: string; artist: string; url: string; source: string }[] }>(`/api/tools/lyrics-search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`),
    correctLyrics: (lines: LyricLineDetailed[], referenceLyrics: string) =>
      request<{ ok: boolean; corrected_lines: LyricLineDetailed[] }>("/api/tools/lyrics-correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, reference_lyrics: referenceLyrics }),
      }),
    lyricsFetch: (url: string, source: string) =>
      request<{ text: string }>(`/api/tools/lyrics-fetch?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source)}`),
    renderCdg: (lines: LyricLineDetailed[], duration: number, title: string) =>
      request<{ ok: boolean; cdg_url: string }>("/api/tools/render-cdg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, duration, title }),
      }),
  },
  connectProgress: (session: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return new WebSocket(`${protocol}//${window.location.host}/api/tools/ws/progress/${session}`);
  },
};

export { ApiError };

export interface TranscribeNote {
  start_time: number;
  end_time: number;
  pitch: number;
  note_name: string;
  velocity: number;
}

export interface TranscribeResult {
  ok: boolean;
  notes: TranscribeNote[];
  duration_secs: number;
  method: string;
  note_count: number;
}

export interface CompressResult {
  ok: boolean;
  original_size: number;
  compressed_size: number;
  reduction_pct: number;
  filename: string;
  url: string;
  sample_rate: number;
  duration_secs: number;
  channels: number;
}

interface YouTubeResult {
  ok: boolean;
  title: string;
  artist: string;
  filename: string;
  url: string;
  duration_secs: number;
  thumbnail: string;
}

interface PitchPoint {
  time: number;
  midi: number;
}

interface VocalScoreResult {
  ok: boolean;
  score: number;
  max_score: number;
  grade: string;
  ref_pitch: PitchPoint[];
  user_pitch: PitchPoint[];
  ref_duration: number;
  user_duration: number;
  total_frames: number;
  matched_frames: number;
  pitch_accuracy?: {
    cents_mad: number;
    cents_std: number;
    score: number;
    in_tune_pct: number;
  } | null;
  stability?: {
    f0_variance_cents: number;
    vibrato_rate_hz: number;
    score: number;
  } | null;
  timing?: {
    dtw_cost: number;
    duration_ratio: number;
    score: number;
  } | null;
  dynamics?: {
    rms_correlation: number;
    dynamic_range_match: number;
    score: number;
  } | null;
}

interface VocalPrepResult {
  ok: boolean;
  job_id: string;
  status: string;
  pitch_data: PitchPoint[];
  vocals_url: string;
  backing_url: string;
  instrumental_url: string;
  duration_secs: number;
}

export interface VocalRemoveResult {
  ok: boolean;
  job_id: string;
  instrumental_url: string;
  vocals_url: string;
  filename: string;
  duration_secs: number;
}

export interface ChordEvent {
  start_time: number;
  end_time: number;
  chord: string;
  notes: string;
  confidence: number;
}

export interface ChordDetectResult {
  ok: boolean;
  chords: ChordEvent[];
  duration_secs: number;
  chord_count: number;
  method?: string;
}

export interface PitchTempoResult {
  ok: boolean;
  filename: string;
  url: string;
  duration_secs: number;
  original_bpm: number;
  adjusted_bpm: number;
  engine: string;
  formant_preserved: boolean;
}

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface LyricWord {
  word: string;
  start: number;
  end: number;
}

export interface LyricLineDetailed {
  start: number;
  end: number;
  words: LyricWord[];
}

export interface LyricTranscribeResult {
  ok: boolean;
  status: string;
  lyrics: LyricLine[];
  lines: LyricLineDetailed[];
  full_text: string;
  language: string;
  lang_code: string;
  error: string;
  txt_path: string;
  lrc_path: string;
  srt_path: string;
  json_path: string;
  duration_secs: number;
  word_count: number;
}

export interface TabNote {
  start_time: number;
  end_time: number;
  pitch: number;
  note_name: string;
  string: number;
  string_name: string;
  fret: number;
  velocity: number;
}

export interface GuitarTabResult {
  ok: boolean;
  notes: TabNote[];
  duration_secs: number;
  note_count: number;
  tuning: string[];
  tuning_key: string;
  method?: string;
}

export interface FeedbackRequest {
  store_id: string;
  tool: string;
  action: "corrected" | "added" | "removed" | "corrected_chord";
  note_pitch?: number;
  note_name?: string;
  original_pitch?: number;
  original_note?: string;
  original_chord?: string;
  corrected_chord?: string;
  detail: string;
}

export interface CalibrationResponse {
  ok: boolean;
  store_id: string;
  total_corrections: number;
  accuracy: number;
  params: Record<string, number>;
  all_stores: Record<string, { total_corrections: number; accuracy: number; params: Record<string, number>; chord_corrections?: number; chord_accuracy?: number }>;
  chord_corrections: number;
  chord_accuracy: number;
}

export interface VoiceCleanResult {
  ok: boolean;
  url: string;
  filename: string;
  duration: number;
  noise_frames: number;
  method: string;
  reduction_db: number;
}

export interface LeadBackResult {
  ok: boolean;
  lead_url: string;
  backing_url: string;
  instrumental_url: string;
  lead_ratio: number;
  duration: number;
  method: string;
}

export interface VoiceChangeResult {
  ok: boolean;
  url: string;
  filename: string;
  duration: number;
  semitones: number;
  formant_shift: number;
  method: string;
}

export interface DereverbResult {
  ok: boolean;
  url: string;
  filename: string;
  duration: number;
  strength: number;
  method: string;
  hp_cutoff_hz: number;
  detected_f0_hz: number;
}

export interface GPImportResult {
  ok: boolean;
  notes: TabNote[];
  note_count: number;
  title: string;
  artist: string;
  track_name: string;
}

export interface TabSearchResult {
  ok: boolean;
  results: { id: string; title: string; artist: string; source: string; url: string; has_tab: boolean }[];
  source: string;
}

export interface ImageSearchResult {
  ok: boolean;
  artist_image: string;
  song_image: string;
}
