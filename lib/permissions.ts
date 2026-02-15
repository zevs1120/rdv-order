import { pool } from "./db";
import { requireAuth } from "./api-auth";
import type { AuthPayload } from "./auth";

export type Permission =
  | "order.create"
  | "order.return_item"
  | "order.cancel"
  | "order.adjust_charge"
  | "order.split_merge"
  | "order.delete"
  | "cashier.reverse_checkout"
  | "cashier.close_shift"
  | "kitchen.view"
  | "kitchen.update"
  | "kitchen.rush"
  | "report.orders"
  | "report.finance"
  | "report.ops"
  | "menu.manage"
  | "rbac.manage"
  | "device.view"
  | "device.manage";

const DEFAULT_PERMISSIONS: Record<AuthPayload["role"], Set<Permission>> = {
  waiter: new Set<Permission>([
    "order.create",
    "order.return_item",
    "kitchen.view",
    "kitchen.rush",
    "report.orders"
  ]),
  manager: new Set<Permission>([
    "order.create",
    "order.return_item",
    "order.cancel",
    "order.adjust_charge",
    "order.split_merge",
    "order.delete",
    "cashier.reverse_checkout",
    "cashier.close_shift",
    "kitchen.view",
    "kitchen.update",
    "kitchen.rush",
    "report.orders",
    "report.finance",
    "report.ops",
    "menu.manage",
    "rbac.manage",
    "device.view",
    "device.manage"
  ])
};

type CacheEntry = {
  fetchedAt: number;
  map: Map<string, boolean>;
};

const cacheByRole = new Map<AuthPayload["role"], CacheEntry>();
const CACHE_TTL_MS = 30_000;

async function getRoleOverrides(role: AuthPayload["role"]) {
  const cached = cacheByRole.get(role);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.map;
  }

  const { rows } = await pool.query<{ permission: string; allowed: boolean }>(
    `SELECT permission, allowed
     FROM role_permissions
     WHERE role = $1`,
    [role]
  );

  const next = new Map<string, boolean>();
  for (const row of rows) {
    next.set(row.permission, row.allowed);
  }
  cacheByRole.set(role, { fetchedAt: now, map: next });
  return next;
}

export async function hasPermission(role: AuthPayload["role"], permission: Permission) {
  const base = DEFAULT_PERMISSIONS[role].has(permission);
  const overrides = await getRoleOverrides(role);
  if (!overrides.has(permission)) return base;
  return Boolean(overrides.get(permission));
}

export async function requirePermission(req: Request, permission: Permission) {
  const auth = await requireAuth(req, ["waiter", "manager"]);
  const ok = await hasPermission(auth.role, permission);
  if (!ok) {
    throw new Error("FORBIDDEN");
  }
  return auth;
}

export function clearPermissionCache() {
  cacheByRole.clear();
}
