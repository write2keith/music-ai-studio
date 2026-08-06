"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

export function PromptBuilder() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [bpm, setBpm] = useState<string | null>(null);
  const [structure, setStructure] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    setEnhancing(true);
    try {
      // Simulate LLM enhancement
      await new Promise((r) => setTimeout(r, 1500));
      const tags = [genre, mood, key, bpm ? `${bpm} BPM` : null, structure].filter(Boolean);
      const enhanced = `${prompt} — ${tags.join(", ")} — professional production, high quality mix, mastered`;
      setEnhancedPrompt(enhanced);
      setPrompt(enhanced);
      toast("success", "Prompt enhanced", "AI has enriched your prompt with professional details.");
    } catch {
      toast("error", "Enhancement failed", "Please try again.");
    } finally {
      setEnhancing(false);
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast("error", "Enter a prompt", "Describe the music you want to create.");
      return;
    }
    toast("info", "Generating...", "Your track is being created. This may take a moment.");
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
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-daw-accent/5 border border-daw-accent/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-daw-accent mt-0.5 shrink-0" />
            <p className="text-xs text-daw-text-muted">{enhancedPrompt}</p>
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

      {/* Generate button */}
      <Button
        size="lg"
        className="w-full"
        onClick={handleGenerate}
        disabled={!prompt.trim()}
      >
        <Play className="w-4 h-4" />
        Generate Track
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
