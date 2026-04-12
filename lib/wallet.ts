/**
 * 5888 Central Wallet client.
 *
 * Thin server-side wrapper around the wallet-5888 project's s2s REST endpoints.
 * Docs / design decisions: see memory/project_wallet_integration.md
 *
 * Auth: HMAC-SHA256(secret, `${timestamp}.${sha256(body)}`), Stripe-style.
 *   X-Api-Key, X-Site-Id, X-Timestamp, X-Signature headers on every request.
 *
 * STUB MODE: if WALLET_API_KEY is not set, every call returns a safe default
 * (balance=0, success=true, duplicate=false). This lets the rest of cteater
 * (checkout, preview page, ECPay notify) wire up + run locally before the
 * wallet dev ships the real endpoints. Every stub call logs a warning so we
 * don't ship stubbed code to production by accident.
 *
 * Real endpoints expected ~2026-04-13.
 */

import { createHash, createHmac } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const WALLET_API_URL =
  process.env.WALLET_API_URL ?? "https://asia-east1-wallet-5888.cloudfunctions.net";
const WALLET_API_KEY = process.env.WALLET_API_KEY ?? "";
const WALLET_HMAC_SECRET = process.env.WALLET_HMAC_SECRET ?? "";
export const WALLET_SITE_ID = process.env.WALLET_SITE_ID ?? "5888_cteater_staging";

/** True when real wallet credentials are configured. */
export function isWalletLive(): boolean {
  return WALLET_API_KEY.length > 0 && WALLET_HMAC_SECRET.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the s2s endpoint contracts from the wallet dev's spec
// ─────────────────────────────────────────────────────────────────────────────

export interface EnsureUserRequest {
  email: string;
  googleSub: string;
  displayName?: string;
  photoURL?: string;
}

export interface EnsureUserResponse {
  uid: string;
  isNewUser: boolean;
  balance: number;
  referralCode: string;
  status: "active" | "frozen" | "banned";
}

export interface GetBalanceResponse {
  uid: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  status: "active" | "frozen" | "banned";
}

export interface SpendRequest {
  uid: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  refOrderId?: string;
  metadata?: Record<string, unknown>;
}

export interface SpendResponse {
  success: true;
  duplicate: boolean;
  txId: string;
  balanceAfter: number;
  tier?: "first" | "repeat";
  /**
   * True if this was the user's first purchase on any 5888 site
   * (drives L1=50% / L2=25% commission rates on the wallet side).
   * Wallet server returns this on BOTH fresh and duplicate replays
   * with the exact same shape, so this is non-nullable. Confirmed by
   * wallet team 2026-04-11.
   */
  isFirstPurchase: boolean;
  metadata?: Record<string, unknown>;
}

export interface RefundRequest {
  uid: string;
  amount: number;
  originalIdempotencyKey: string;
  reason: string;
  idempotencyKey: string;
  /**
   * Default: false. cteater permanently sets this to false — platform eats
   * the gap rather than forcing L1/L2 wallets negative. See memory.
   */
  clawbackCommissions?: boolean;
}

export interface RefundResponse {
  success: true;
  txId: string;
  balanceAfter: number;
}

export interface GrantRequest {
  uid: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}

export interface GrantResponse {
  success: true;
  balanceAfter: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed wallet error. `code` matches the s2s endpoint's error string so
 * callers can switch on it directly.
 *
 * Known codes:
 *   INSUFFICIENT_BALANCE  → HTTP 402  (spend) — confirmed with wallet dev 2026-04-11
 *   ACCOUNT_NOT_ACTIVE    → HTTP 403  (spend) — .status is "frozen" in practice;
 *                                               "banned" has no code path on wallet side
 *   USER_NOT_FOUND        → HTTP 404  (spend/getBalance)
 *   INVALID_SIGNATURE     → HTTP 401  (all)
 *   EXPIRED_TIMESTAMP     → HTTP 401  (all)
 *   INVALID_AMOUNT        → HTTP 400  (spend/refund/grant)
 *   SITE_NOT_AUTHORIZED   → HTTP 403  (all)
 *   WALLET_SYSTEM_ERROR   → HTTP 500+ (all)
 *   NETWORK_ERROR         → fetch failed
 *   NOT_CONFIGURED        → stub mode triggered on a write call
 */
export class WalletError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly payload: Record<string, unknown> | null;

  constructor(
    code: string,
    message: string,
    httpStatus: number | null = null,
    payload: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.payload = payload;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC signing — Stripe-style
// ─────────────────────────────────────────────────────────────────────────────

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function sign(body: string, timestamp: number, secret: string): string {
  const bodyHash = sha256Hex(body);
  return createHmac("sha256", secret)
    .update(`${timestamp}.${bodyHash}`, "utf8")
    .digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level POST — handles HMAC, timestamp, error parsing, stub mode
// ─────────────────────────────────────────────────────────────────────────────

async function walletPost<TResponse>(
  path: `/s2s/${string}`,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const body = JSON.stringify({ ...payload, siteId: WALLET_SITE_ID });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(body, timestamp, WALLET_HMAC_SECRET);

  let res: Response;
  try {
    res = await fetch(`${WALLET_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": WALLET_API_KEY,
        "X-Site-Id": WALLET_SITE_ID,
        "X-Timestamp": String(timestamp),
        "X-Signature": signature,
      },
      body,
      // Don't cache any s2s response — every call must hit wallet backend.
      cache: "no-store",
    });
  } catch (err) {
    throw new WalletError(
      "NETWORK_ERROR",
      `Wallet fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // fall through — may be a non-JSON error page
  }

  if (!res.ok) {
    const code = (json?.error as string) ?? `HTTP_${res.status}`;
    throw new WalletError(
      code,
      `Wallet ${path} failed: ${code}`,
      res.status,
      json,
    );
  }

  return json as TResponse;
}

/**
 * Emit a "stub mode" warning the first time per process lifecycle, so the
 * logs are clear but we don't spam 500 warnings per request.
 */
let stubWarned = false;
function warnStub(op: string): void {
  if (stubWarned) return;
  stubWarned = true;
  console.warn(
    `[wallet] STUB MODE — WALLET_API_KEY not set. ${op} + future calls will return safe defaults. ` +
      `Set WALLET_API_URL / WALLET_API_KEY / WALLET_HMAC_SECRET / WALLET_SITE_ID to go live.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — one function per s2s endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up / create the Firebase Auth user by googleSub, and sync lastLoginAt.
 * Called from Auth.js `jwt` callback on first sign-in of each session.
 *
 * Stub mode: returns a synthetic uid derived from googleSub, balance=0.
 */
export async function ensureUser(
  req: EnsureUserRequest,
): Promise<EnsureUserResponse> {
  if (!isWalletLive()) {
    warnStub("ensureUser");
    return {
      uid: `stub_${req.googleSub}`,
      isNewUser: false,
      balance: 0,
      referralCode: "STUB000",
      status: "active",
    };
  }
  return walletPost<EnsureUserResponse>("/s2s/ensureUser", {
    email: req.email,
    googleSub: req.googleSub,
    displayName: req.displayName,
    photoURL: req.photoURL,
  });
}

/**
 * Read-only balance check for display. Caller may cache for up to 30s.
 * Never use the cached value for spend decisions — always let /s2s/spend
 * make the authoritative call.
 */
export async function getBalance(uid: string): Promise<GetBalanceResponse> {
  if (!isWalletLive()) {
    return {
      uid,
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      status: "active",
    };
  }
  return walletPost<GetBalanceResponse>("/s2s/getBalance", { uid });
}

/**
 * Deduct points. Idempotent on (uid, idempotencyKey) — cteater uses ECPay
 * MerchantTradeNo as the key so retries from ECPay's notify mechanism are safe.
 *
 * Throws WalletError with code INSUFFICIENT_BALANCE / ACCOUNT_NOT_ACTIVE / etc.
 * on expected failures. Stub mode always succeeds with a fake txId.
 */
export async function spend(req: SpendRequest): Promise<SpendResponse> {
  if (req.amount <= 0 || !Number.isInteger(req.amount)) {
    throw new WalletError("INVALID_AMOUNT", "amount must be positive integer");
  }
  if (!isWalletLive()) {
    warnStub("spend");
    return {
      success: true,
      duplicate: false,
      txId: `stub_tx_${Date.now()}`,
      balanceAfter: 0,
      tier: "first",
      isFirstPurchase: true,
    };
  }
  // ?lite=1 — skip the commissions payload. cteater UI doesn't display
  // commissions, so we save a few hundred bytes per response.
  return walletPost<SpendResponse>("/s2s/spend?lite=1", {
    uid: req.uid,
    amount: req.amount,
    reason: req.reason,
    idempotencyKey: req.idempotencyKey,
    refOrderId: req.refOrderId,
    metadata: req.metadata,
  });
}

/**
 * Refund a prior spend. `clawbackCommissions` defaults to false for cteater
 * (platform eats the gap rather than forcing L1/L2 negative — see memory).
 * Caller must explicitly pass `true` to opt into clawback.
 */
export async function refund(req: RefundRequest): Promise<RefundResponse> {
  if (!isWalletLive()) {
    warnStub("refund");
    return {
      success: true,
      txId: `stub_refund_${Date.now()}`,
      balanceAfter: 0,
    };
  }
  return walletPost<RefundResponse>("/s2s/refund", {
    uid: req.uid,
    amount: req.amount,
    originalIdempotencyKey: req.originalIdempotencyKey,
    reason: req.reason,
    idempotencyKey: req.idempotencyKey,
    clawbackCommissions: req.clawbackCommissions ?? false,
  });
}

/**
 * Grant points without triggering commissions. Only used in the P2 corner
 * case where ECPay succeeded but our spend call failed (INSUFFICIENT_BALANCE /
 * frozen / etc.) — we still deliver the product and compensate the user the
 * points they expected to redeem.
 *
 * idempotencyKey MUST be prefixed with "GRANT_" to disambiguate from spend
 * keys. cteater uses `GRANT_{MerchantTradeNo}`.
 */
export async function grant(req: GrantRequest): Promise<GrantResponse> {
  if (req.amount <= 0 || !Number.isInteger(req.amount)) {
    throw new WalletError("INVALID_AMOUNT", "amount must be positive integer");
  }
  if (!req.idempotencyKey.startsWith("GRANT_")) {
    throw new WalletError(
      "INVALID_IDEMPOTENCY_KEY",
      "grant idempotencyKey must start with GRANT_",
    );
  }
  if (!isWalletLive()) {
    warnStub("grant");
    return { success: true, balanceAfter: 0 };
  }
  return walletPost<GrantResponse>("/s2s/grant", {
    uid: req.uid,
    amount: req.amount,
    reason: req.reason,
    idempotencyKey: req.idempotencyKey,
  });
}
