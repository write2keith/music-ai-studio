"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Zap, ArrowUpRight, Crown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

interface Plan {
  id: string;
  name: string;
  price: string;
  credits: number;
  credits_label: string;
  featured: boolean;
}

export function CreditWidget() {
  const { user, isAuthenticated, refresh } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stripeAvailable, setStripeAvailable] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/plans", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans);
        setStripeAvailable(data.stripe_available);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (showModal) fetchPlans();
  }, [showModal, fetchPlans]);

  async function handleCheckout(planId: string) {
    if (planId === "free") return;
    setIsCheckingOut(true);
    setActivePlanId(planId);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan_id: planId,
          success_url: window.location.origin + "/studio?checkout=success",
          cancel_url: window.location.origin + "/studio?checkout=cancel",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Checkout failed");

      if (data.url) {
        window.location.href = data.url;
      } else {
        await refresh();
        setShowModal(false);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
    } finally {
      setIsCheckingOut(false);
      setActivePlanId(null);
    }
  }

  const credits = user?.credits ?? 0;
  const currentPlan = plans.find((p) => p.credits === -1)?.name || "Free";

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-daw-surface-3 transition-colors group"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-daw-cyan/20 to-daw-accent/20 flex items-center justify-center">
          <Coins className="w-4 h-4 text-daw-cyan" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-xs text-daw-text-muted">Credits</p>
          <p className="text-sm font-bold text-daw-text tracking-tight tabular-nums">
            {credits}
          </p>
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-daw-text-dim group-hover:text-daw-text-muted transition-colors" />
      </button>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-daw-border">
                <h2 className="text-lg font-bold text-daw-text">Credits & Plans</h2>
                <p className="text-sm text-daw-text-muted mt-1">
                  1 credit = 1 AI generation. Credits refresh monthly on paid plans.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-daw-surface/50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-daw-text">Current Balance</p>
                    <p className="text-xs text-daw-text-muted">
                      {currentPlan} plan{user?.credits && user.credits > 10 ? " · upgraded" : ""}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-daw-cyan tabular-nums">
                    {credits}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={isCheckingOut}
                      className={cn(
                        "rounded-xl p-4 text-center transition-all border relative",
                        plan.featured
                          ? "border-daw-accent/40 bg-daw-accent/5 hover:bg-daw-accent/10"
                          : "border-daw-border bg-daw-surface hover:bg-daw-surface-3"
                      )}
                    >
                      {plan.featured && (
                        <Badge variant="accent" className="mb-2">
                          <Crown className="w-2.5 h-2.5" /> Best
                        </Badge>
                      )}
                      {isCheckingOut && activePlanId === plan.id && (
                        <Loader2 className="absolute top-2 right-2 w-3 h-3 animate-spin text-daw-accent" />
                      )}
                      <p className="text-sm font-bold text-daw-text">{plan.name}</p>
                      <p className="text-lg font-bold text-daw-text mt-0.5">{plan.price}</p>
                      <p className="text-[10px] text-daw-text-dim">{plan.credits_label}</p>
                    </button>
                  ))}
                </div>

                {!stripeAvailable && (
                  <p className="text-xs text-center text-daw-text-dim">
                    Test mode: selecting a plan instantly grants credits. Configure
                    Stripe keys for real payments.
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-daw-border flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
