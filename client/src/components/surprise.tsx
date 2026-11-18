import { titleHref } from "@/components/world";
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Dices, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

/** Picks a random popular title that has an official English edition. */
export function SurpriseButton({ type, className = "" }: { type?: string; className?: string }) {
  const [, nav] = useLocation();
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(0);
  const go = async () => {
    setBusy(true); setSpin((s) => s + 1);
    try {
      const r = await apiRequest("GET", `/api/world/random${type ? `?type=${type}` : ""}`);
      const d = await r.json();
      if (d?.id) nav(titleHref(d));
    } catch {} finally { setBusy(false); }
  };
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={go} disabled={busy} data-testid="button-surprise"
      className={`glass-btn inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition hover:border-primary/60 ${className}`}>
      <motion.span animate={{ rotate: spin * 360 }} transition={{ type: "spring", stiffness: 120, damping: 12 }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Dices className="h-4 w-4 text-primary" />}
      </motion.span>
      Surprise me
    </motion.button>
  );
}
