import type { Metadata } from "next";
import { LoadingProvider } from "@/components/loading/loading-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Ops Portal",
  description: "Internal task and deployment operations dashboard.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased"><LoadingProvider>{children}</LoadingProvider></body>
    </html>
  );
}
