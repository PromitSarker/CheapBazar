export type UserRole = "SELLER" | "BUYER" | "ADMIN" | "PRO_BUYER";

// Admin-only: nothing changes a store's status automatically (no balance thresholds).
export type StoreStatus = 
  | "ACTIVE" 
  | "SUSPENDED" 
  | "BANNED";

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface TenantResolution {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: StoreStatus;
  customDomain?: string | null;
  ownerId: string;
}
