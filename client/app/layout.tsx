import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoGate } from "@/components/demo-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Collab Notes AI",
  description:
    "Collaborative meeting workspaces with realtime notes, AI summaries, and grounded Ask mode.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <DemoGate>{children}</DemoGate>
      </body>
    </html>
  );
}
