/* Student verification — the browser's half.

   It can do exactly two things: upload an ID to a private bucket, and
   record that it did. It cannot approve anything. The row's `status`
   column is server-truth in the same way `plan_id` is: RLS lets an owner
   insert a pending request and read their own, and nothing else. Only the
   reviewer (service role) may move a row to approved, and only an
   approved row makes /api/checkout reach for the student price. */

import { getClient } from "./cloud";

export type StudentStatus = "none" | "pending" | "approved" | "rejected";

/** Upload the ID and file the request. Returns an error string, or null. */
export async function submitStudentVerification(schoolEmail: string, file: File): Promise<string | null> {
  const client = await getClient();
  if (!client) return "Accounts aren't available on this deployment.";
  const { data: sess } = await client.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return "Sign in first — the discount attaches to your account.";

  // the object path is owner-scoped so storage RLS can key off the folder
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg").toLowerCase();
  const path = `${uid}/id-${Date.now()}${ext}`;

  const up = await client.storage.from("student-ids").upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (up.error) return `Couldn't upload that file: ${up.error.message}`;

  const ins = await client.from("student_verifications").insert({
    user_id: uid,
    school_email: schoolEmail,
    id_path: path,
    status: "pending",
  });
  if (ins.error) {
    // don't leave an orphan document sitting in the bucket
    await client.storage.from("student-ids").remove([path]);
    return `Couldn't file the request: ${ins.error.message}`;
  }
  return null;
}

/** Where this account stands. Drives the pricing CTA and the account page. */
export async function myStudentStatus(): Promise<StudentStatus> {
  const client = await getClient();
  if (!client) return "none";
  const { data: sess } = await client.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return "none";
  const { data, error } = await client
    .from("student_verifications")
    .select("status")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return "none";
  return (data.status as StudentStatus) ?? "none";
}
