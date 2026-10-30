import type { Metadata } from "next";
import localFont from "next/font/local";

import { PreferencesBootstrap } from "@/components/shared/preferences-bootstrap";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Fontes no repositório (woff2 variável, subset latin do Google Fonts): com
// next/font/google o build da Vercel falhava às vezes ao baixar a fonte.

const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  weight: "400 700",
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  preload: true,
});

const grotesk = localFont({
  src: "./fonts/SpaceGrotesk-latin.woff2",
  weight: "500 700",
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
});

const inter = localFont({
  src: "./fonts/Inter-latin.woff2",
  weight: "400 500",
  variable: "--font-inter",
  display: "swap",
});

const outfit = localFont({
  src: "./fonts/Outfit-latin.woff2",
  weight: "400 600",
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = localFont({
  src: [
    { path: "./fonts/Fraunces-latin.woff2", weight: "400 500", style: "normal" },
    { path: "./fonts/Fraunces-Italic-latin.woff2", weight: "400 500", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "CRM Credios",
  description: "Sistema de gestão de leads da Credios — CGI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${grotesk.variable} ${inter.variable} ${outfit.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <PreferencesBootstrap />
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
