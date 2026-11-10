import { prisma } from "@/lib/db";
import { requireRole } from "@/modules/identity/service";
import type { StoreStatus, UserRole } from "@/modules/identity/types";
import { servicesEnabled } from "@/lib/bff/client";
import {
  adminStatsViaServices, allStoresViaServices, setStoreStatusViaServices, setStoreKycViaServices,
  allUsersViaServices, setUserRoleViaServices,
} from "@/lib/bff/admin";

export interface AdminStats {
  totalStores: number;
  activeStores: number;
  suspendedStores: number;
  totalProducts: number;
  totalUsers: number;
  sellersCount: number;
  buyersCount: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  if (servicesEnabled()) return adminStatsViaServices();
  await requireRole("ADMIN");
  
  const [
    totalStores,
    activeStores,
    suspendedStores,
    totalProducts,
    totalUsers,
    sellersCount,
    buyersCount,
  ] = await Promise.all([
    prisma.store.count(),
    prisma.store.count({ where: { status: "ACTIVE" } }),
    prisma.store.count({ where: { status: { in: ["SUSPENDED", "BANNED", "PAUSED"] } } }),
    prisma.product.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: "SELLER" } }),
    prisma.user.count({ where: { role: "BUYER" } }),
  ]);

  return {
    totalStores,
    activeStores,
    suspendedStores,
    totalProducts,
    totalUsers,
    sellersCount,
    buyersCount,
  };
}

export async function getAllStoresForAdmin() {
  if (servicesEnabled()) return allStoresViaServices();
  await requireRole("ADMIN");
  return prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { products: true } },
    },
  });
}

export async function updateStoreStatusByAdmin(
  storeId: string,
  status: StoreStatus,
  kycVerified?: boolean
) {
  if (servicesEnabled()) return setStoreStatusViaServices(storeId, status, kycVerified);
  await requireRole("ADMIN");
  return prisma.store.update({
    where: { id: storeId },
    data: {
      status: status as any,
      ...(typeof kycVerified === "boolean" ? { kycVerified } : {}),
    },
  });
}

/** KYC only. (The monolith's toggle also forced the status back to ACTIVE; the services path does not.) */
export async function setStoreKycByAdmin(storeId: string, kycVerified: boolean) {
  if (servicesEnabled()) return setStoreKycViaServices(storeId, kycVerified);
  return updateStoreStatusByAdmin(storeId, "ACTIVE", kycVerified);
}

export async function getAllUsersForAdmin() {
  if (servicesEnabled()) return allUsersViaServices();
  await requireRole("ADMIN");
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      store: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}

export async function updateUserRoleByAdmin(userId: string, role: UserRole) {
  if (servicesEnabled()) return setUserRoleViaServices(userId, role);
  await requireRole("ADMIN");
  return prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
  });
}
