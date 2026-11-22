"use client";
import { KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { addStaff, listStaff, removeStaff, resetStaffPassword, updateStaff, type StaffMember } from "@/app/actions/staff";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import { Section } from "./shared";

export function StaffTab({ enabled }: { enabled: boolean }) {
  if (!enabled) return <SetupHelp />;
  return <StaffManager />;
}

function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "staff" as "staff" | "owner" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listStaff().then((r) => {
      if (r.ok) setStaff(r.data);
      else setError(r.error);
    });
  }, []);
  useEffect(load, [load]);

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    load();
    return r.ok;
  }

  return (
    <div className="space-y-6">
      <Section title="Add a staff login" description="They sign in at /staff with this email and password. Share it with them in person or on WhatsApp.">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_0.8fr_auto] lg:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await act(addStaff(form));
            if (ok) setForm({ email: "", name: "", password: "", role: "staff" });
          }}
        >
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Shown on the board" />
          </Field>
          <Field label="Password">
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Access">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "staff" | "owner" })}>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            Add login
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted">
          Staff can manage bookings. Owners can also change settings and delete bookings.
        </p>
      </Section>

      <Section title="People with access">
        <ErrorNote>{error}</ErrorNote>
        {!staff ? (
          <div className="h-24 animate-pulse rounded-2xl bg-panel-2" />
        ) : (
          <ul className="divide-y divide-line">
            {staff.map((m) => (
              <Member key={m.user_id} m={m} busy={busy} act={act} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Member({
  m,
  busy,
  act,
}: {
  m: StaffMember;
  busy: boolean;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
}) {
  const [name, setName] = useState(m.display_name ?? "");
  const [pw, setPw] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <p className="font-semibold">
            {m.email} {m.is_you && <span className="font-normal text-muted">(you)</span>}
          </p>
          <p className="text-xs text-muted">
            {m.last_sign_in ? `Last signed in ${new Date(m.last_sign_in).toLocaleDateString("en-IN")}` : "Hasn't signed in yet"}
          </p>
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-40" aria-label="Name" />
        {name !== (m.display_name ?? "") && (
          <Button size="sm" disabled={busy} onClick={() => act(updateStaff(m.user_id, { display_name: name }))}>
            Save
          </Button>
        )}
        <Select
          value={m.role}
          onChange={(e) => act(updateStaff(m.user_id, { role: e.target.value as "owner" | "staff" }))}
          className="w-28"
          aria-label="Access"
          disabled={busy}
        >
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setPw(pw === null ? "" : null)}>
          <KeyRound className="size-4" /> Password
        </Button>
        {!m.is_you &&
          (confirmRemove ? (
            <span className="flex items-center gap-1">
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act(removeStaff(m.user_id))}>
                Remove login
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => setConfirmRemove(true)} aria-label={`Remove ${m.email}`}>
              <Trash2 className="size-4" />
            </Button>
          ))}
      </div>
      {pw !== null && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act(resetStaffPassword(m.user_id, pw))) setPw(null);
          }}
        >
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" minLength={8} required className="max-w-72" autoComplete="new-password" />
          <Button type="submit" size="sm" className="h-10" disabled={busy}>
            Set password
          </Button>
        </form>
      )}
    </li>
  );
}

function SetupHelp() {
  return (
    <Section title="Staff logins" description="To add and remove staff from here, the server needs your Supabase secret key.">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          In Supabase, open <b className="text-ink">Project Settings → API Keys</b> and copy a <b className="text-ink">secret key</b> (starts with{" "}
          <code>sb_secret_</code>).
        </li>
        <li>
          Add it to <code className="text-ink">.env.local</code> (and to Vercel&apos;s environment variables) as{" "}
          <code className="text-ink">SUPABASE_SECRET_KEY=…</code>. Never prefix it with <code>NEXT_PUBLIC_</code>.
        </li>
        <li>Restart the app and come back to this tab.</li>
      </ol>
      <p className="mt-4 text-sm text-muted">
        Until then you can add staff in Supabase: Authentication → Users → Add user, then run in the SQL Editor:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-2xl bg-panel-2 p-4 text-xs">
        {`insert into staff_profiles (user_id, display_name, role)
select id, 'Name', 'staff' from auth.users where email = 'them@example.com';`}
      </pre>
    </Section>
  );
}
