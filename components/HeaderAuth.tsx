"use client";

import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth-ui";
import Link from "next/link";

export function HeaderAuth() {
  return (
    <>
      <SignedIn>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <Link
          href="/auth/sign-in"
          className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
        >
          Sign In
        </Link>
      </SignedOut>
    </>
  );
}
