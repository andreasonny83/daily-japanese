"use client";

import { useState } from "react";

export function DeleteAccountModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="mb-2 text-lg font-bold text-gray-900">Delete Account</h3>
        <p className="mb-4 text-sm text-gray-600">
          This permanently deletes your account and all your learning progress.
          This cannot be undone.
        </p>
        <label
          htmlFor="deletePassword"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400"
        >
          Password (leave blank if you signed in with Google)
        </label>
        <input
          id="deletePassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 bg-gray-50 p-2 text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(password)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
