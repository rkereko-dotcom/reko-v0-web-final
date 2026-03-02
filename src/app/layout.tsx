import type { Metadata } from "next";
import { Funnel_Display, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import "./globals.css";

const displayFont = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const funnelDisplay = Funnel_Display({
  variable: "--font-funnel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reko - Design Analysis",
  description: "AI-powered poster analysis and improvement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <body
        className={`${displayFont.variable} ${funnelDisplay.variable} ${bodyFont.variable} ${monoFont.variable} antialiased bg-[var(--background)] text-[var(--foreground)]`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
