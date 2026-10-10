import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const terminal = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-terminal",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Retro Intelligence Bureau // RAG Agent",
  description:
    "A 1980s-style AI field agent that answers questions from your classified case files. Go + pgvector + Gemini + Next.js.",
  icons: { icon: "/media/agent.jpg" },
  openGraph: {
    title: "Retro Intelligence Bureau",
    description: "Feed it case files. Ask questions. Agent K-8 reports back.",
    images: ["/media/hero.jpg"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixel.variable} ${terminal.variable}`}>
      <body>
        <div className="crt" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
