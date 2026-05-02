import type { Metadata } from "next";
import InteractiveBackground from "./InteractiveBackground";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meetigate",
  description: "A glassmorphism meeting app for teaching, testing, and student growth."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <InteractiveBackground />
        {children}
      </body>
    </html>
  );
}
