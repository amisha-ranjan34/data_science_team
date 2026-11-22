import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AutoDS — Autonomous Data Science Team",
  description: "Upload a CSV. Get models trained, cross-validated and an honest baseline comparison with zero data leakage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans bg-paper text-ink selection:bg-cyan-500/30 selection:text-cyan-200 antialiased">
        {children}
      </body>
    </html>
  );
}
