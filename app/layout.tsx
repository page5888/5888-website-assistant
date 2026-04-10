import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { AdminResetButton } from "@/components/AdminResetButton";

export const metadata: Metadata = {
  title: "5888 網站助手｜AI 店家網站產生器",
  description:
    "一鍵為你的實體店家生成符合 SEO / AEO / GEO 標準的單頁宣傳網站 — 由頂級大型語言模型驅動,內建 LocalBusiness 結構化資料,讓你的店家在 Google、ChatGPT、Perplexity 都找得到。",
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
