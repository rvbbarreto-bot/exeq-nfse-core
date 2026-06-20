import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Perfis que podem criar/alterar master data, cobranças e ações operacionais. */
export const WRITE_ROLES = ["tenant_admin", "operator"] as const;

/** Perfis que podem emitir NFS-e. */
export const EMIT_ROLES = ["tenant_admin", "operator", "accountant"] as const;

/** Perfis com governança fiscal (publicar catálogo). */
export const ADMIN_ROLES = ["tenant_admin"] as const;

export function hasAnyRole(userRoles: string[], allowed: readonly string[]): boolean {
  return userRoles.some((role) => allowed.includes(role));
}

export function requireRoles(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userRoles = request.user?.roles ?? [];
    if (!hasAnyRole(userRoles, allowedRoles)) {
      return reply.code(403).send({
        error: "FORBIDDEN",
        message: "Perfil sem permissao para este recurso",
      });
    }
  };
}

export function registerRbacHooks(app: FastifyInstance): void {
  app.decorate("requireRoles", requireRoles);
}

declare module "fastify" {
  interface FastifyInstance {
    requireRoles: typeof requireRoles;
  }
}
