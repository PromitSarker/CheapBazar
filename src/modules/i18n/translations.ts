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
    heroBadge: "Cheap-Bazar 2.0 • The Modern E-Commerce Platform for Bangladesh",
    heroHeading1: "Create your online store in minutes.",
    heroHeadingGradient: "Sell across Bangladesh in ৳ Taka.",
    heroDesc: "The all-in-one multi-tenant e-commerce platform. Zero code, instant storefronts, bKash & COD ready, double-entry wallet, and built-in ad boosts for modern creators and businesses.",
    heroSubtitle2: "No coding required. Instant subdomains & custom domains, automated double-entry ledger, bKash & COD ready, and built-in ad boosts for creators.",
    startForFree: "Create Your Store (Free)",
    viewDemo: "Explore Live Stores",
    noCreditCard: "No credit card required • Instant setup • 100% Free starter tier",
    creatorsSectionTitle: "Loved by modern creators & brands",
    creatorsSectionSub: "Discover live storefronts already thriving on Cheap-Bazar.",
    noStores: "No stores yet. Be the first to launch!",
    productsCount: "products",
    visitStore: "Visit Store ↗",

    // Trust Stats
    statVolumeVal: "৳ 150K+",
    statVolumeLabel: "Daily GMV Processed",
    statSetupVal: "60 Sec",
    statSetupLabel: "Average Store Launch",
    statFreeVal: "0% Free",
    statFreeLabel: "Forever Starter Plan",
    statNationwideVal: "64 Districts",
    statNationwideLabel: "Nationwide COD Ready",

    // Interactive Preview
    previewStoreName: "Dhaka Artisan Bakery",
    previewStoreTagline: "Handcrafted fresh sourdough & buttery croissants daily in Dhaka.",
    previewItem1: "Sourdough Artisan Loaf",
    previewItem2: "French Butter Croissant",
    previewClassic: "Classic Template",
    previewModern: "Modern Template",
    previewCartReserved: "🔒 15-Min Stock Reservation Active",

    // Core Features / Bento
    featuresHeading: "Everything you need to sell across Bangladesh",
    featuresSub: "Engineered specifically for local merchants, wholesale suppliers, and fast-growing brands.",
    feat1Title: "Instant Multi-Tenant Storefronts",
    feat1Desc: "Get a dedicated storefront with a unique slug or connect your custom .com / .com.bd domain with automated edge SSL routing.",
    feat2Title: "Dual Retail & Wholesale Engine",
    feat2Desc: "Offer consumer retail pricing alongside bulk wholesale rates with Minimum Order Quantities (MOQ) for high-volume B2B buyers.",
    feat3Title: "bKash, Nagad & Cash on Delivery",
    feat3Desc: "Accept instant mobile payments or fulfill nationwide Cash on Delivery with automated wallet hold mechanics and courier reconciliation.",
    feat4Title: "Double-Entry Immutable Ledger",
    feat4Desc: "Bank-grade financial bookkeeping. Every credit, debit, hold, platform fee, and withdrawal is securely recorded with tenant RLS isolation.",
    feat5Title: "Ad Manager & Sponsored Slots",
    feat5Desc: "Boost your store visibility across the marketplace. Book sponsored banner placements and top catalog search slots directly.",
    feat6Title: "Smart 15-Minute Stock Holds",
    feat6Desc: "Eliminate overselling and duplicate bookings. Stock is automatically reserved for 15 minutes during checkout to protect inventory.",

    // How It Works
    howItWorksHeading: "Launch your business in 3 simple steps",
    howItWorksSub: "Start selling today with zero technical expertise.",
    step1Title: "1. Create Account & Pick Template",
    step1Desc: "Sign up in 30 seconds and select either our clean Classic or vibrant Modern storefront design.",
    step2Title: "2. Add Products in Bangladeshi Taka (৳)",
    step2Desc: "Upload photos, set retail and bulk wholesale rates, and track live stock counts with low-inventory alerts.",
    step3Title: "3. Share Your Link & Receive Orders",
    step3Desc: "Share your storefront across Facebook, Instagram, or WhatsApp. Fulfill orders and withdraw profits to your bank or bKash.",

    // Pricing
    pricingHeading: "Transparent pricing in Bangladeshi Taka",
    pricingSub: "Choose the plan that fits your business scale. Upgrade or cancel anytime.",
    planStarterName: "Starter",
    planStarterPrice: "৳ 0",
    planStarterPeriod: "/ forever free",
    planStarterDesc: "Perfect for independent artisans, home bakers, and new online ventures.",
    planGrowthName: "Pro Growth",
    planGrowthPrice: "৳ 999",
    planGrowthPeriod: "/ month",
    planGrowthDesc: "For established merchants and wholesale suppliers needing custom domains and zero fees.",
    planGrowthBadge: "Most Popular",
    planEnterpriseName: "Enterprise",
    planEnterprisePrice: "৳ 2,499",
    planEnterprisePeriod: "/ month",
    planEnterpriseDesc: "For retail chains and large distributors requiring multi-staff access and dedicated support.",
    choosePlan: "Choose Plan",

    // Testimonials
    testimonialsHeading: "Trusted by Bangladeshi Merchants",
    testimonialsSub: "Hear how creators and businesses are accelerating their revenue with Cheap-Bazar.",

    // FAQ
    faqHeading: "Frequently Asked Questions",
    faqSub: "Everything you need to know about setting up your online store on Cheap-Bazar.",

    // Final CTA
    finalCtaHeading: "Ready to take your business online?",
    finalCtaSub: "Join hundreds of merchants selling across Bangladesh. Start your free store in under a minute.",
    finalCtaButton: "Create Your Store Now",

    // Footer
    footerAbout: "The next-generation multi-tenant e-commerce platform built for Bangladeshi merchants, wholesale suppliers, and fast-growing brands.",
    footerPlatform: "Platform",
    footerMerchants: "Merchants",
    footerSecurity: "Security & Trust",
    footerMadeWith: "Made with ❤️ in Bangladesh. All transactions processed in Bangladeshi Taka (৳ BDT).",

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
    heroBadge: "চিপ-বাজার ২.০ • বাংলাদেশের আধুনিক ই-কমার্স প্ল্যাটফর্ম",
    heroHeading1: "কয়েক মিনিটেই তৈরি করুন নিজস্ব অনলাইন স্টোর।",
    heroHeadingGradient: "সারা বাংলাদেশে বিক্রি করুন টাকায় (৳)।",
    heroDesc: "উদ্যোক্তাদের জন্য অল-ইন-ওয়ান মাল্টি-টেন্যান্ট ই-কমার্স প্ল্যাটফর্ম। কোনো কোডিং ছাড়াই তাৎক্ষণিক স্টোরফ্রন্ট, বিকাশ ও ক্যাশ অন ডেলিভারি, ডাবল-এন্ট্রি ওয়ালেট এবং স্পন্সরড বুস্ট।",
    heroSubtitle2: "কোনো কোডিং প্রয়োজন নেই। তাৎক্ষণিক সাবডোমেন ও কাস্টম ডোমেন, স্বয়ংক্রিয় ডাবল-এন্ট্রি লেজার, বিকাশ ও ক্যাশ অন ডেলিভারি এবং অন্তর্নির্মিত বিজ্ঞাপন বুস্ট।",
    startForFree: "ফ্রিতে দোকান তৈরি করুন",
    viewDemo: "লাইভ স্টোরগুলো দেখুন",
    noCreditCard: "কোনো ক্রেডিট কার্ড লাগবে না • তাৎক্ষণিক অ্যাক্টিভেশন • সম্পূর্ণ ফ্রি স্টার্টার প্ল্যান",
    creatorsSectionTitle: "আধুনিক উদ্যোক্তা ও ব্র্যান্ডের বিশ্বস্ত পছন্দ",
    creatorsSectionSub: "চিপ-বাজারে সফলভাবে পরিচালিত লাইভ স্টোরফ্রন্টগুলো ঘুরে দেখুন।",
    noStores: "এখনো কোনো দোকান খোলা হয়নি। আপনিই প্রথম শুরু করুন!",
    productsCount: "টি পণ্য",
    visitStore: "দোকান ভিজিট করুন ↗",

    // Trust Stats
    statVolumeVal: "৳ ১,৫০,০০০+",
    statVolumeLabel: "দৈনিক লেনদেন",
    statSetupVal: "৬০ সেকেন্ড",
    statSetupLabel: "স্টোর চালুর গড় সময়",
    statFreeVal: "০% ফ্রি",
    statFreeLabel: "চিরতরে ফ্রি স্টার্টার টিয়ার",
    statNationwideVal: "৬৪ জেলা",
    statNationwideLabel: "সারা দেশে ক্যাশ অন ডেলিভারি",

    // Interactive Preview
    previewStoreName: "ঢাকা কারিগর বেকারি",
    previewStoreTagline: "প্রতিদিন তাজা কাঠকয়লার চুলোয় তৈরি সোয়ার্ডো পাউরুটি ও বাটার ক্রস্যান্ট।",
    previewItem1: "আর্টিসান সোয়ার্ডো রুটি",
    previewItem2: "ফ্রেঞ্চ বাটার ক্রস্যান্ট",
    previewClassic: "ক্লাসিক টেমপ্লেট",
    previewModern: "মডার্ন টেমপ্লেট",
    previewCartReserved: "🔒 ১৫ মিনিটের স্টক রিজার্ভেশন সক্রিয়",

    // Core Features / Bento
    featuresHeading: "বাংলাদেশে পণ্য বিক্রির সম্পূর্ণ সমাধান",
    featuresSub: "স্থানীয় ব্যবসায়ী, পাইকারি বিক্রেতা ও দ্রুত বর্ধনশীল ব্র্যান্ডের জন্য বিশেষভাবে প্রস্তুত।",
    feat1Title: "তাৎক্ষণিক মাল্টি-টেন্যান্ট স্টোরফ্রন্ট",
    feat1Desc: "পাবেন নিজস্ব স্টোর লিঙ্ক বা যুক্ত করুন আপনার নিজস্ব .com / .com.bd ডোমেন, সাথে স্বয়ংক্রিয় এজ SSL এনক্রিপশন।",
    feat2Title: "খুচরা ও পাইকারি ডাবল ইঞ্জিন",
    feat2Desc: "একই সাথে সাধারণ ক্রেতাদের জন্য খুচরা এবং বাল্ক বায়ারদের জন্য মিনিমাম অর্ডার কোয়ান্টিটিসহ (MOQ) পাইকারি মূল্য নির্ধারণ করুন।",
    feat3Title: "বিকাশ, নগদ ও ক্যাশ অন ডেলিভারি",
    feat3Desc: "মোবাইল ওয়ালেটে তাৎক্ষণিক পেমেন্ট নিন অথবা স্বয়ংক্রিয় লেজার হোল্ড ও কুরিয়ার রিকনসিলিয়েশনসহ সারা দেশে ক্যাশ অন ডেলিভারি দিন।",
    feat4Title: "নিরাপদ ডাবল-এন্ট্রি লেজার ও ওয়ালেট",
    feat4Desc: "ব্যাংক লেভেল স্বচ্ছ হিসাবরক্ষণ। প্রতিটি জমা, খরচ, রিফান্ড ও কমিশন নিখুঁতভাবে পোস্টগ্রেস RLS আইসোলেশনে সংরক্ষিত।",
    feat5Title: "বিজ্ঞাপন ম্যানেজার ও স্পন্সরড বুস্ট",
    feat5Desc: "মার্কেটপ্লেসে আপনার পণ্যের বিক্রি বাড়ান। সরাসরি ড্যাশবোর্ড থেকে স্পন্সরড ব্যানার ও টপ সার্চ স্লট বুক করুন।",
    feat6Title: "স্বয়ংক্রিয় ১৫ মিনিটের স্টক লক",
    feat6Desc: "অতিরিক্ত বুকিং বা স্টক বিভ্রাট প্রতিরোধ করুন। চেকআউট করার সময় স্বয়ংক্রিয়ভাবে ১৫ মিনিটের জন্য স্টক লক থাকে।",

    // How It Works
    howItWorksHeading: "৩টি সহজ ধাপে শুরু করুন আপনার ব্যবসা",
    howItWorksSub: "কোনো কারিগরি জ্ঞান ছাড়াই আজই পণ্য বিক্রি শুরু করুন।",
    step1Title: "১. অ্যাকাউন্ট খুলুন ও টেমপ্লেট বেছে নিন",
    step1Desc: "মাত্র ৩০ সেকেন্ডে সাইন আপ করে বেছে নিন পরিচ্ছন্ন ক্লাসিক অথবা আধুনিক ফ্যাশনেবল টেমপ্লেট।",
    step2Title: "২. পণ্য ও মূল্য যুক্ত করুন টাকায় (৳)",
    step2Desc: "ছবি আপলোড করুন, পণ্যের বিবরণ লিখুন এবং খুচরা ও পাইকারি দাম নির্ধারণ করুন।",
    step3Title: "৩. লিঙ্ক শেয়ার করুন ও অর্ডার গ্রহণ করুন",
    step3Desc: "ফেসবুক, ইনস্টাগ্রাম বা হোয়াটসঅ্যাপে লিঙ্ক শেয়ার করুন। ড্যাশবোর্ড থেকে অর্ডার ট্র্যাক করে টাকা তুলুন ব্যাংকে বা বিকাশে।",

    // Pricing
    pricingHeading: "স্বচ্ছ প্রাইসিং প্ল্যান — বাংলাদেশী টাকায়",
    pricingSub: "আপনার ব্যবসার পরিধি অনুযায়ী সঠিক প্ল্যান বেছে নিন। যেকোনো সময় আপগ্রেড বা বাতিল করতে পারবেন।",
    planStarterName: "প্রারম্ভিক (Starter)",
    planStarterPrice: "৳ ০",
    planStarterPeriod: "/ চিরতরে ফ্রি",
    planStarterDesc: "নতুন উদ্যোক্তা ও ঘরোয়া ব্যবসার জন্য উপযুক্ত।",
    planGrowthName: "প্রবৃদ্ধি (Growth)",
    planGrowthPrice: "৳ ৯৯৯",
    planGrowthPeriod: "/ মাস",
    planGrowthDesc: "প্রতিষ্ঠিত ব্র্যান্ড ও পাইকারি বিক্রেতাদের জন্য কাস্টম ডোমেন ও ০% প্ল্যাটফর্ম ফি।",
    planGrowthBadge: "সবচেয়ে জনপ্রিয়",
    planEnterpriseName: "প্রাতিষ্ঠানিক (Enterprise)",
    planEnterprisePrice: "৳ ২,৪৯৯",
    planEnterprisePeriod: "/ মাস",
    planEnterpriseDesc: "বৃহৎ রিটেইল চেইন ও পাইকারি ডিস্ট্রিবিউটরদের জন্য মাল্টি-স্টাফ ও সার্বক্ষণিক সাপোর্ট।",
    choosePlan: "প্ল্যান বেছে নিন",

    // Testimonials
    testimonialsHeading: "সফল বাংলাদেশী উদ্যোক্তাদের অভিজ্ঞতা",
    testimonialsSub: "জেনে নিন কীভাবে ব্যবসায়ীরা চিপ-বাজারের মাধ্যমে নিজেদের সেল ও প্রবৃদ্ধি বৃদ্ধি করছেন।",

    // FAQ
    faqHeading: "সাধারণ জিজ্ঞাসা (FAQ)",
    faqSub: "চিপ-বাজারে অনলাইন শপ চালু সংক্রান্ত প্রয়োজনীয় সব প্রশ্নের উত্তর।",

    // Final CTA
    finalCtaHeading: "আজই শুরু করুন আপনার অনলাইন শপ",
    finalCtaSub: "সারা বাংলাদেশের শত শত মার্চেন্টের সাথে যুক্ত হোন। মাত্র এক মিনিটে ফ্রিতে চালু করুন আপনার স্টোর।",
    finalCtaButton: "ফ্রিতে দোকান তৈরি করুন",

    // Footer
    footerAbout: "বাংলাদেশের উদ্যোক্তা ও পাইকারি ব্যবসায়ীদের জন্য নির্মিত পরবর্তী প্রজন্মের মাল্টি-টেন্যান্ট ই-কমার্স প্ল্যাটফর্ম।",
    footerPlatform: "প্ল্যাটফর্ম",
    footerMerchants: "মার্চেন্ট সুবিধা",
    footerSecurity: "নিরাপত্তা ও স্বচ্ছতা",
    footerMadeWith: "বাংলাদেশের ভালোবাসায় তৈরি ❤️ সব হিসাব বাংলাদেশী টাকায় (৳ BDT) পরিচালিত।",

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
