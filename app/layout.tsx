import type { Metadata } from "next";
import "./globals.css";
import MobileFrame from "@/components/MobileFrame";

export const metadata: Metadata = {
  title: "Map of Us",
  description: "A private map for memories we made together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <MobileFrame>{children}</MobileFrame>
      </body>
    </html>
  );
}
