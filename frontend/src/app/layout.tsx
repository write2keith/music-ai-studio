import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { ToastProvider } from "@/components/ui/toast";
import { AudioPlayerProvider } from "@/lib/audio-player";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

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
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <Providers>
          <AuthProvider>
            <ToastProvider>
              <AudioPlayerProvider>
                {children}
              </AudioPlayerProvider>
            </ToastProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
