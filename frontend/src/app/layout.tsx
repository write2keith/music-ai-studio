import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Sidebar } from "@/components/studio/Sidebar";
import { TopNav } from "@/components/studio/TopNav";
import { ToastProvider } from "@/components/ui/toast";
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
          <ToastProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 ml-60 flex flex-col">
                <TopNav />
                <main className="flex-1 p-6">{children}</main>
              </div>
            </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
