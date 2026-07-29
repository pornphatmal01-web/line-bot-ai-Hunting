import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EA TURBO HUNTING - LINE Bot",
  description: "LINE Bot สำหรับ EA TURBO HUNTING (เทรดทองคำ)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
