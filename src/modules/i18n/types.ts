export type Language = "en" | "bn";

export interface Translations {
  // Navigation & Common
  brand: string;
  dashboard: string;
  adminPortal: string;
  exploreStores: string;
  login: string;
  logout: string;
  getStarted: string;
  createStore: string;
  footerText: string;

  // Landing Page
  heroBadge: string;
  heroHeading1: string;
  heroHeadingGradient: string;
  heroDesc: string;
  startForFree: string;
  viewDemo: string;
  creatorsSectionTitle: string;
  creatorsSectionSub: string;
  noStores: string;
  productsCount: string;

  // Storefront & Templates
  classicTagline: string;
  modernTagline: string;
  noProductsListed: string;
  soldOut: string;
  addToCart: string;
  onlyLeft: string;
  bag: string;
  cart: string;
  poweredBy: string;
  sponsored: string;
  featuredNotice: string;
  flashDealNotice: string;

  // Cart Drawer
  shoppingBag: string;
  emptyCartTitle: string;
  emptyCartSub: string;
  remove: string;
  each: string;
  subtotal: string;
  total: string;
  proceedToCheckout: string;
  reservingStock: string;
  stockHoldNotice: string;
  orderReservedTitle: string;
  orderReservedDesc: string;
  continueShopping: string;

  // Merchant Portal
  merchantPortal: string;
  overview: string;
  inventory: string;
  orders: string;
  walletLedger: string;
  adManager: string;
  settings: string;
  viewLiveStore: string;
  unitsInStock: string;
  lowStock: string;
  yourStoreLivesAt: string;
  usingTemplate: string;
  productsHeader: string;
  addProduct: string;
  productName: string;
  productDesc: string;
  priceTaka: string;
  stockQty: string;
  actions: string;

  // Wallet
  totalLedgerBalance: string;
  activeCodHolds: string;
  availableBalance: string;
  storeStatusEnforcer: string;
  topUpBalance: string;
  softThresholdLabel: string;
  hardThresholdLabel: string;
  doubleEntryTransactions: string;

  // Orders
  orderManagement: string;
  orderManagementSub: string;
  orderId: string;
  customer: string;
  items: string;
  paymentType: string;
  status: string;
  date: string;

  // Ads
  adManagerTitle: string;
  adManagerSub: string;
  availableAdInventory: string;
  bookSlot: string;
  bookNewCampaign: string;
  yourCampaigns: string;

  // Admin
  platformAdmin: string;
  platformAdminSub: string;
  registeredStores: string;
  activeStores: string;
  suspendedStores: string;
  catalogUnits: string;
  totalUsers: string;
  storeModerationKYC: string;
  adModeration: string;
  userRoleManagement: string;
  approve: string;
  reject: string;
  verified: string;
  pending: string;

  // Store Statuses
  statusActive: string;
  statusWarning: string;
  statusCodBlocked: string;
  statusPaused: string;
  statusDelisted: string;
  statusSuspended: string;
  statusBanned: string;
}
