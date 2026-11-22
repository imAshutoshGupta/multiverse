import type { Metadata, Viewport } from "next";
import { Geist_Mono, Onest, Unbounded } from "next/font/google";
import "./globals.css";

// Default fonts are bundled; owners can switch to any Google Font in Settings.
const body = Onest({ variable: "--font-body", subsets: ["latin"] });
const display = Unbounded({ variable: "--font-display-face", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "The Multiverse", template: "%s · The Multiverse" },
  description: "Book your gaming slot at The Multiverse, Nisarg Greens, Ambernath.",
  appleWebApp: { capable: true, title: "Multiverse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d0e2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
