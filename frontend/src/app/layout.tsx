import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PixelProject Local Foundation",
  description: "Local development foundation for the PixelProject multiplayer pixel canvas.",
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

