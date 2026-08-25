"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth/client";

export function HeaderAuth() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!session?.user) {
    return (
      <Link
        href="/auth/sign-in"
        className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
      >
        Sign In
      </Link>
    );
  }

  const { name, email, image } = session.user;
  const label = name || email || "Account";
  const initial = label.charAt(0).toUpperCase();

  async function handleSignOut() {
    setOpen(false);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-red-500 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            {name && (
              <p className="truncate text-sm font-semibold text-gray-900">
                {name}
              </p>
            )}
            {email && <p className="truncate text-xs text-gray-500">{email}</p>}
          </div>
          <nav className="py-1">
            <Link
              href="/account/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <i className="fas fa-user mr-2 w-4 text-gray-400" />
              Account settings
            </Link>
            <Link
              href="/account/security"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <i className="fas fa-shield-halved mr-2 w-4 text-gray-400" />
              Security
            </Link>
          </nav>
          <div className="border-t border-gray-100 py-1">
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <i className="fas fa-right-from-bracket mr-2 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
