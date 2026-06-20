import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      tenant_id: string;
      email: string;
      roles: string[];
    };
    user: {
      sub: string;
      tenant_id: string;
      email: string;
      roles: string[];
    };
  }
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "UNAUTHORIZED", message: "Token invalido ou ausente" });
  }
}

export function registerAuthHooks(app: FastifyInstance): void {
  app.decorate("authenticate", authGuard);
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authGuard;
  }
}
