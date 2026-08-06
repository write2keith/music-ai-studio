export interface AudioResult {
  url: string;
  filename: string;
  duration?: number;
}

export interface StemResult {
  model: string;
  stems: Record<string, string>;
}

export interface GenerationJob {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  project_id?: string;
  result?: AudioResult;
  error?: string;
  created_at: string;
  updated_at?: string;
}

export interface HealthInfo {
  status: string;
  service: string;
  gpu_available: boolean;
  gpu_name?: string;
  environment?: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  prompt: string;
  duration: number;
  url: string;
  filename: string;
  genre: string;
  mood: string;
  key: string;
  bpm: number;
  structure?: string;
  status: "completed" | "processing" | "draft";
  is_published: boolean;
  has_stems: boolean;
  play_count: number;
  likes: number;
  exports: string[];
  created_at: string;
}

export interface CommunityPost {
  id: string;
  title: string;
  artist: string;
  artist_avatar: string;
  prompt: string;
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  duration: number;
  url: string;
  likes: number;
  forks: number;
  created_at: string;
}

export type EditAction =
  | "trim"
  | "fade"
  | "volume"
  | "normalize"
  | "speed"
  | "merge"
  | "effects";

export interface EffectsParams {
  reverb_room_size: number;
  reverb_wet: number;
  delay_seconds: number;
  delay_feedback: number;
  delay_mix: number;
  eq_low_gain: number;
  eq_mid_gain: number;
  eq_high_gain: number;
  compressor_threshold: number;
  compressor_ratio: number;
  gain_db: number;
  speed_factor: number;
}
