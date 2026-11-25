import { supabaseAdmin } from "@/lib/supabase-admin.server";

export type Scope =
    | "contacts:read"
    | "contacts:write"
    | "leads:read"
    | "deals:read"
    | "calls:read"
    | "calls:write";

export const ALL_SCOPES: Scope[] = [
    "contacts:read",
    "contacts:write",
    "leads:read",
    "deals:read",
    "calls:read",
    "calls:write",
];

export const READ_ONLY_SCOPES: Scope[] = [
    "contacts:read",
    "leads:read",
    "deals:read",
    "calls:read",
];

// Custom ApiError for standardized error handling
export class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message?: string) {
        super(message ?? code);
        this.status = status;
        this.code = code;
        this.name = "ApiError";
    }
}

// Format error into standardized JSON response { "error": { "code", "message" } }
export function apiError(error: unknown, fallbackStatus = 500): Response {
    if (error instanceof ApiError) {
        return new Response(
            JSON.stringify({
                error: {
                    code: error.code,
                    message: error.message,
                },
            }),
            {
                status: error.status,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                },
            }
        );
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
        JSON.stringify({
            error: {
                code: "internal_error",
                message,
            },
        }),
        {
            status: fallbackStatus,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
            },
        }
    );
}

// JSON helper that always sets application/json and no-store
export function json<T>(data: T, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}

// SHA-256 hash helper
export async function hashApiKey(key: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison to avoid timing attacks
export function constantTimeStringEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

// Generate a random Base62 raw API key (e.g. yk_live_xxxxxxxx...)
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function generateRawApiKey(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    let randomString = "";
    for (let i = 0; i < randomBytes.length; i++) {
        randomString += BASE62_CHARS[randomBytes[i] % 62];
    }
    return `yk_live_${randomString}`;
}

// In-memory rate limiting map per server instance (fixed 60-second window, 60 req/min)
interface RateLimitWindow {
    count: number;
    resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitWindow>();

export function checkRateLimit(
    keyId: string,
    limit = 60,
    windowMs = 60_000
): { allowed: boolean; limit: number; remaining: number } {
    const now = Date.now();
    const current = rateLimitMap.get(keyId);

    if (!current || now >= current.resetAt) {
        rateLimitMap.set(keyId, { count: 1, resetAt: now + windowMs });
        return { allowed: true, limit, remaining: limit - 1 };
    }

    if (current.count >= limit) {
        return { allowed: false, limit, remaining: 0 };
    }

    current.count += 1;
    return { allowed: true, limit, remaining: limit - current.count };
}

// Reset helper used in test cases
export function resetRateLimits(): void {
    rateLimitMap.clear();
}

// Cache to debounce last_used_at updates (at most once per minute per key)
const lastUsedCache = new Map<string, number>();

export interface AuthContext {
    organizationId: string;
    keyId: string;
    scopes: Scope[];
    rateLimit: {
        limit: number;
        remaining: number;
    };
}

/**
 * Authenticates an incoming request using a Bearer API key.
 * Used by all /api/v1/* endpoints and shared with #6 (Tejaswini's MCP server).
 */
export async function authenticateApiKey(
    request: Request,
    required: Scope
): Promise<AuthContext> {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new ApiError(401, "unauthorized", "Missing or malformed Authorization header");
    }

    const rawKey = authHeader.slice("Bearer ".length).trim();
    if (!rawKey.startsWith("yk_live_")) {
        throw new ApiError(401, "unauthorized", "Invalid API key format");
    }

    const computedHash = await hashApiKey(rawKey);

    // Look up key in DB
    const { data: keyRecord, error } = await supabaseAdmin
        .from("api_keys")
        .select("id, organization_id, key_hash, scopes, revoked_at")
        .eq("key_hash", computedHash)
        .is("revoked_at", null)
        .maybeSingle();

    if (error || !keyRecord) {
        throw new ApiError(401, "unauthorized", "Invalid or revoked API key");
    }

    // Constant-time check on hash
    if (!constantTimeStringEqual(computedHash, keyRecord.key_hash)) {
        throw new ApiError(401, "unauthorized", "Invalid or revoked API key");
    }

    // Scope check
    const scopes = (keyRecord.scopes ?? []) as Scope[];
    if (!scopes.includes(required)) {
        throw new ApiError(403, "forbidden", `This key lacks the ${required} scope`);
    }

    // Rate limit check (60 req/minute per key)
    const rateLimit = checkRateLimit(keyRecord.id, 60, 60_000);
    if (!rateLimit.allowed) {
        throw new ApiError(429, "rate_limited", "Rate limit exceeded (60 requests per minute)");
    }

    // Update last_used_at at most once per minute (fire-and-forget)
    const now = Date.now();
    const lastUpdated = lastUsedCache.get(keyRecord.id) ?? 0;
    if (now - lastUpdated > 60_000) {
        lastUsedCache.set(keyRecord.id, now);
        Promise.resolve(
            supabaseAdmin
                .from("api_keys")
                .update({ last_used_at: new Date(now).toISOString() })
                .eq("id", keyRecord.id)
        ).catch(() => { });
    }

    return {
        organizationId: keyRecord.organization_id,
        keyId: keyRecord.id,
        scopes,
        rateLimit,
    };
}