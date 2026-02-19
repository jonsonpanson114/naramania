import type { Metadata } from "next";
import { Shippori_Mincho } from "next/font/google";
import "./globals.css";

const shipporiMincho = Shippori_Mincho({
  weight: ['400', '500', '600', '700'],
  subsets: ["latin"],
  variable: "--font-shippori-mincho",
  display: 'swap',
  preload: false, // Recommended for CJK fonts to avoid loading issues if subsets are not perfect
});

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
      <body className={`${shipporiMincho.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
