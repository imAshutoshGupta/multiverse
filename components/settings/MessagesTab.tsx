"use client";
import { useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, renderTemplate, type TemplateKind } from "@/lib/messages";
import { supabaseBrowser } from "@/lib/supabase/client";
import { istInstant, istDate } from "@/lib/time";
import type { Settings } from "@/lib/types";
import { isDirty, SaveBar, Section, useSaver } from "./shared";

const KINDS: { kind: TemplateKind; column: "msg_confirm" | "msg_decline" | "msg_reminder"; title: string; when: string }[] = [
  { kind: "confirm", column: "msg_confirm", title: "Booking confirmed", when: "Sent when you confirm a request or tap WhatsApp confirmation." },
  { kind: "decline", column: "msg_decline", title: "Request declined", when: "Sent when you decline an online request." },
  { kind: "reminder", column: "msg_reminder", title: "Reminder", when: "Sent from a booking's Send reminder button." },
];

export function MessagesTab({ settings }: { settings: Settings }) {
  const initial = Object.fromEntries(KINDS.map((k) => [k.kind, settings[k.column] ?? DEFAULT_TEMPLATES[k.kind]])) as Record<TemplateKind, string>;
  const [t, setT] = useState(initial);
  const saver = useSaver();
  const today = istDate();
  const sample = {
    customer_name: "Rohan",
    starts_at: istInstant(today, 18 * 60).toISOString(),
    ends_at: istInstant(today, 20 * 60).toISOString(),
    party_size: 2,
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Store null when the text matches the default, so future improvements apply
        const patch = Object.fromEntries(
          KINDS.map((k) => [k.column, t[k.kind].trim() === DEFAULT_TEMPLATES[k.kind] ? null : t[k.kind].trim() || null]),
        );
        saver.run(() => supabaseBrowser().from("settings").update(patch).eq("id", 1));
      }}
      className="space-y-6"
    >
      {KINDS.map((k) => (
        <Template
          key={k.kind}
          title={k.title}
          when={k.when}
          value={t[k.kind]}
          onChange={(v) => setT((p) => ({ ...p, [k.kind]: v }))}
          onReset={() => setT((p) => ({ ...p, [k.kind]: DEFAULT_TEMPLATES[k.kind] }))}
          preview={renderTemplate(t[k.kind], settings, sample, { name: "PS5 · Station 1", type: "PS5" })}
        />
      ))}
      <SaveBar saver={saver} dirty={isDirty(initial, t)} />
    </form>
  );
}

function Template({
  title,
  when,
  value,
  onChange,
  onReset,
  preview,
}: {
  title: string;
  when: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  preview: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function insert(key: string) {
    const el = ref.current;
    const token = `{${key}}`;
    if (!el) return onChange(value + token);
    const { selectionStart: a, selectionEnd: b } = el;
    onChange(value.slice(0, a) + token + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  }
  return (
    <Section
      title={title}
      description={when}
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Reset to default
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={7} maxLength={1000} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => insert(p.key)}
                title={`Insert ${p.label}`}
                className="cursor-pointer rounded-full border border-line px-2.5 py-1 font-mono text-xs text-muted transition hover:border-portal hover:text-ink"
              >
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Preview</p>
          <div className="max-w-sm whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[#005c4b] px-4 py-3 text-sm text-[#e9edef] shadow">
            {preview}
          </div>
        </div>
      </div>
    </Section>
  );
}
