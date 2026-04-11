import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { ensureUser } from "./wallet";
// Facebook provider left commented out until FB App review passes.
// import Facebook from "next-auth/providers/facebook";

/**
 * Full Auth.js config — runs in the Node runtime (API routes, server
 * components). Middleware uses the slimmer `authConfig` from auth.config.ts
 * because the edge runtime can't load `node:crypto` which the wallet client
 * depends on.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile, user }) {
      // On initial sign-in both `account` and `profile` are present.
      // On subsequent JWT refreshes only `token` is — we must not re-mint
      // walletUid on every request, so we gate on account being present.
      if (account && profile) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;

        // Sync with 5888 central wallet. This both creates the wallet user
        // on first login (triggering the 50pt signup bonus) AND returns the
        // canonical Firebase uid we'll store in the JWT for all future
        // wallet calls.
        //
        // We do this in `jwt` (not `events.signIn`) because `jwt` can throw
        // to fail-close the login — `events.signIn` is fire-and-forget and
        // would leave users with a valid session but no walletUid.
        //
        // Stub mode (WALLET_API_KEY unset): ensureUser returns a synthetic
        // uid so local dev works before the wallet endpoints ship.
        const email =
          (profile.email as string | undefined) ??
          (user?.email as string | undefined);
        if (account.provider === "google" && email) {
          try {
            const res = await ensureUser({
              email,
              googleSub: account.providerAccountId as string,
              displayName:
                (profile.name as string | undefined) ??
                (user?.name as string | undefined),
              photoURL:
                (profile.picture as string | undefined) ??
                (user?.image as string | undefined),
            });
            token.walletUid = res.uid;
            token.walletStatus = res.status;
          } catch (err) {
            // Don't silently swallow — a frozen/banned wallet user should
            // NOT be able to log in to cteater. Log + rethrow so Auth.js
            // surfaces the error on the sign-in page.
            console.error("[auth] ensureUser failed", err);
            throw err;
          }
        }
      }
      return token;
    },
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
});

/**
 * Returns a deterministic rate-limit key for the logged-in user,
 * based on OAuth provider + provider account id.
 */
export function getUserKey(session: {
  user?: { provider?: string; providerAccountId?: string; email?: string | null };
} | null | undefined): string | null {
  if (!session?.user) return null;
  const p = session.user.provider ?? "unknown";
  const id = session.user.providerAccountId ?? session.user.email ?? "anon";
  return `${p}:${id}`;
}

/**
 * Extract the 5888 central wallet uid attached to the session during the
 * jwt callback. Returns null if the user is not logged in or if the wallet
 * integration is in stub mode and no uid was minted.
 */
export function getWalletUid(session: {
  user?: { walletUid?: string };
} | null | undefined): string | null {
  return session?.user?.walletUid ?? null;
}
