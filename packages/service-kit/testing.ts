/** Helpers for service integration tests. Refuses to touch non-local databases. */
import { execSync } from "child_process";

export function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to run tests against non-local database host "${host}"`);
  }
}

/** Drop + recreate a database on the local server, then `prisma db push` the schema into it. */
export async function resetDatabase(adminUrl: string, dbName: string, schemaPath: string, createClient: (url: string) => any) {
  assertLocal(adminUrl);
  const admin = createClient(adminUrl);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();
  const url = adminUrl.replace(/\/[^/]*$/, `/${dbName}`);
  execSync(`npx prisma db push --skip-generate --schema ${schemaPath}`, {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return url;
}
