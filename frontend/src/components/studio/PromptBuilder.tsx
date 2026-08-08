"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wand2,
  Sparkles,
  Music2,
  Gauge,
  SlidersHorizontal,
  Clock,
  Disc3,
  Play,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

const genres = [
  "Lo-Fi", "Trap", "House", "Drill", "Jazz", "Ambient",
  "R&B", "Rock", "Pop", "Synthwave", "Funk", "Classical",
];

const moods = [
  "Chill", "Dark", "Energetic", "Melancholic", "Happy",
  "Aggressive", "Dreamy", "Tense", "Uplifting", "Mysterious",
];

const keys = ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"];
const bpms = ["60-80", "80-100", "100-120", "120-140", "140-160", "160+"];
const structures = ["Intro→Verse→Chorus", "Loop (8 bars)", "ABA", "Build-up→Drop", "Standard Pop"];

export function PromptBuilder({ onGenerate }: { onGenerate?: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [genre, setGenre] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [bpm, setBpm] = useState<string | null>(null);
  const [structure, setStructure] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState("");
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    setEnhancing(true);
    setEnhancedPrompt(null);
    try {
      const result = await api.enhancePrompt(prompt.trim(), {
        genre: genre || undefined,
        mood: mood || undefined,
        key: key || undefined,
        bpm: bpm ? parseInt(bpm.split("-")[0] || "120", 10) : undefined,
        structure: structure || undefined,
      });
      setEnhancedPrompt(result.enhanced_prompt);
      toast("success", "Prompt enhanced", "AI has enriched your prompt with professional details.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast("error", "Enhancement failed", msg || "Please try again.");
    } finally {
      setEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast("error", "Enter a prompt", "Describe the music you want to create.");
      return;
    }
    setGenerating(true);
    setGeneratingStatus("Submitting...");

    try {
      const bpmValue = bpm ? parseInt(bpm.split("-")[0] || "120", 10) : undefined;
      const job = await api.generate(prompt.trim(), duration, {
        genre: genre || undefined,
        mood: mood || undefined,
        key: key || undefined,
        bpm: bpmValue,
        structure: structure || undefined,
      });

      setGeneratingStatus("Generating audio...");

      const MAX_POLLS = 300; // 10 minutes at 2s intervals
      let attempts = 0;

      const poll = async () => {
        attempts++;
        try {
          const jobResult = await api.getGenerationStatus(job.job_id);
          if (jobResult.status === "completed" && jobResult.result) {
            setGenerating(false);
            setGeneratingStatus("");
            toast("success", "Generation complete", "Your track is ready.");
            setPrompt("");
            setEnhancedPrompt(null);
            onGenerate?.();
          } else if (jobResult.status === "failed") {
            setGenerating(false);
            setGeneratingStatus("");
            toast("error", "Generation failed", jobResult.error || "Unknown error");
          } else if (attempts >= MAX_POLLS) {
            setGenerating(false);
            setGeneratingStatus("");
            toast("error", "Generation timed out", "Generation is taking too long. The job may still be running on the server.");
          } else {
            const elapsed = Math.round((attempts * 2) / 60);
            setGeneratingStatus(`Generating audio... ${elapsed > 0 ? `(${elapsed}m elapsed)` : `(${jobResult.status})`}`);
            setTimeout(poll, 2000);
          }
        } catch {
          if (attempts >= MAX_POLLS) {
            setGenerating(false);
            setGeneratingStatus("");
            toast("error", "Generation timed out", "Unable to check status. The job may still be running on the server.");
          } else {
            setTimeout(poll, 2000);
          }
        }
      };
      setTimeout(poll, 1500);
    } catch (err) {
      setGenerating(false);
      setGeneratingStatus("");
      const msg = err instanceof Error ? err.message : String(err);
      toast("error", "Generation failed", msg || "Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-daw-text flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-daw-accent" />
            Prompt Builder
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEnhance}
            disabled={!prompt.trim() || enhancing}
            className="text-xs"
          >
            {enhancing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Enhance with AI
          </Button>
        </div>

        <div className="prompt-glow rounded-xl overflow-hidden">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your track... e.g. 'A lo-fi beat with warm piano chords, soft drums, and vinyl crackle for studying'"
            rows={3}
            className="w-full bg-daw-surface-2 border border-daw-border rounded-xl p-4 text-sm text-daw-text placeholder-daw-text-dim resize-none focus:outline-none transition-colors"
          />
        </div>

        {enhancedPrompt && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-daw-accent/5 border border-daw-accent/20 cursor-pointer hover:bg-daw-accent/10 transition-colors"
            onClick={() => {
              setPrompt(enhancedPrompt);
              setEnhancedPrompt(null);
            }}
            title="Click to apply this enhanced prompt"
          >
            <Sparkles className="w-3.5 h-3.5 text-daw-accent mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-daw-text-muted">{enhancedPrompt}</p>
              <p className="text-[10px] text-daw-accent mt-0.5">Click to use this prompt</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Parameter toggles */}
      <div className="space-y-4">
        <ParamGroup
          icon={<Music2 className="w-3.5 h-3.5" />}
          label="Genre"
          options={genres}
          selected={genre}
          onSelect={setGenre}
          color="accent"
        />
        <ParamGroup
          icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          label="Mood"
          options={moods}
          selected={mood}
          onSelect={setMood}
          color="cyan"
        />
        <ParamGroup
          icon={<Disc3 className="w-3.5 h-3.5" />}
          label="Key"
          options={keys}
          selected={key}
          onSelect={setKey}
          color="green"
        />
        <ParamGroup
          icon={<Gauge className="w-3.5 h-3.5" />}
          label="BPM"
          options={bpms}
          selected={bpm}
          onSelect={setBpm}
          color="orange"
        />
        <ParamGroup
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Structure"
          options={structures}
          selected={structure}
          onSelect={setStructure}
          color="pink"
        />
      </div>

      {/* Duration */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-daw-text-dim mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Duration
        </p>
        <div className="bg-daw-surface rounded-lg p-3 space-y-2">
          <input
            type="range"
            min={5}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-daw-accent h-1.5"
          />
          <div className="flex justify-between text-[10px] text-daw-text-dim">
            <span>5s</span>
            <span className="text-daw-text-muted font-medium">{duration}s</span>
            <span>30s</span>
          </div>
        </div>
      </div>

      {/* Generate button */}
      <Button
        size="lg"
        className="w-full"
        onClick={handleGenerate}
        disabled={!prompt.trim() || generating}
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {generatingStatus || "Generating..."}
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Generate Track
          </>
        )}
      </Button>
    </div>
  );
}

function ParamGroup({
  icon,
  label,
  options,
  selected,
  onSelect,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
  color: "accent" | "cyan" | "green" | "orange" | "pink";
}) {
  const borderColors = {
    accent: "border-daw-accent/30 bg-daw-accent/10 text-daw-accent",
    cyan: "border-daw-cyan/30 bg-daw-cyan/10 text-daw-cyan",
    green: "border-daw-green/30 bg-daw-green/10 text-daw-green",
    orange: "border-daw-orange/30 bg-daw-orange/10 text-daw-orange",
    pink: "border-daw-pink/30 bg-daw-pink/10 text-daw-pink",
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-daw-text-dim mb-2 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
            !selected
              ? "bg-daw-surface-3 text-daw-text border border-daw-border-hover"
              : "bg-daw-surface text-daw-text-dim border border-transparent hover:bg-daw-surface-3"
          )}
        >
          Any
        </button>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(selected === opt ? null : opt)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all",
              selected === opt
                ? borderColors[color]
                : "bg-daw-surface text-daw-text-dim border-transparent hover:bg-daw-surface-3 hover:border-daw-border"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
