import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pilot - AI-Powered A/B Testing Agent",
  description: "Automate PostHog experiment setup and feature flag implementation with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
