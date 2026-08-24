import { createNeonAuth } from "@neondatabase/auth/next/server";

if (!process.env.NEON_AUTH_BASE_URL) {
  throw new Error("NEON_AUTH_BASE_URL environment variable is not set");
}
if (!process.env.NEON_AUTH_COOKIE_SECRET) {
  throw new Error("NEON_AUTH_COOKIE_SECRET environment variable is not set");
}

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET,
  },
});
