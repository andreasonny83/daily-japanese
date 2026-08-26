import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";

import { AuthProvider } from "@/components/AuthProvider";
import { HeaderAuth } from "@/components/HeaderAuth";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-jp",
});

export const metadata: Metadata = {
  title: "Daily Japanese",
  description:
    "Learn Japanese with a leveled, spaced-repetition flashcard system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body
        className={`${inter.variable} ${notoSansJP.variable} flex min-h-screen flex-col bg-gray-100 font-sans text-gray-800 antialiased`}
      >
        <AuthProvider>
          <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow-sm md:px-8">
            <Link href="/" className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-lg font-bold text-white shadow-md">
                日
              </div>
              <span className="text-lg font-bold tracking-tight text-gray-800 md:text-xl">
                Daily Japanese
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
              <Link
                href="/practice"
                className="transition-colors hover:text-red-600"
              >
                Practice
              </Link>
              <Link
                href="/progress"
                className="transition-colors hover:text-red-600"
              >
                Progress
              </Link>
              <HeaderAuth />
            </nav>
          </header>
          <main className="flex flex-grow flex-col items-center justify-center p-3 md:p-6">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
