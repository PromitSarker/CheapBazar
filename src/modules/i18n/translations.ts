import type { Language, Translations } from "./types";

export const bengaliDigits: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
};

export function toBengaliNumerals(val: number | string): string {
  return String(val).replace(/[0-9]/g, (digit) => bengaliDigits[digit] || digit);
}

export function formatTaka(amount: number, lang: Language = "en"): string {
  const formattedNumber = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (lang === "bn") {
    return `৳ ${toBengaliNumerals(formattedNumber)}`;
  }
  return `৳ ${formattedNumber}`;
}

export const translations: Record<Language, Translations> = {
  en: {
    // Navigation & Common
    brand: "Cheap-Bazar",
    dashboard: "Merchant Dashboard",
    adminPortal: "Admin Back-Office",
    exploreStores: "Explore Stores",
    login: "Log in",
    logout: "Log out",
    getStarted: "Get Started",
    createStore: "Create your store",
    footerText: "Multi-tenant marketplace scaffold — Phase 1: store creation + inventory.",

    // Landing Page
    heroBadge: "Cheap-Bazar 2.0 is now live",
    heroHeading1: "Your storefront,",
    heroHeadingGradient: "reimagined.",
    heroDesc: "Spin up a fully managed ecommerce platform in seconds. No code, zero configuration. We handle the design, payments, and infrastructure so you can focus on selling in Bangladeshi Taka.",
    startForFree: "Start for free",
    viewDemo: "View demo",
    creatorsSectionTitle: "Loved by modern creators",
    creatorsSectionSub: "Discover what others are building with Cheap-Bazar.",
    noStores: "No stores yet. Be the first.",
    productsCount: "products",

    // Storefront & Templates
    classicTagline: "Freshly made, honestly priced.",
    modernTagline: "New drops, restocked weekly.",
    noProductsListed: "This store hasn't listed any products yet.",
    soldOut: "Sold out",
    addToCart: "Add to cart",
    onlyLeft: "Only {count} left",
    bag: "Bag",
    cart: "Cart",
    poweredBy: "Powered by Cheap-Bazar",
    sponsored: "Sponsored",
    featuredNotice: "Enjoy free local delivery across Dhaka on orders over ৳ 500!",
    flashDealNotice: "Verified Direct Merchant • Rapid 24hr Cash on Delivery across Bangladesh",

    // Cart Drawer
    shoppingBag: "Shopping Bag",
    emptyCartTitle: "Your cart is empty",
    emptyCartSub: "Add items from the store to begin checkout.",
    remove: "Remove",
    each: "each",
    subtotal: "Subtotal",
    total: "Total",
    proceedToCheckout: "Proceed to Checkout",
    reservingStock: "Reserving stock...",
    stockHoldNotice: "🔒 15-minute stock reservation locked at checkout",
    orderReservedTitle: "Order Reserved!",
    orderReservedDesc: "Your order has been created with stock held for 15 minutes.",
    continueShopping: "Continue Shopping",

    // Merchant Portal
    merchantPortal: "Merchant Portal",
    overview: "Overview",
    inventory: "Inventory",
    orders: "Orders",
    walletLedger: "Wallet & Ledger",
    adManager: "Ad Manager",
    settings: "Settings",
    viewLiveStore: "View live store ↗",
    unitsInStock: "Units in stock",
    lowStock: "Low stock (< 5)",
    yourStoreLivesAt: "Your store lives at",
    usingTemplate: "using the template",
    productsHeader: "Product Inventory",
    addProduct: "Add Product",
    productName: "Product Name",
    productDesc: "Description",
    priceTaka: "Price (৳ BDT)",
    stockQty: "Stock Quantity",
    actions: "Actions",

    // Wallet
    totalLedgerBalance: "Total Ledger Balance",
    activeCodHolds: "Active COD Holds",
    availableBalance: "Available Balance (Total - Holds)",
    storeStatusEnforcer: "Store Status Enforcer",
    topUpBalance: "+ Top Up Balance",
    softThresholdLabel: "Soft Threshold (৳ 500.00)",
    hardThresholdLabel: "Hard Threshold (৳ 200.00)",
    doubleEntryTransactions: "Double-Entry Ledger Transactions",

    // Orders
    orderManagement: "Order Management",
    orderManagementSub: "Track incoming buyer orders, stock allocations, and fulfillment states.",
    orderId: "Order ID",
    customer: "Customer",
    items: "Items",
    paymentType: "Payment Type",
    status: "Status",
    date: "Date",

    // Ads
    adManagerTitle: "Sponsored Ads Manager",
    adManagerSub: "Book targeted ad slots, increase storefront visibility, and manage sponsored banners.",
    availableAdInventory: "Available Ad Inventory",
    bookSlot: "Book Slot",
    bookNewCampaign: "Book a New Ad Campaign",
    yourCampaigns: "Your Campaigns",

    // Admin
    platformAdmin: "Platform Administration",
    platformAdminSub: "System-wide monitoring, compliance, store moderation, and platform health.",
    registeredStores: "Registered Stores",
    activeStores: "Active & Operational",
    suspendedStores: "Suspended / Paused Stores",
    catalogUnits: "Global Catalog Units",
    totalUsers: "Total Users",
    storeModerationKYC: "Store Moderation & KYC",
    adModeration: "Sponsored Ads Moderation",
    userRoleManagement: "User & Role Management",
    approve: "Approve",
    reject: "Reject",
    verified: "✅ Verified",
    pending: "⏳ Pending",

    // Store Statuses
    statusActive: "ACTIVE",
    statusWarning: "WARNING",
    statusCodBlocked: "COD_BLOCKED",
    statusPaused: "PAUSED",
    statusDelisted: "DELISTED",
    statusSuspended: "SUSPENDED",
    statusBanned: "BANNED",
  },
  bn: {
    // Navigation & Common
    brand: "চিপ-বাজার",
    dashboard: "বিক্রেতা ড্যাশবোর্ড",
    adminPortal: "অ্যাডমিন ব্যাক-অফিস",
    exploreStores: "দোকানগুলো ঘুরে দেখুন",
    login: "লগইন করুন",
    logout: "লগআউট",
    getStarted: "শুরু করুন",
    createStore: "আপনার দোকান তৈরি করুন",
    footerText: "মাল্টি-টেন্যান্ট মার্কেটপ্লেস — ফেজ ১: স্টোর তৈরি + পণ্য ইনভেন্টরি।",

    // Landing Page
    heroBadge: "চিপ-বাজার ২.০ এখন লাইভ",
    heroHeading1: "আপনার নিজস্ব ই-কমার্স স্টোর,",
    heroHeadingGradient: "নতুন আঙ্গিকে।",
    heroDesc: "কয়েক সেকেন্ডের মধ্যেই চালু করুন আপনার সম্পূর্ণ নিয়ন্ত্রিত অনলাইন মার্কেটপ্লেস। কোনো কোডিং বা ঝামেলা ছাড়াই বাংলাদেশী টাকায় পণ্য বিক্রি শুরু করুন।",
    startForFree: "ফ্রিতে শুরু করুন",
    viewDemo: "ডেমো দেখুন",
    creatorsSectionTitle: "আধুনিক উদ্যোক্তাদের প্রিয় পছন্দ",
    creatorsSectionSub: "চিপ-বাজারে অন্যান্য উদ্যোক্তারা কী তৈরি করছেন তা দেখুন।",
    noStores: "এখনো কোনো দোকান খোলা হয়নি। আপনিই প্রথম হোন।",
    productsCount: "টি পণ্য",

    // Storefront & Templates
    classicTagline: "তাজা ও সেরা মানের পণ্য, সাশ্রয়ী মূল্যে।",
    modernTagline: "নতুন পণ্যের সমাহার, প্রতি সপ্তাহে নতুন স্টক।",
    noProductsListed: "এই দোকানে এখনও কোনো পণ্য যুক্ত করা হয়নি।",
    soldOut: "স্টক শেষ",
    addToCart: "ব্যাগে যোগ করুন",
    onlyLeft: "মাত্র {count}টি বাকি আছে",
    bag: "ব্যাগ",
    cart: "কার্ট",
    poweredBy: "পরিচালিত: চিপ-বাজার",
    sponsored: "স্পন্সরড",
    featuredNotice: "ঢাকা শহরের যেকোনো অর্ডারে ৳ ৫০০ টাকার বেশি কিনলে ফ্রি ডেলিভারি!",
    flashDealNotice: "যাচাইকৃত সরাসরি বিক্রেতা • সারা বাংলাদেশে ২৪ ঘণ্টার মধ্যে ক্যাশ অন ডেলিভারি",

    // Cart Drawer
    shoppingBag: "শপিং ব্যাগ",
    emptyCartTitle: "আপনার ব্যাগ খালি",
    emptyCartSub: "অর্ডার করতে দোকান থেকে পণ্য যোগ করুন।",
    remove: "মুছে ফেলুন",
    each: "প্রতিটি",
    subtotal: "সাবটোটাল",
    total: "সর্বমোট",
    proceedToCheckout: "চেকআউট করুন",
    reservingStock: "স্টক সংরক্ষিত হচ্ছে...",
    stockHoldNotice: "🔒 চেকআউটে ১৫ মিনিটের জন্য স্টক সংরক্ষিত থাকবে",
    orderReservedTitle: "অর্ডার সংরক্ষিত হয়েছে!",
    orderReservedDesc: "আপনার অর্ডারটি সফলভাবে সংরক্ষিত হয়েছে এবং স্টক ১৫ মিনিট হোল্ডে থাকবে।",
    continueShopping: "আরও কেনাকাটা করুন",

    // Merchant Portal
    merchantPortal: "মার্চেন্ট পোর্টাল",
    overview: "সারসংক্ষেপ",
    inventory: "ইনভেন্টরি",
    orders: "অর্ডারসমূহ",
    walletLedger: "ওয়ালেট ও লেজার",
    adManager: "বিজ্ঞাপন ম্যানেজার",
    settings: "সেটিংস",
    viewLiveStore: "লাইভ স্টোর দেখুন ↗",
    unitsInStock: "মোট স্টক সংখ্যা",
    lowStock: "স্বল্প স্টক (< ৫)",
    yourStoreLivesAt: "আপনার দোকানের ঠিকানা:",
    usingTemplate: "ব্যবহৃত টেমপ্লেট:",
    productsHeader: "পণ্য ইনভেন্টরি",
    addProduct: "নতুন পণ্য যোগ করুন",
    productName: "পণ্যের নাম",
    productDesc: "বিবরণ",
    priceTaka: "মূল্য (৳ টাকা)",
    stockQty: "স্টক সংখ্যা",
    actions: "অ্যাকশন",

    // Wallet
    totalLedgerBalance: "মোট লেজার ব্যালেন্স",
    activeCodHolds: "সক্রিয় সিওডি হোল্ড",
    availableBalance: "ব্যবহারযোগ্য ব্যালেন্স (মোট - হোল্ড)",
    storeStatusEnforcer: "স্টোর স্ট্যাটাস এনফোর্সার",
    topUpBalance: "+ ব্যালেন্স টপ-আপ",
    softThresholdLabel: "সফট থ্রেশহোল্ড (৳ ৫০০.০০)",
    hardThresholdLabel: "হার্ড থ্রেশহোল্ড (৳ ২০০.০০)",
    doubleEntryTransactions: "ডাবল-এন্ট্রি লেজার লেনদেন",

    // Orders
    orderManagement: "অর্ডার ব্যবস্থাপনা",
    orderManagementSub: "ক্রেতাদের অর্ডার, স্টক বরাদ্দ এবং ডেলিভারি স্থিতি পর্যবেক্ষণ করুন।",
    orderId: "অর্ডার আইডি",
    customer: "ক্রেতার নাম",
    items: "পণ্যসমূহ",
    paymentType: "পেমেন্ট মাধ্যম",
    status: "স্থিতি",
    date: "তারিখ",

    // Ads
    adManagerTitle: "স্পন্সরড বিজ্ঞাপন ম্যানেজার",
    adManagerSub: "টার্গেটেড বিজ্ঞাপন স্লট বুক করুন, দোকানে বেশি ক্রেতা আনুন এবং ব্যানার প্রচার করুন।",
    availableAdInventory: "বিজ্ঞাপনের ফাঁকা স্লটসমূহ",
    bookSlot: "স্লট বুক করুন",
    bookNewCampaign: "নতুন বিজ্ঞাপন প্রচার করুন",
    yourCampaigns: "আপনার চলমান বিজ্ঞাপন",

    // Admin
    platformAdmin: "প্ল্যাটফর্ম প্রশাসন",
    platformAdminSub: "সিস্টেম মনিটরিং, নিয়মকানুন যাচাই, স্টোর মডারেশন এবং প্ল্যাটফর্মের স্বাস্থ্য।",
    registeredStores: "নিবন্ধিত দোকান",
    activeStores: "সক্রিয় ও সচল দোকান",
    suspendedStores: "স্থগিত বা বন্ধ দোকান",
    catalogUnits: "সর্বমোট তালিকাভুক্ত পণ্য",
    totalUsers: "মোট ব্যবহারকারী",
    storeModerationKYC: "দোকান মডারেশন ও কেওয়াইসি",
    adModeration: "বিজ্ঞাপন অনুমোদন",
    userRoleManagement: "ব্যবহারকারী ও রোল ব্যবস্থাপনা",
    approve: "অনুমোদন করুন",
    reject: "বাতিল করুন",
    verified: "✅ যাচাইকৃত",
    pending: "⏳ অপেক্ষমাণ",

    // Store Statuses
    statusActive: "সক্রিয়",
    statusWarning: "সতর্কতা",
    statusCodBlocked: "সিওডি বন্ধ",
    statusPaused: "বিরতিপ্রাপ্ত",
    statusDelisted: "তালিকাচ্যুত",
    statusSuspended: "স্থগিত",
    statusBanned: "নিষিদ্ধ",
  },
};
