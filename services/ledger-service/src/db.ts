import { PrismaClient, Prisma } from "../generated/client";

export { Prisma };
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
/** Either the root client or an open transaction. */
export type Runner = PrismaClient | Prisma.TransactionClient;

export function createDb(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

/** Run `fn` in a transaction, or directly if we're already inside one. */
export async function withTx<T>(db: Runner, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
  }
  return fn(db as Tx);
}

export const D = (v: number | string | Prisma.Decimal): Prisma.Decimal => new Prisma.Decimal(v).toDecimalPlaces(2);
export const num = (v: Prisma.Decimal | number | string | null | undefined): number => (v == null ? 0 : Number(v));
