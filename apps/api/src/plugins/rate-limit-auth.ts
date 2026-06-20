import type { FastifyRequest, FastifyReply } from "fastify";

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function envNum(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? NaN);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function isRateLimitEnabled(): boolean {
  return envBool("RATE_LIMIT_ENABLED", process.env.NODE_ENV !== "test");
}

export function rateLimitMaxAuth(): number {
  return envNum("RATE_LIMIT_MAX_AUTH", 10);
}

export function rateLimitWindowMs(): number {
  return envNum("RATE_LIMIT_WINDOW_MS", 60_000);
}

type Bucket = { count: number; resetAt: number };

const authBuckets = new Map<string, Bucket>();

function authClientKey(request: FastifyRequest): string {
  const ip = request.ip || "unknown";
  return `${ip}|auth`;
}

/** Limpa estado in-memory (somente testes). */
export function resetAuthRateLimitForTests(): void {
  authBuckets.clear();
}

export function createAuthRateLimitPreHandler() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isRateLimitEnabled()) return;

    const max = rateLimitMaxAuth();
    const windowMs = rateLimitWindowMs();
    const key = authClientKey(request);
    const now = Date.now();

    let bucket = authBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      authBuckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Limite de requisições excedido para esta rota.",
        route: request.url,
      });
    }
  };
}
