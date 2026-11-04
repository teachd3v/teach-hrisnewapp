export type Role = 'employee' | 'admin' | 'super_admin';

/** Admin (HC) termasuk super admin. */
export const isAdmin = (role: Role) => role === 'admin' || role === 'super_admin';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
