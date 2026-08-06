import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Music AI Studio",
  description: "Generate, separate, and edit music with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <Providers>
          <Navbar />
          <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
          <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
            Music AI Studio &middot; Powered by Meta MusicGen, Demucs, pydub &amp; Pedalboard
          </footer>
        </Providers>
      </body>
    </html>
  );
}
