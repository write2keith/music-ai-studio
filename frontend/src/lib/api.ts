import type {
  HealthInfo,
  AudioResult,
  StemResult,
  GenerationJob,
  EffectsParams,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
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

  generate: (prompt: string, duration: number = 10) => {
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("duration", String(duration));
    return upload<GenerationJob>("/api/generate", fd);
  },

  getGenerationStatus: (jobId: string) =>
    request<GenerationJob>(`/api/generate/${jobId}`),

  separate: (file: File, model: string = "htdemucs") => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", model);
    return upload<StemResult>("/api/separate", fd);
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
};

export { ApiError };
