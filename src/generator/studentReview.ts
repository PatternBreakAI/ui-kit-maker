/* Student review — the browser's half of the REVIEWER'S side.

   Thin on purpose, like billing.ts: this module can ask the server to
   list applications and to record a decision, and that is all. Every
   power decision — is the caller an admin, sign the document URL, delete
   the document — lives in /api/student-review with the service role.
   The deletion promise is kept THERE, in the same call as the decision;
   nothing this file does can approve someone while leaving their ID
   behind. */

import { accessToken } from "./cloud";

export type Application = {
  id: string;
  status: "pending" | "approved" | "rejected";
  schoolEmail: string;
  /** The applicant's sign-in address — where a decision email goes.
      Only present on pending rows. */
  accountEmail: string | null;
  /** Ten-minute signed URL for the ID document. Pending rows only —
      decided rows have no document left, by design. */
  idUrl: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "Sign in first." };
  let res: Response;
  try {
    res = await fetch("/api/student-review", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the review service — check your connection." };
  }
  let data: { error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch { /* platform error page — fall through to status */ }
  if (!res.ok) return { ok: false, error: data.error ?? `The review service returned ${res.status}.` };
  return { ok: true, data };
}

/** All applications, newest first. Error string or the list. */
export async function listApplications(): Promise<{ applications: Application[]; error: string | null }> {
  const r = await call({ action: "list" });
  if (!r.ok) return { applications: [], error: r.error ?? "Couldn't load applications." };
  const apps = (r.data as { applications?: Application[] }).applications ?? [];
  return { applications: apps, error: null };
}

/** Record a decision. The server deletes the ID document in the same
    call — that coupling is the whole point. Returns an error string or null. */
export async function decideApplication(
  id: string,
  action: "approve" | "reject",
  note?: string,
): Promise<string | null> {
  const r = await call({ action, id, note: note?.trim() || undefined });
  return r.ok ? null : (r.error ?? "The decision didn't save.");
}
