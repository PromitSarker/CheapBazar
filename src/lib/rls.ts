import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Run writes inside a transaction that sets Postgres
 * `app.tenant_id` (used by the RLS policies in sql/rls.sql).
 * App code still filters by storeId; this is defense-in-depth.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
