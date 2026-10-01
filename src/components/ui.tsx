import { CircleHelp, Minus, Sparkles } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { copy } from "@/copy/en";
import type { Tier } from "@/evidence/recommend";

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "border border-line bg-card text-fg hover:bg-accent-soft",
    ghost: "text-muted hover:text-fg",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Card({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={`rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6 ${className}`}>{children}</Tag>;
}

const TIER_STYLE: Record<Tier, string> = {
  "no-gain": "bg-info-soft text-info",
  promising: "bg-accent-soft text-accent",
  unclear: "bg-warn-soft text-warn",
};
const TIER_ICON: Record<Tier, ReactNode> = {
  "no-gain": <Minus aria-hidden size={16} />,
  promising: <Sparkles aria-hidden size={16} />,
  unclear: <CircleHelp aria-hidden size={16} />,
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span title={copy.tiers[tier].why} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${TIER_STYLE[tier]}`}>
      {TIER_ICON[tier]}
      {copy.tiers[tier].label}
    </span>
  );
}

export function Tip({ label, tip }: { label: string; tip: string }) {
  return (
    <abbr title={tip} className="cursor-help underline decoration-dotted underline-offset-4">
      {label}
    </abbr>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-3 max-w-2xl text-lg text-muted">{sub}</p>}
    </header>
  );
}
