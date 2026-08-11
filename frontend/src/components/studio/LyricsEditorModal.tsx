"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface LyricsEditorModalProps {
  isOpen: boolean;
  initialLrc: string;
  title: string;
  artist: string;
  onSave: (lrc: string) => void;
  onClose: () => void;
}

export default function LyricsEditorModal({
  isOpen,
  initialLrc,
  title,
  artist,
  onSave,
  onClose,
}: LyricsEditorModalProps) {
  const [text, setText] = useState(initialLrc);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await onSave(text);
      setStatus({ type: "success", message: "Lyrics saved successfully" });
      setTimeout(() => onClose(), 800);
    } catch {
      setStatus({ type: "error", message: "Failed to save lyrics" });
    } finally {
      setSaving(false);
    }
  };

  const applyFixes = (type: string) => {
    switch (type) {
      case "timestamps":
        setText(text.replace(new RegExp("\\[(\\d{1,2}):(\\d{1,2})\\.(\\d{1,2})\\]", "g"), (match, m, s, ms) => {
          const mm = String(m).padStart(2, "0");
          const ss = String(s).padStart(2, "0");
          const mss = String(ms).padStart(2, "0");
          return `[${mm}:${ss}.${mss}]`;
        }));
        break;
      case "sort":
        const lines = text.split("\n").filter((l) => l.trim());
        const parsed = lines.map((line) => {
          const match = line.match(/^\[(\d+):(\d+)\.(\d+)\]\s*(.+)$/);
          if (!match) return { line, seconds: Infinity };
          const secs = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
          return { line, seconds: secs };
        });
        parsed.sort((a, b) => a.seconds - b.seconds);
        setText(parsed.map((p) => p.line).join("\n"));
        break;
      case "trim":
        setText(text.split("\n").filter((l) => l.trim()).join("\n"));
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-md flex items-center justify-center p-5">
      <div className="w-full max-w-[800px] bg-[#181825] border border-cyan-400/30 rounded-2xl flex flex-col max-h-[90vh] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="p-6 border-b border-daw-border flex justify-between items-center">
          <div>
            <h3 className="m-0 text-xl font-extrabold text-daw-text">Lyrics Editor (LRC)</h3>
            <span className="text-sm text-daw-text-muted">{title} - {artist}</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-daw-border text-daw-text-dim hover:text-daw-text transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
          <div className="bg-violet-500/10 border border-violet-400/30 p-3 px-4 rounded-lg text-xs text-daw-text-muted">
            <span className="font-bold text-white">LRC Format:</span>{" "}
            Each line uses <strong>[Minutes:Seconds.Fraction] Lyric Text</strong> format.{" "}
            Example: <code className="bg-black/30 px-1 py-0.5 rounded text-cyan-400">[01:23.45] Hello World</code>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              { key: "timestamps", label: "Fix Timestamps" },
              { key: "sort", label: "Sort by Time" },
              { key: "trim", label: "Remove Blanks" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => applyFixes(key)}
                className="text-[11px] px-2 py-1 rounded border border-daw-border text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-2 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`[00:05.00] Intro instrumental...\n[00:15.30] First line of the song...\n[00:20.45] Second line continues...`}
            className="flex-1 min-h-[350px] bg-black/20 border border-daw-border rounded-lg p-4 text-white font-mono text-sm leading-relaxed resize-y outline-none focus:border-cyan-400/50 transition-colors"
          />

          {status && (
            <div className={cn(
              "p-3 rounded-lg text-sm",
              status.type === "success" ? "bg-emerald-500/10 border border-emerald-400/30 text-emerald-300" : "bg-red-500/10 border border-red-400/30 text-red-300",
            )}>
              {status.message}
            </div>
          )}
        </div>

        <div className="p-5 px-6 border-t border-daw-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-daw-border text-daw-text-dim hover:text-daw-text transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
