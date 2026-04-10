import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
// Facebook provider left commented out until FB App review passes.
// import Facebook from "next-auth/providers/facebook";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Facebook({
    //   clientId: process.env.AUTH_FACEBOOK_ID,
    //   clientSecret: process.env.AUTH_FACEBOOK_SECRET,
    // }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & {
          provider?: string;
          providerAccountId?: string;
        }).provider = token.provider as string | undefined;
        (session.user as typeof session.user & {
          provider?: string;
          providerAccountId?: string;
        }).providerAccountId = token.providerAccountId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
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
