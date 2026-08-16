import jwt from "jsonwebtoken";

const SIGNING_TOKEN_TTL_SECONDS = 48 * 60 * 60; // 48h

export type SigningTokenSubjectType = "contract" | "annex" | "photo_request";

export interface SigningTokenPayload {
  subjectId: string;
  subjectType: SigningTokenSubjectType;
}

function getSecret(): string {
  const secret = process.env.SIGNING_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing required env var: SIGNING_TOKEN_SECRET");
  }
  return secret;
}

/**
 * Generira jednokratan JWT signing token (48h expiry). Token se ujedno
 * sprema u DB (Contract.signingToken / Annex.signingToken) - stvarna
 * jednokratnost se provjerava usporedbom s tom vrijednosti, jer sam JWT
 * ostaje kriptografski validan do isteka i nakon što je "iskorišten".
 */
export function generateSigningToken(payload: SigningTokenPayload): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(Date.now() + SIGNING_TOKEN_TTL_SECONDS * 1000);
  const token = jwt.sign(payload, getSecret(), {
    expiresIn: SIGNING_TOKEN_TTL_SECONDS,
  });
  return { token, expiresAt };
}

export type SigningTokenVerifyResult =
  | { valid: true; payload: SigningTokenPayload }
  | { valid: false; reason: "expired" | "invalid" };

export function verifySigningToken(token: string): SigningTokenVerifyResult {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "subjectId" in decoded &&
      "subjectType" in decoded
    ) {
      return {
        valid: true,
        payload: {
          subjectId: String((decoded as Record<string, unknown>).subjectId),
          subjectType: (decoded as Record<string, unknown>)
            .subjectType as SigningTokenSubjectType,
        },
      };
    }
    return { valid: false, reason: "invalid" };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { valid: false, reason: "expired" };
    }
    return { valid: false, reason: "invalid" };
  }
}
