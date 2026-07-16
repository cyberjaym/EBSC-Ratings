import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EBSC Ratings",
  description: "Multi-tenant youth sports league management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
