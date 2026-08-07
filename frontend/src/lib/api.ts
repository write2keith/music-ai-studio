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

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
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
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
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
    compress: (file: File, sampleRate: number, bitDepth: number, mono: boolean) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sample_rate", String(sampleRate));
      fd.append("bit_depth", String(bitDepth));
      fd.append("to_mono", String(mono));
      return upload<CompressResult>("/api/tools/compress", fd);
    },
    youtube: (url: string) =>
      request<YouTubeResult>("/api/tools/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }),
  },
};

export { ApiError };

interface TranscribeNote {
  start_time: number;
  end_time: number;
  pitch: number;
  note_name: string;
  velocity: number;
}

interface TranscribeResult {
  ok: boolean;
  notes: TranscribeNote[];
  duration_secs: number;
  method: string;
  note_count: number;
}

interface CompressResult {
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
