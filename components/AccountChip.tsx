import { auth, signIn, signOut } from "@/lib/auth";

/**
 * Shared header account chip — used by both the landing page and
 * the preview header so users always have a visible login/logout
 * affordance no matter where they are in the app.
 *
 * Server component; uses next-auth v5 server actions for sign in/out.
 *
 * Variant:
 *   - "full":    name visible + "登出" button (landing page header)
 *   - "compact": avatar/name only + smaller "登出" (preview page header,
 *                where horizontal space is shared with site actions)
 */
export async function AccountChip({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const session = await auth();
  const compact = variant === "compact";

  if (session?.user) {
    const display = session.user.name ?? session.user.email ?? "使用者";
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="flex items-center gap-2"
      >
        <span
          className={
            compact
              ? "hidden max-w-[10rem] truncate text-xs text-[var(--color-muted-foreground)] sm:inline"
              : "mr-4 text-sm text-[var(--color-muted-foreground)]"
          }
          title={display}
        >
          {display}
        </span>
        <button
          type="submit"
          className={
            compact
              ? "rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--color-muted)]"
              : "rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--color-muted)]"
          }
          aria-label="登出"
        >
          登出
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className={
          compact
            ? "rounded-full bg-[var(--color-foreground)] px-4 py-1.5 text-xs font-semibold text-[var(--color-background)] transition hover:scale-105"
            : "rounded-full bg-[var(--color-foreground)] px-5 py-2 text-sm font-semibold text-[var(--color-background)] shadow-lg shadow-[var(--color-primary)]/10 transition hover:scale-105"
        }
        aria-label="使用 Google 登入"
      >
        以 Google 登入 →
      </button>
    </form>
  );
}
