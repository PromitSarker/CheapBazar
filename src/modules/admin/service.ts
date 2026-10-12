import { prisma } from "@/lib/db";
import { requireRole } from "@/modules/identity/service";
import type { StoreStatus, UserRole } from "@/modules/identity/types";

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
  await requireRole("ADMIN");
  return prisma.store.update({
    where: { id: storeId },
    data: {
      status: status as any,
      ...(typeof kycVerified === "boolean" ? { kycVerified } : {}),
    },
  });
}

export async function getAllUsersForAdmin() {
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
  await requireRole("ADMIN");
  return prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
  });
}
