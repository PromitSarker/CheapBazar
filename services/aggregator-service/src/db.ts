import { PrismaClient, Prisma } from "../generated/client";

export { Prisma };
export type Db = PrismaClient;
export type Runner = PrismaClient | Prisma.TransactionClient;

export function createDb(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
