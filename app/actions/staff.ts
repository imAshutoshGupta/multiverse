"use server";
import { adminEnabled, supabaseAdmin } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/supabase/server";

export interface StaffMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "staff";
  last_sign_in: string | null;
  is_you: boolean;
}

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function requireOwner() {
  const { user, profile } = await getStaff();
  if (!user || profile?.role !== "owner") throw new Error("Only the owner can manage staff.");
  if (!adminEnabled) throw new Error("Add SUPABASE_SECRET_KEY to the server environment to manage staff here.");
  return { me: user.id, admin: supabaseAdmin() };
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function listStaff(): Promise<Result<StaffMember[]>> {
  return run(async () => {
    const { me, admin } = await requireOwner();
    const [{ data: profiles, error }, { data: users, error: uErr }] = await Promise.all([
      admin.from("staff_profiles").select("user_id, display_name, role").order("created_at"),
      admin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    if (error) throw new Error(error.message);
    if (uErr) throw new Error(uErr.message);
    return (profiles ?? []).map((p) => {
      const u = users.users.find((x) => x.id === p.user_id);
      return {
        user_id: p.user_id,
        email: u?.email ?? "(deleted user)",
        display_name: p.display_name,
        role: p.role,
        last_sign_in: u?.last_sign_in_at ?? null,
        is_you: p.user_id === me,
      };
    });
  });
}

export async function addStaff(input: { email: string; password: string; name: string; role: "owner" | "staff" }) {
  return run(async () => {
    const { admin } = await requireOwner();
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (input.password.length < 8) throw new Error("Use a password of at least 8 characters.");
    const role = input.role === "owner" ? "owner" : "staff";

    let userId: string | undefined;
    const created = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true });
    if (created.error) {
      // Existing account: attach it as staff instead
      const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
      userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (!userId) throw new Error(created.error.message);
      const upd = await admin.auth.admin.updateUserById(userId, { password: input.password });
      if (upd.error) throw new Error(upd.error.message);
    } else {
      userId = created.data.user.id;
    }
    const { error } = await admin
      .from("staff_profiles")
      .upsert({ user_id: userId, display_name: input.name.trim() || null, role }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return null;
  });
}

async function ownerCount(admin: ReturnType<typeof supabaseAdmin>) {
  const { count } = await admin.from("staff_profiles").select("user_id", { count: "exact", head: true }).eq("role", "owner");
  return count ?? 0;
}

export async function updateStaff(userId: string, patch: { role?: "owner" | "staff"; display_name?: string }) {
  return run(async () => {
    const { me, admin } = await requireOwner();
    if (patch.role === "staff" && userId === me && (await ownerCount(admin)) <= 1) {
      throw new Error("You're the only owner. Make someone else an owner first.");
    }
    const row: Record<string, string | null> = {};
    if (patch.role) row.role = patch.role === "owner" ? "owner" : "staff";
    if (patch.display_name !== undefined) row.display_name = patch.display_name.trim() || null;
    const { error } = await admin.from("staff_profiles").update(row).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function resetStaffPassword(userId: string, password: string) {
  return run(async () => {
    const { admin } = await requireOwner();
    if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(error.message);
    return null;
  });
}

/** Removes staff access and deletes the login. */
export async function removeStaff(userId: string) {
  return run(async () => {
    const { me, admin } = await requireOwner();
    if (userId === me) throw new Error("You can't remove yourself.");
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return null;
  });
}
