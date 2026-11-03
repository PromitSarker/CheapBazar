import { PrismaClient, Prisma } from "../generated/client";

export { Prisma };
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export function createDb(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
