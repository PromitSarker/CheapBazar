import { redirect } from "next/navigation";
import { getCurrentUser } from "./service";
import { prisma } from "@/lib/db";
import type { TenantResolution, StoreStatus } from "./types";

/** Retrieve the authenticated user's store */
export async function getCurrentStore(): Promise<TenantResolution | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const store = await prisma.store.findUnique({ where: { ownerId: user.id } });
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    template: store.template,
    status: store.status as StoreStatus,
    customDomain: store.customDomain,
    ownerId: store.ownerId,
  };
}

/** Require a store; redirects to onboarding if none exists */
export async function requireStore(): Promise<TenantResolution> {
  const store = await getCurrentStore();
  if (!store) redirect("/onboarding");
  return store;
}

/** Resolve tenant by store slug */
export async function resolveTenantBySlug(slug: string): Promise<TenantResolution | null> {
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    template: store.template,
    status: store.status as StoreStatus,
    customDomain: store.customDomain,
    ownerId: store.ownerId,
  };
}

/** Resolve tenant by custom domain (e.g. bakery.com) */
export async function resolveTenantByDomain(customDomain: string): Promise<TenantResolution | null> {
  const store = await prisma.store.findUnique({ where: { customDomain } });
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    template: store.template,
    status: store.status as StoreStatus,
    customDomain: store.customDomain,
    ownerId: store.ownerId,
  };
}
