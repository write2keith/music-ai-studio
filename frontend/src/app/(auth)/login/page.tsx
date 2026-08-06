"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Music, Sparkles, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isRegister) {
        await register(email, name, password);
      } else {
        await login(email, password);
      }
      router.push("/studio");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-daw-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-daw-accent/5 via-transparent to-transparent" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-daw-accent/10 border border-daw-accent/20 mb-4">
            <Music className="w-7 h-7 text-daw-accent" />
          </div>
          <h1 className="text-2xl font-bold text-daw-text tracking-tight">
            Music AI Studio
          </h1>
          <p className="text-sm text-daw-text-muted mt-1">
            Sign in to your studio workspace
          </p>
        </div>

        <div className="glass rounded-xl border border-daw-border p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-daw-text-muted mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full bg-daw-surface-3 border border-daw-border rounded-lg px-3.5 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-daw-text-muted mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-daw-surface-3 border border-daw-border rounded-lg px-3.5 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-daw-text-muted mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                className="w-full bg-daw-surface-3 border border-daw-border rounded-lg px-3.5 py-2.5 text-sm text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="daw-button daw-button-primary w-full justify-center py-2.5 text-sm"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isRegister ? "Create Account" : "Sign In"}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
              className="text-sm text-daw-text-muted hover:text-daw-accent transition-colors"
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
