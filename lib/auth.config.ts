import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config — used by `middleware.ts` which runs on the
 * Edge runtime and CANNOT import `node:crypto`, firebase-admin, or any
 * other Node-only module.
 *
 * The full config (with the wallet-ensureUser jwt callback that DOES
 * need crypto + node fetch) lives in `lib/auth.ts` and is used by all
 * API routes / server components.
 *
 * See: https://authjs.dev/guides/edge-compatibility
 */
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    // Minimal session passthrough so middleware.ts can read `req.auth`.
    // The richer jwt/session callbacks (including wallet integration) live
    // only in lib/auth.ts and run in the Node runtime.
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as typeof session.user & {
          provider?: string;
          providerAccountId?: string;
          walletUid?: string;
          walletStatus?: "active" | "frozen" | "banned";
        };
        u.provider = token.provider as string | undefined;
        u.providerAccountId = token.providerAccountId as string | undefined;
        u.walletUid = token.walletUid as string | undefined;
        u.walletStatus = token.walletStatus as
          | "active"
          | "frozen"
          | "banned"
          | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
