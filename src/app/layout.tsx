import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "라운지핏",
  description: "라운지핏 회원 예약 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className="min-h-screen bg-canvas font-sans text-ink">{children}</body></html>;
}
