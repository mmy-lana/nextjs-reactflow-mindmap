import type { Metadata } from "next";
import "./globals.css";
import "@xyflow/react/dist/style.css";

export const metadata: Metadata = {
  title: "Web-Based Mind Mapping Canvas",
  description: "Infinite canvas grid mind mapping application built with Next.js and xyflow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0c0d0e] text-[#f3f4f6]">
        {children}
      </body>
    </html>
  );
}
