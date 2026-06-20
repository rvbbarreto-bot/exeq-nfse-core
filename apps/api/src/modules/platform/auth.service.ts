import bcrypt from "bcryptjs";
import { getMigrationDb, type DbPool } from "../../db/client.js";

export type AuthUser = {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  roles: string[];
};

export async function authenticateUser(
  email: string,
  password: string,
  db: DbPool = getMigrationDb(),
): Promise<AuthUser | null> {
  return db.begin(async (tx) => {
    await tx`SELECT set_config('app.bypass_rls', 'true', true)`;

    const users = await tx<
      { id: string; tenant_id: string; email: string; name: string; password_hash: string }[]
    >`
      SELECT id, tenant_id, email, name, password_hash
      FROM exeq_core.users
      WHERE email = ${email} AND is_active = true
      LIMIT 1
    `;

    const user = users[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return null;

    const roles = await tx<{ code: string }[]>`
      SELECT r.code
      FROM exeq_core.user_roles ur
      INNER JOIN exeq_core.roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${user.id}::uuid
    `;

    return {
      id: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      name: user.name,
      roles: roles.map((r) => r.code),
    };
  }) as Promise<AuthUser | null>;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
