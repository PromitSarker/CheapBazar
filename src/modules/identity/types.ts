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
  /** /uploads/<file> path of the seller's logo (services path only) */
  logoUrl?: string | null;
  /** #rrggbb accent, always one of THEME_PRESETS */
  themeColor?: string | null;
  /** Where the shop is (services path). Shops opened before locations existed have none until the owner sets it. */
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  district?: string | null;
  hasLocation?: boolean;
}
