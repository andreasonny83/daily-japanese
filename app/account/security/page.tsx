"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Toast } from "@/components/Toast";
import { authClient } from "@/lib/auth/client";
import { useToast } from "@/lib/hooks/useToast";

type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  createdAt: string | Date;
};

function describeSession(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/mobile/i.test(userAgent)) return "Mobile browser";
  if (/iPad|Tablet/i.test(userAgent)) return "Tablet browser";
  if (/Chrome/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "Browser";
}

export default function AccountSecurityPage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const { message: toastMsg, visible: toastVisible, showToast } = useToast();

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    const { data } = await authClient.listSessions();
    setSessions((data as Session[]) ?? []);
    setSessionsLoading(false);
  }, []);

  useEffect(() => {
    if (sessionLoading || !isAuthed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions();
  }, [sessionLoading, isAuthed, loadSessions]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("New passwords don't match");
      return;
    }
    setSavingPassword(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
    setSavingPassword(false);
    if (error) {
      showToast(error.message ?? "Couldn't change password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    showToast("Password updated");
  }

  async function handleRevokeSession(token: string) {
    await authClient.revokeSession({ token });
    showToast("Session signed out");
    loadSessions();
  }

  async function handleRevokeOthers() {
    await authClient.revokeOtherSessions();
    showToast("Signed out of all other sessions");
    loadSessions();
  }

  if (sessionLoading) return null;

  if (!isAuthed) {
    return (
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          Sign in to manage your account
        </h1>
        <Link
          href="/auth/sign-in"
          className="inline-block rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const currentToken = session.session.token;
  const otherSessions = sessions.filter((s) => s.token !== currentToken);

  return (
    <>
      <div className="w-full max-w-2xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
          <h1 className="mb-1 text-xl font-bold text-gray-900">Security</h1>
          <p className="mb-6 text-sm text-gray-500">
            Change your password and manage where you&apos;re signed in.
          </p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="currentPassword"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Active sessions</h2>
            {otherSessions.length > 0 && (
              <button
                onClick={handleRevokeOthers}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Sign out other devices
              </button>
            )}
          </div>

          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {describeSession(s.userAgent)}
                      {s.token === currentToken && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      Signed in {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {s.token !== currentToken && (
                    <button
                      onClick={() => handleRevokeSession(s.token)}
                      className="text-xs font-medium text-gray-500 transition-colors hover:text-red-600"
                    >
                      Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
