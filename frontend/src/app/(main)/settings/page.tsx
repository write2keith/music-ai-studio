"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Cloud,
  HardDrive,
  Zap,
  Check,
  Settings2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Provider {
  id: string;
  name: string;
  description: string;
  type: "cloud" | "local";
  model: string;
  needs_token: boolean;
  free_tier: boolean;
  url?: string;
  needs_hardware?: string;
}

interface GenSettings {
  current_provider: string;
  current_model: string;
  effective_mode: string;
  cloud_available: boolean;
  local_available: boolean;
  gpu_available: boolean;
  gpu_name: string;
  providers: Provider[];
  hf_token_configured: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<GenSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [hfToken, setHfToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/generation", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setSettings(d);
        setSelectedProvider(d.current_provider);
      });
  }, []);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: selectedProvider,
          model_id: "",
          hf_token: hfToken,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: "success", text: "Settings saved" });
        setSettings((prev) =>
          prev
            ? { ...prev, current_provider: data.provider, hf_token_configured: data.token_set }
            : prev
        );
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error" });
    }
    setSaving(false);
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 text-daw-text-dim animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-daw-text flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-daw-text-muted" />
          AI Generation Settings
        </h2>
        <p className="text-xs text-daw-text-muted mt-1">
          Choose how music is generated -- locally on your GPU or via cloud APIs.
        </p>
      </div>

      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-3 rounded-lg text-sm flex items-center gap-2",
            feedback.type === "success"
              ? "bg-daw-green/10 border border-daw-green/20 text-daw-green"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          )}
        >
          {feedback.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {feedback.text}
        </motion.div>
      )}

      {/* Status Bar */}
      <div className="glass rounded-xl p-4 grid grid-cols-3 gap-4">
        {[
          {
            label: "Active Mode",
            value: settings.effective_mode === "cloud" ? "Cloud API" : "Local GPU",
            icon: settings.effective_mode === "cloud" ? Cloud : HardDrive,
            color: settings.effective_mode === "cloud" ? "text-daw-cyan" : "text-daw-green",
          },
          {
            label: "GPU",
            value: settings.gpu_available ? settings.gpu_name : "Not detected",
            icon: Cpu,
            color: settings.gpu_available ? "text-daw-green" : "text-daw-text-dim",
          },
          {
            label: "Model",
            value: settings.current_model.split("/").pop() || "musicgen-small",
            icon: Zap,
            color: "text-daw-accent",
          },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
            <p className="text-[10px] text-daw-text-dim uppercase tracking-wider">{s.label}</p>
            <p className="text-xs font-medium text-daw-text mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Provider Selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-daw-text">AI Providers</h3>

        {/* Auto */}
        <ProviderCard
          id="auto"
          name="Auto-detect"
          description="Use cloud API if torch is not installed, local GPU otherwise"
          icon={Zap}
          tags={["recommended"]}
          selected={selectedProvider === "auto"}
          onSelect={() => setSelectedProvider("auto")}
        />

        {settings.providers.map((p) => (
          <ProviderCard
            key={p.id}
            id={p.id}
            name={p.name}
            description={p.description}
            icon={p.type === "cloud" ? Cloud : HardDrive}
            tags={[
              p.type === "cloud" ? "cloud" : "local",
              ...(p.free_tier ? ["free"] : []),
              ...(p.needs_hardware ? [p.needs_hardware.split(" ").slice(0, 2).join(" ")] : []),
            ]}
            selected={selectedProvider === p.id}
            onSelect={() => setSelectedProvider(p.id)}
            isAvailable={p.type === "cloud" ? true : settings.local_available}
          />
        ))}
      </div>

      {/* Token Input */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-daw-text">HuggingFace Token</h3>
            <p className="text-xs text-daw-text-muted">
              Required for cloud generation. Free at huggingface.co/settings/tokens.
            </p>
          </div>
          {settings.hf_token_configured && (
            <Badge variant="green">Configured</Badge>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              placeholder={settings.hf_token_configured ? "Token saved · enter new to change" : "hf_..."}
              className="w-full bg-daw-surface-3 border border-daw-border rounded-lg pl-3.5 pr-9 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-daw-text-dim hover:text-daw-text-muted transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-daw-text-muted hover:text-daw-accent transition-colors shrink-0 self-center"
          >
            Get token <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

function ProviderCard({
  id,
  name,
  description,
  icon: Icon,
  tags,
  selected,
  onSelect,
  isAvailable = true,
}: {
  id: string;
  name: string;
  description: string;
  icon: any;
  tags: string[];
  selected: boolean;
  onSelect: () => void;
  isAvailable?: boolean;
}) {
  return (
    <button
      onClick={isAvailable ? onSelect : undefined}
      disabled={!isAvailable}
      className={cn(
        "w-full text-left glass rounded-xl p-4 transition-all border cursor-pointer",
        selected
          ? "border-daw-accent/50 bg-daw-accent/5 shadow-glow-sm"
          : "border-daw-border hover:border-daw-border-hover",
        !isAvailable && "opacity-40 cursor-not-allowed"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            selected ? "bg-daw-accent/20" : "bg-daw-surface-3"
          )}
        >
          <Icon className={cn("w-4 h-4", selected ? "text-daw-accent" : "text-daw-text-muted")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-daw-text">{name}</p>
            {tags.map((t) => (
              <Badge key={t} variant={t === "recommended" ? "accent" : t === "free" ? "green" : "default"}>
                {t}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-daw-text-muted">{description}</p>
        </div>
        <div
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-colors",
            selected
              ? "border-daw-accent bg-daw-accent"
              : "border-daw-border"
          )}
        >
          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}
