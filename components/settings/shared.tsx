"use client";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { refreshCatalog } from "@/app/actions/catalog";
import { Button, cn, ErrorNote } from "@/components/ui";
import { isHex } from "@/lib/brand";
import { supabaseBrowser } from "@/lib/supabase/client";

type DbResult = PromiseLike<{ error: { message: string; code?: string } | null }>;

/** Runs a write, then refreshes the staff page and the cached public page. */
export function useSaver() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => DbResult) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await fn();
    if (error) {
      setSaving(false);
      setError(friendly(error));
      return false;
    }
    await refreshCatalog();
    router.refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    return true;
  }
  return { error, saving, saved, run, setError };
}

function friendly(e: { message: string; code?: string }) {
  if (e.code === "23503") return "This is still in use (for example by stations or bookings), so it can't be deleted. Switch it off instead.";
  if (e.code === "23505") return "That name is already taken.";
  if (e.code === "23514") return "One of the values isn't allowed. Check colours are hex codes like #7C5CFF and links start with https://.";
  if (e.code === "42501") return "Only the owner can change settings.";
  return e.message;
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SaveBar({
  saver,
  dirty = true,
  label = "Save changes",
  onSave,
}: {
  saver: ReturnType<typeof useSaver>;
  dirty?: boolean;
  label?: string;
  onSave?: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type={onSave ? "button" : "submit"} onClick={onSave} disabled={saver.saving || !dirty}>
        {saver.saving ? "Saving…" : label}
      </Button>
      {saver.saved && <span className="text-sm text-[#35e08a]">Saved. The public page is updated.</span>}
      {!dirty && !saver.saved && <span className="text-sm text-muted">No changes</span>}
      {saver.error && (
        <div className="w-full">
          <ErrorNote>{saver.error}</ErrorNote>
        </div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition",
          checked ? "bg-portal" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

const PRESETS = ["#7C5CFF", "#3D7BFF", "#16C7D9", "#21C46B", "#FFC23D", "#FF8A3D", "#FF4F9A", "#E5484D", "#F2F0FF", "#0D0E2B"];

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line" style={{ backgroundColor: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} colour picker`}
          />
        </label>
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (isHex(hex)) onChange(hex.toUpperCase());
          }}
          className={cn(
            "h-10 w-28 rounded-xl border bg-panel-2 px-3 font-mono text-sm uppercase outline-none focus:border-portal",
            isHex(text.startsWith("#") ? text : `#${text}`) ? "border-line" : "border-rose-500/60",
          )}
          maxLength={7}
          aria-label={`${label} hex value`}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn("size-5 cursor-pointer rounded-full border border-line transition hover:scale-110", c === value && "ring-2 ring-ink")}
            style={{ backgroundColor: c }}
            aria-label={`Use ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Uploads to the public "media" bucket and returns the image URL. */
export function ImageUpload({
  value,
  onChange,
  folder,
  label,
  hint,
  className = "aspect-square w-28",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label: string;
  hint?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a PNG, JPG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return setError("Images must be under 5 MB.");
    setBusy(true);
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const sb = supabaseBrowser();
    const { error } = await sb.storage.from("media").upload(path, file, { cacheControl: "31536000", contentType: file.type });
    setBusy(false);
    if (error) return setError(error.message.includes("row-level") ? "Only the owner can upload images." : error.message);
    onChange(sb.storage.from("media").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
          className={cn(
            "group relative grid cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-panel-2 text-muted transition hover:border-portal",
            className,
          )}
          aria-label={value ? `Replace ${label}` : `Upload ${label}`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <ImagePlus className="size-6" />
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-void/70">
              <Loader2 className="size-5 animate-spin" />
            </span>
          )}
        </button>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} disabled={busy}>
              <Trash2 className="size-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs text-rose-300">{error}</span>}
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function isDirty<T>(initial: T, current: T) {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

/** Move item `from` to `to` and renumber sort_order (10, 20, …) for rows that changed. */
export async function reorder<T extends { sort_order: number }>(
  table: "stations" | "station_types" | "games",
  key: keyof T & ("id" | "name"),
  items: T[],
  from: number,
  to: number,
): Promise<{ error: { message: string; code?: string } | null }> {
  if (to < 0 || to >= items.length) return { error: null };
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const sb = supabaseBrowser();
  for (let i = 0; i < next.length; i++) {
    const order = (i + 1) * 10;
    if (next[i].sort_order === order) continue;
    const { error } = await sb.from(table).update({ sort_order: order }).eq(key as string, String(next[i][key]));
    if (error) return { error };
  }
  return { error: null };
}
