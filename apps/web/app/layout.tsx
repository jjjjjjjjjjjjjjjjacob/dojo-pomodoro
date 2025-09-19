import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import HeaderClient from "./header-client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dojo Pomodoro",
  description: "Event management platform for exclusive gatherings and experiences",
  metadataBase: new URL("https://dojopomodoro.club"),
  openGraph: {
    title: "Dojo Pomodoro",
    description: "Event management platform for exclusive gatherings and experiences",
    url: "https://dojopomodoro.club",
    siteName: "Dojo Pomodoro",
    images: [
      {
        url: "/og-image.png", // You can replace this with actual image path
        width: 1200,
        height: 630,
        alt: "Dojo Pomodoro",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dojo Pomodoro",
    description: "Event management platform for exclusive gatherings and experiences",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <HeaderClient />
          {children}
        </Providers>
      </body>
    </html>
  );
}
