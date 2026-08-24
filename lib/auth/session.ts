import { auth } from "./server";

/** Returns the signed-in user's id, or null for a guest (no session). */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await auth.getSession();
  return data?.user?.id ?? null;
}
