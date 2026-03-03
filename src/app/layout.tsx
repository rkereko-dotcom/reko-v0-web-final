import type { Metadata } from "next";
import { Funnel_Display, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { SiteSettingsProvider } from "@/components/providers/site-settings-provider";
import { prisma } from "@/lib/prisma";
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

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
    });
    return {
      title: settings?.tabTitle || "Reko - Design Analysis",
      description: "AI-powered poster analysis and improvement",
    };
  } catch {
    return {
      title: "Reko - Design Analysis",
      description: "AI-powered poster analysis and improvement",
    };
  }
}

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
        <SiteSettingsProvider>
          <AuthProvider>{children}</AuthProvider>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}
