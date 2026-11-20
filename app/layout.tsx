import "@fontsource-variable/atkinson-hyperlegible-next";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Vela Night Care",
  description: "After-hours triage and home-visit dispatch for international visitors in Medellín. Demo with synthetic data.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='1 4 26 26'%3E%3Cpath d='M11.635 5.235A12 12 0 1 0 25.765 19.365 10 10 0 0 1 11.635 5.235Z' fill='%23F5B942'/%3E%3Crect x='18' y='6.5' width='4' height='11' rx='1.2' fill='%230E9384'/%3E%3Crect x='14.5' y='10' width='11' height='4' rx='1.2' fill='%230E9384'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
