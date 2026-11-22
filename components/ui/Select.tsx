"use client";
import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

function textOf(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return "";
}

/** Reads <option> children (fragments and arrays included) into a plain list. */
function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      const text = textOf(el.props.children);
      out.push({ value: String(el.props.value ?? text), label: el.props.children, text, disabled: !!el.props.disabled });
    } else if (el.props.children) out.push(...readOptions(el.props.children));
  });
  return out;
}

const LIST_MAX = 288; // px

/**
 * App-styled dropdown with the same API as <select>: `value` / `defaultValue`,
 * `onChange(e)` with `e.target.value`, <option> children and `name` for forms.
 * Keyboard: arrows, Home/End, Enter/Space, Esc, type to jump.
 */
export function Select({
  value,
  defaultValue,
  onChange,
  children,
  className,
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: ComponentProps<"select">) {
  const options = readOptions(children);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = controlled ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(LIST_MAX, options.length * 36 + 8);
    const up = below < want && above > below;
    const maxHeight = Math.max(120, Math.min(LIST_MAX, up ? above : below));
    const width = Math.max(r.width, 180);
    setPos({
      top: up ? r.top - 4 - Math.min(want, maxHeight) : r.bottom + 4,
      left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      width,
      maxHeight,
    });
  }, [options.length]);

  const show = () => {
    if (disabled || !options.length) return;
    // Inside a modal <dialog> the list must live in the dialog (top layer) to be visible.
    setHost(btn.current?.closest("dialog") ?? document.body);
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    place();
    setOpen(true);
  };
  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const choose = (o: Opt | undefined) => {
    if (!o || o.disabled) return;
    if (!controlled) setInner(o.value);
    if (o.value !== current) {
      const target = { value: o.value, name } as unknown as HTMLSelectElement;
      onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
    }
    hide();
  };

  // Keep the list attached while the page scrolls or resizes; close on outside clicks.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return;
      place();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) hide(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place]);

  // Bring the highlighted option into view
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (from: number, step: number) => {
    for (let i = from + step, n = 0; n < options.length; i += step, n++) {
      const j = (i + options.length) % options.length;
      if (!options[j].disabled) return j;
    }
    return from;
  };

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        e.preventDefault();
        show();
      }
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't close the surrounding dialog
      hide();
    } else if (k === "ArrowDown") {
      e.preventDefault();
      setActive((a) => move(a, 1));
    } else if (k === "ArrowUp") {
      e.preventDefault();
      setActive((a) => move(a, -1));
    } else if (k === "Home") {
      e.preventDefault();
      setActive(move(-1, 1));
    } else if (k === "End") {
      e.preventDefault();
      setActive(move(options.length, -1));
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      choose(options[active]);
    } else if (k === "Tab") {
      hide(false);
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Type-to-jump
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + k.toLowerCase(), at: now };
      const i = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-activedescendant={open ? `${uid}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
        className={[
          "flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 text-left text-sm text-ink outline-none transition",
          "hover:border-portal/50 focus-visible:border-portal focus-visible:ring-2 focus-visible:ring-portal/25 disabled:cursor-default disabled:opacity-50",
          open ? "border-portal ring-2 ring-portal/25" : "",
          className ?? "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ""}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {name !== undefined && <input type="hidden" name={name} value={current} />}
      {open &&
        host &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={`${uid}-list`}
            role="listbox"
            aria-label={ariaLabel}
            style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: pos.maxHeight }}
            className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1 text-ink shadow-2xl shadow-black/50"
          >
            {options.map((o, i) => {
              const isSel = o.value === current;
              return (
                <div
                  key={`${o.value}-${i}`}
                  id={`${uid}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  onPointerEnter={() => !o.disabled && setActive(i)}
                  // Keep focus on the button so keyboard handling keeps working
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={[
                    "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    i === active ? "bg-tint/8" : "",
                    isSel ? "font-semibold text-ink" : "text-ink/85",
                    o.disabled ? "cursor-default opacity-40" : "",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1 whitespace-nowrap">{o.label}</span>
                  {isSel && <Check className="size-4 shrink-0 text-portal" aria-hidden />}
                </div>
              );
            })}
          </div>,
          host,
        )}
    </>
  );
}
