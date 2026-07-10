import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomBar from "@/components/BottomBar";
import WalletProvider from "@/components/WalletProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "trustline",
  description: "the everything floor for xrp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-screen flex flex-col lowercase">
        <WalletProvider>
          <main className="flex-1 pb-20 max-w-3xl w-full mx-auto px-4">
            {children}
          </main>
          <BottomBar />
        </WalletProvider>
      </body>
    </html>
  );
}
