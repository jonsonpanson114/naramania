import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "奈良県入札情報アグリゲーター",
  description: "奈良県、奈良市、橿原市、生駒市の入札情報を一元管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
