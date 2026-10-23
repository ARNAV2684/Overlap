import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/shell/TopNav";
import { PreferencesProvider } from "@/providers/PreferencesProvider";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Overlap — every match, explained live", template: "%s · Overlap" },
  description:
    "Live synthetic football told as it happens: a 3D pitch, tactical overlays and AI moments checked number by number, in your mode and language.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
  ],
};

// Dark is the default. A saved choice is applied before the first paint so the page never flashes the other theme.
const themeScript = `try{var t=localStorage.getItem("ov-theme");if(t==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <PreferencesProvider>
          <TopNav />
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
