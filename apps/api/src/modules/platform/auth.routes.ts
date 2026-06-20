import type { FastifyInstance } from "fastify";
import { loginRequestSchema } from "@exeq/shared";
import { authenticateUser } from "./auth.service.js";
import { createAuthRateLimitPreHandler } from "../../plugins/rate-limit-auth.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authRateLimit = createAuthRateLimitPreHandler();

  app.post("/v1/auth/login", { preHandler: [authRateLimit] }, async (request, reply) => {
    const body = loginRequestSchema.parse(request.body);
    const user = await authenticateUser(body.email, body.password);

    if (!user) {
      return reply.code(401).send({
        error: "INVALID_CREDENTIALS",
        message: "Email ou senha invalidos",
      });
    }

    const accessToken = await reply.jwtSign({
      sub: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      roles: user.roles,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      tenant_id: user.tenant_id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
      },
    };
  });
}
