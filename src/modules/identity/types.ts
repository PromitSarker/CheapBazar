export type UserRole = "SELLER" | "BUYER" | "ADMIN" | "PRO_BUYER";

export type StoreStatus = 
  | "ACTIVE" 
  | "WARNING" 
  | "COD_BLOCKED" 
  | "PAUSED" 
  | "DELISTED" 
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
