import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { AdminResetButton } from "@/components/AdminResetButton";

export const metadata: Metadata = {
  title: "5888 網站助手｜AI 店家網站產生器",
  description:
    "填店名 → AI 出網站,24 小時預覽免費試用。一鍵為你的實體店家生成符合 SEO / AEO / GEO 標準的單頁宣傳網站。",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/logo-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/logo-512.png",
  },
  openGraph: {
    title: "5888 網站助手｜AI 店家網站產生器",
    description: "填店名 → AI 出網站,24 小時預覽免費試用。",
    images: ["/logo-512.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const showAdmin = isAdminEmail(session?.user?.email);

  return (
    <html lang="zh-Hant">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        {showAdmin && <AdminResetButton />}
      </body>
    </html>
  );
}
