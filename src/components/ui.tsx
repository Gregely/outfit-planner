import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SOURCE_LABELS, STATUS_SHORT, type GarmentStatus, type OutfitSource } from "@/lib/domain";
import { inkFor } from "@/lib/colours";
import { SparkIcon, WandIcon, HangerIcon } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft border border-ink",
  accent: "bg-accent text-white hover:bg-[#682421] border border-accent",
  secondary: "bg-card text-ink border border-line-strong hover:border-ink-soft hover:bg-white",
  ghost: "text-ink-soft hover:bg-paper-deep border border-transparent",
  danger: "bg-card text-danger border border-danger/40 hover:bg-danger hover:text-white",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-55",
        // touch screens get at least 44px (md) / 36px (sm) targets
        size === "sm" ? "px-3 py-1.5 text-xs pointer-coarse:min-h-9" : "px-4 py-2 text-sm pointer-coarse:min-h-11",
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: Variant; size?: "sm" | "md"; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition",
        // touch screens get at least 44px (md) / 36px (sm) targets
        size === "sm" ? "px-3 py-1.5 text-xs pointer-coarse:min-h-9" : "px-4 py-2 text-sm pointer-coarse:min-h-11",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({ eyebrow, title, children, description }: { eyebrow?: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export function Section({ title, eyebrow, action, children, className }: { title?: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mb-8", className)}>
      {title || action ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="text-xl font-medium">{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "moss" | "gold" | "sky" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-paper-deep text-ink-soft",
    accent: "bg-accent-soft text-accent",
    moss: "bg-moss-soft text-moss",
    gold: "bg-gold-soft text-[#7a5d26]",
    sky: "bg-sky-soft text-sky",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium", tones[tone], className)}>{children}</span>;
}

/** Where an outfit came from; AI outfits name the provider and model that produced them. */
export function SourceBadge({ source, generatedBy }: { source: OutfitSource; generatedBy?: { providerLabel: string; model: string } | null }) {
  if (source === "ai")
    return (
      <Badge tone="accent" className="max-w-full">
        <SparkIcon size={12} />
        <span className="truncate" title={generatedBy ? `Generated by ${generatedBy.providerLabel} (${generatedBy.model}) and checked against your wardrobe` : undefined}>
          {generatedBy ? `${generatedBy.providerLabel} · ${generatedBy.model}` : SOURCE_LABELS.ai}
        </span>
      </Badge>
    );
  if (source === "rules")
    return (
      <Badge tone="sky">
        <WandIcon size={12} /> {SOURCE_LABELS.rules}
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <HangerIcon size={12} /> {SOURCE_LABELS.manual}
    </Badge>
  );
}

const STATUS_TONE: Record<GarmentStatus, "moss" | "gold" | "sky" | "accent" | "neutral" | "danger"> = {
  clean: "moss",
  worn: "gold",
  in_wash: "sky",
  drying: "sky",
  awaiting_ironing: "gold",
  awaiting_repair: "danger",
  packed: "neutral",
  unavailable: "neutral",
  retired: "neutral",
};

export function StatusBadge({ status }: { status: GarmentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_SHORT[status]}</Badge>;
}

export function Swatch({ hex, name, size = 14 }: { hex: string; name?: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-block shrink-0 rounded-full border border-black/10"
      style={{ width: size, height: size, background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#999" }}
    />
  );
}

export function ColourChip({ name, hex }: { name: string; hex: string }) {
  const bg = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#999";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs" style={{ background: bg, color: inkFor(bg) }}>
      {name}
    </span>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-muted">{icon ?? <HangerIcon size={36} />}</div>
      <h3 className="text-xl font-medium">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-sky/30 bg-sky-soft/60 text-sky",
    warning: "border-gold/40 bg-gold-soft/70 text-[#6b5122]",
    error: "border-danger/30 bg-danger/5 text-danger",
    success: "border-moss/30 bg-moss-soft/70 text-moss",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-3.5 py-2.5 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-paper-deep", className)} />;
}
