import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "RAG Knowledge Assistant",
  description: "Explore advanced RAG concepts: hybrid search, custom chunking, and Cohere reranking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#090D16] text-gray-100 flex min-h-screen overflow-hidden`}
      >
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          {children}
        </main>
      </body>
    </html>
  );
}
