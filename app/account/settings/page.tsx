"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeleteAccountModal } from "@/components/DeleteAccountModal";
import { Toast } from "@/components/Toast";
import { authClient } from "@/lib/auth/client";

export default function AccountSettingsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const isAuthed = !!session?.user;

  const [name, setName] = useState(session?.user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  function showToast(message: string) {
    setToastMsg(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    showToast(error ? "Couldn't update your name" : "Profile updated");
  }

  async function handleDeleteAccount(password: string) {
    setShowDeleteModal(false);
    const { error } = await authClient.deleteUser(
      password ? { password } : {},
    );
    if (error) {
      showToast(error.message ?? "Couldn't delete your account");
      return;
    }
    router.push("/");
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

  const { email, image } = session.user;
  const initial = (name || email || "?").charAt(0).toUpperCase();

  return (
    <>
      <div className="w-full max-w-2xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-red-500 text-xl font-semibold text-white">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Account Settings</h1>
              <p className="text-sm text-gray-500">{email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                Display name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Email
              </label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500">
                {email}
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
          <Link
            href="/account/security"
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Manage password &amp; active sessions
            <i className="fas fa-arrow-right ml-2" />
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl md:p-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-600">
            Danger zone
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Permanently delete your account and all your learning progress.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            Delete Account
          </button>
        </div>
      </div>

      <DeleteAccountModal
        open={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
      />
      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
