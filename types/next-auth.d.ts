/**
 * Module augmentation for Auth.js v5 — adds the 5888 central wallet fields
 * to both the JWT token and the session.user shape so callers can read
 * them type-safely via `session.user.walletUid`.
 */
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      provider?: string;
      providerAccountId?: string;
      walletUid?: string;
      walletStatus?: "active" | "frozen" | "banned";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    providerAccountId?: string;
    walletUid?: string;
    walletStatus?: "active" | "frozen" | "banned";
  }
}
