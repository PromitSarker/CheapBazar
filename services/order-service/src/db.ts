import { PrismaClient, Prisma } from "../generated/client";

export { Prisma };
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export type Runner = PrismaClient | Prisma.TransactionClient;

export function createDb(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
export async function withTx<T>(db: Runner, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in db) return (db as PrismaClient).$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  return fn(db as Tx);
}
export const num = (v: Prisma.Decimal | number | string | null | undefined) => (v == null ? 0 : Number(v));
export const round2 = (n: number) => Math.round(n * 100) / 100;
