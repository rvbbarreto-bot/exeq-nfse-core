const TOKEN_KEY = "exeq_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUserRoles(): string[] {
  const token = getToken();
  if (!token) return [];
  const payload = decodeJwtPayload(token);
  const roles = payload?.roles;
  return Array.isArray(roles) ? roles.map(String) : [];
}

export function isAccountantOnly(): boolean {
  const roles = getUserRoles();
  return roles.includes("accountant") && !roles.includes("tenant_admin");
}

export function hasRole(role: string): boolean {
  return getUserRoles().includes(role);
}
