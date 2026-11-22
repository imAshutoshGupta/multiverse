"use client";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { formatINR } from "@/lib/availability";
import { PAY_LABEL, type PaySummary, type PayState } from "@/lib/payments";
import type { BookingStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-portal text-on-portal hover:bg-portal-strong",
  ghost: "text-muted hover:text-ink hover:bg-tint/5",
  outline: "border border-line text-ink hover:border-portal/60 hover:bg-tint/5",
  danger: "border border-rose-500/40 text-rose-300 hover:bg-rose-500/10",
  success: "bg-[#25D366] text-[#06210f] hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "outline",
  className,
  ...props
}: ComponentProps<"a"> & { variant?: Variant }) {
  return (
    <a
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

const field =
  "w-full rounded-xl border border-line bg-panel-2 px-3 text-base text-ink sm:text-sm placeholder:text-muted/60 outline-none transition focus:border-portal focus:ring-2 focus:ring-portal/25 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "py-2 min-h-16", className)} {...props} />;
}

/** App-styled dropdown (same API as <select>). */
export { Select } from "./Select";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

export const STATUS_STYLE: Record<BookingStatus, string> = {
  pending: "bg-amber-400/15 text-amber-200 border-amber-400/50",
  confirmed: "bg-portal/20 text-ink border-portal/70",
  arrived: "bg-emerald-400/15 text-emerald-100 border-emerald-400/60",
  completed: "bg-slate-400/10 text-slate-300 border-slate-500/40",
  cancelled: "bg-transparent text-muted line-through border-line",
  no_show: "bg-rose-500/10 text-rose-200 border-rose-500/50",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export const PAY_STYLE: Record<PayState, string> = {
  unpaid: "bg-rose-500/10 text-rose-200 border-rose-500/50",
  advance: "bg-amber-400/10 text-amber-200 border-amber-400/50",
  paid: "bg-emerald-400/10 text-emerald-200 border-emerald-400/50",
  overpaid: "bg-sky-400/10 text-sky-200 border-sky-400/50",
  closed: "bg-transparent text-muted border-line",
};

/** Short payment label: "Not paid", "₹500 adv · ₹700 due", "Paid", "Paid +₹100". */
export function payText(p: PaySummary, compact = false): string {
  switch (p.state) {
    case "unpaid":
      return compact ? `Due ${formatINR(p.due)}` : `Not paid · ${formatINR(p.due)} due`;
    case "advance":
      return compact ? `Adv ${formatINR(p.paid)} · Due ${formatINR(p.due)}` : `${formatINR(p.paid)} advance · ${formatINR(p.due)} due`;
    case "paid":
      return compact ? "Paid" : `Paid ${formatINR(p.paid)}`;
    case "overpaid":
      return `Paid +${formatINR(p.paid - p.total)} extra`;
    case "closed":
      return p.paid > 0 ? `${formatINR(p.paid)} kept` : "";
  }
}

export function PayBadge({ pay, compact, className }: { pay: PaySummary; compact?: boolean; className?: string }) {
  const text = payText(pay, compact);
  if (!text) return null;
  return (
    <span
      title={pay.state === "closed" ? "Cancelled / no-show: money collected and not refunded" : PAY_LABEL[pay.state]}
      className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", PAY_STYLE[pay.state], className)}
    >
      {text}
    </span>
  );
}

/** Accessible modal built on <dialog>. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      // Phones: a bottom sheet (full width, slides up, inner scroll); wider screens: a centred card
      className="sheet m-auto max-h-[92dvh] w-[min(100vw-1.5rem,34rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel p-0 text-ink shadow-2xl open:flex max-sm:mb-0 max-sm:max-h-[94dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3 sm:py-4">
        <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-tint/15 sm:hidden" />
        <h2 className="min-w-0 truncate pt-1 font-display text-lg font-semibold sm:pt-0">{title}</h2>
        <button
          onClick={onClose}
          className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-tint/5 hover:text-ink sm:size-8"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{open && children}</div>
    </dialog>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      {children}
    </p>
  );
}
