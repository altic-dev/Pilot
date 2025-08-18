import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// import { StarsBackground } from "@/components/animate-ui/backgrounds/stars";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Assistant - Multi-Agent Chat",
  description: "AI-powered chat interface with multiple specialized agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*<StarsBackground className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">*/}
        {children}
        {/*</StarsBackground>*/}
      </body>
    </html>
  );
}
