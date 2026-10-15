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
    footerText: "Made with ❤️ for every shopkeeper, seller, and shopper in Bangladesh.",

    // Landing Page
    heroBadge: "🇧🇩 Bangladesh's Easiest Free Online Shop Maker",
    heroHeading1: "Start your online shop in 1 minute.",
    heroHeadingGradient: "Sell anywhere in Bangladesh.",
    heroDesc: "Run your entire shop right from your mobile phone—no computer or coding needed. Accept payments via bKash, Nagad, Bank, or Cash on Delivery (COD) and withdraw profits anytime. 100% free to start.",
    heroSubtitle2: "No technical knowledge needed. Get your own shop link, track orders easily, accept bKash & Cash on Delivery, and withdraw your profits anytime.",
    startForFree: "Create Your Free Store (১ মিনিটে খুলুন)",
    viewDemo: "Explore Sample Stores",
    noCreditCard: "No credit card needed • Zero setup cost • 100% Free to start",
    creatorsSectionTitle: "Loved by shops & sellers across Bangladesh",
    creatorsSectionSub: "Discover real online stores already selling successfully on Cheap-Bazar.",
    noStores: "No stores yet. Be the first to start your shop today!",
    productsCount: "products",
    visitStore: "Visit Store ↗",

    // Trust Stats
    statVolumeVal: "৳ 150K+",
    statVolumeLabel: "Daily Sales by Sellers",
    statSetupVal: "60 Sec",
    statSetupLabel: "Fast Mobile Setup",
    statFreeVal: "100% Free",
    statFreeLabel: "Zero Cost to Start",
    statNationwideVal: "64 Districts",
    statNationwideLabel: "Home Delivery Anywhere",

    // Interactive Preview
    previewStoreName: "Tushar Fashion & Boutique",
    previewStoreTagline: "Premium traditional sarees, panjabis & outfits at wholesale & retail rates.",
    previewItem1: "Pure Cotton Jamdani Saree",
    previewItem2: "Embroidered Cotton Panjabi",
    previewClassic: "Classic Template",
    previewModern: "Modern Template",
    previewCartReserved: "⏱️ Items saved for you while ordering",

    // Core Features / Bento
    featuresHeading: "Everything you need to sell easily across Bangladesh",
    featuresSub: "Designed for everyday shopkeepers, Facebook sellers, wholesale merchants, and creators.",
    feat1Title: "Your Own Shop Link",
    feat1Desc: "Get a clean web link (cheapbazar.com/store/your-shop). Share it on WhatsApp, Facebook, or Instagram so customers can order directly without 50 inbox messages.",
    feat2Title: "Sell Single Pieces or Bulk Wholesale",
    feat2Desc: "Sell 1 piece to normal customers at retail price, and set special discount prices for wholesale buyers who buy in packs of 6, 12, or cartons.",
    feat3Title: "bKash, Nagad & Cash on Delivery",
    feat3Desc: "Let your buyers pay conveniently online via bKash, Nagad, Rocket, or pay cash when the courier delivers the parcel at their doorstep.",
    feat4Title: "Clear Accounts & Direct Payouts",
    feat4Desc: "Every single taka earned is clearly displayed in your dashboard. Transfer your profits directly into your personal bKash, Nagad, or Bank account anytime.",
    feat5Title: "Get More Customers Easily",
    feat5Desc: "Want more orders? Feature your shop or top products on the Cheap-Bazar homepage to reach thousands of new buyers across the country.",
    feat6Title: "Zero Stock Confusion",
    feat6Desc: "When an item sells out, your store automatically marks it out of stock, so you never accidentally take an order for a product you don't have.",

    // How It Works
    howItWorksHeading: "Start your business in 3 simple steps",
    howItWorksSub: "Anyone can start selling today with zero technical expertise.",
    step1Title: "1. Name Your Shop in 30 Seconds",
    step1Desc: "Sign up with your phone or email, write your shop's name, and choose a clean mobile-friendly design.",
    step2Title: "2. Add Your Products & Prices in Taka (৳)",
    step2Desc: "Snap photos with your phone, write a short description, set retail & wholesale rates, and save.",
    step3Title: "3. Share Your Link & Collect Money",
    step3Desc: "Send your shop link to customers. Fulfill orders and withdraw your profits straight to bKash or your Bank.",

    // Pricing
    pricingHeading: "Simple & transparent plans in Bangladeshi Taka",
    pricingSub: "Choose the plan that fits your business scale. Upgrade or cancel anytime.",
    planStarterName: "Starter (ফ্রি)",
    planStarterPrice: "৳ 0",
    planStarterPeriod: "/ forever free",
    planStarterDesc: "100% Free forever. Perfect for individuals, home sellers, small boutiques, and beginners.",
    planGrowthName: "Pro Growth",
    planGrowthPrice: "৳ 999",
    planGrowthPeriod: "/ month",
    planGrowthDesc: "For growing shops wanting a custom website address (.com) and priority marketplace features.",
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
    finalCtaHeading: "Ready to start your online business?",
    finalCtaSub: "Join thousands of sellers across Bangladesh. Open your free store in under a minute.",
    finalCtaButton: "Create Your Free Store Now",

    // Footer
    footerAbout: "The easiest way for anyone in Bangladesh to open a free online shop, sell products nationwide, and collect payments securely.",
    footerPlatform: "Platform",
    footerMerchants: "Merchants",
    footerSecurity: "Security & Trust",
    footerMadeWith: "",

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
    stockHoldNotice: "⏱️ Items saved for you while completing order",
    orderReservedTitle: "Order Placed!",
    orderReservedDesc: "Your order details are confirmed. The merchant will process your delivery.",
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
    footerText: "বাংলাদেশের প্রতিটি ব্যবসায়ী, বিক্রেতা ও সাধারণ ক্রেতার বিশ্বস্ত অনলাইন সঙ্গী।",

    // Landing Page
    heroBadge: "🇧🇩 বাংলাদেশের সবচেয়ে সহজ ফ্রি অনলাইন শপ প্ল্যাটফর্ম",
    heroHeading1: "মাত্র ১ মিনিটে খুলুন নিজের অনলাইন দোকান।",
    heroHeadingGradient: "পণ্য বিক্রি করুন সারা বাংলাদেশে।",
    heroDesc: "কম্পিউটার বা কোডিংয়ের কোনো ঝামেলা নেই—নিজের মোবাইল ফোন দিয়েই পুরো দোকান চালান। বিকাশ, নগদ, ব্যাংক এবং ক্যাশ অন ডেলিভারিতে টাকা বুঝে নিন। সম্পূর্ণ ফ্রিতে আজই শুরু করুন।",
    heroSubtitle2: "কোনো টেকনিক্যাল জ্ঞানের প্রয়োজন নেই। নিজের দোকানের ওয়েবসাইট লিঙ্ক পান, সহজে অর্ডার ও পণ্যের স্টক হিসাব রাখুন এবং বিকাশে বা ব্যাংকে টাকা তুলুন।",
    startForFree: "ফ্রিতে দোকান তৈরি করুন (১ মিনিটে চালু করুন)",
    viewDemo: "অন্যান্য দোকানগুলো দেখুন",
    noCreditCard: "কোনো কার্ড লাগবে না • কোনো খরচ নেই • সবার জন্য আজীবন ১০০% ফ্রি",
    creatorsSectionTitle: "সারা দেশের বিশ্বস্ত দোকান ও বিক্রেতাদের পছন্দ",
    creatorsSectionSub: "চিপ-বাজারে সফলভাবে পরিচালিত জনপ্রিয় অনলাইন শপগুলো ঘুরে দেখুন।",
    noStores: "এখনো কোনো দোকান খোলা হয়নি। আপনিই প্রথম আপনার ব্যবসা শুরু করুন!",
    productsCount: "টি পণ্য",
    visitStore: "দোকান ভিজিট করুন ↗",

    // Trust Stats
    statVolumeVal: "৳ ১,৫০,০০০+",
    statVolumeLabel: "মার্চেন্টদের মোট দৈনিক বিক্রি",
    statSetupVal: "১ মিনিট",
    statSetupLabel: "দোকান খোলার সহজ সময়",
    statFreeVal: "১০০% ফ্রি",
    statFreeLabel: "শুরু করতে কোনো ফি নেই",
    statNationwideVal: "৬৪ জেলা",
    statNationwideLabel: "সারা দেশে হোম ডেলিভারি",

    // Interactive Preview
    previewStoreName: "তুষার ফ্যাশন & বুটিক",
    previewStoreTagline: "সেরা মানের জামদানি শাড়ি, পাঞ্জাবি ও পোশাক পাইকারি ও খুচরা মূল্যে।",
    previewItem1: "সুতি জামদানি শাড়ি",
    previewItem2: "সেমি-লং সুতি পাঞ্জাবি",
    previewClassic: "ক্লাসিক ডিজাইন",
    previewModern: "মডার্ন ডিজাইন",
    previewCartReserved: "⏱️ অর্ডার করার সময় পণ্যটি আপনার জন্য সংরক্ষিত",

    // Core Features / Bento
    featuresHeading: "বাংলাদেশে সহজে পণ্য বিক্রির সব সমাধান এক জায়গায়",
    featuresSub: "সাধারণ দোকানদার, ফেসবুক সেলার, পাইকারি ব্যবসায়ী ও নতুন উদ্যোক্তাদের জন্য সহজ সমাধান।",
    feat1Title: "দোকানের নিজস্ব ওয়েবসাইট লিঙ্ক",
    feat1Desc: "পাবেন আপনার দোকানের নিজস্ব সুন্দর লিঙ্ক (cheapbazar.com/store/your-shop)। ফেসবুক পেজ বা হোয়াটসঅ্যাপে শেয়ার করুন, ক্রেতারা সরাসরি সাইজ ও পছন্দের রঙ দেখে অর্ডার করবে।",
    feat2Title: "একসাথে খুচরা ও পাইকারি বিক্রি",
    feat2Desc: "সাধারণ ক্রেতাদের কাছে ১ পিস খুচরা বিক্রি করুন, আবার পাইকারি ব্যবসায়ীদের জন্য ডজন বা কার্টন হিসেবে বিশেষ পাইকারি দাম ঠিক করে রাখুন।",
    feat3Title: "বিকাশ, নগদ ও ক্যাশ অন ডেলিভারি",
    feat3Desc: "ক্রেতারা তাদের সুবিধামতো বিকাশ, নগদ, রকেটে অনলাইনে পেমেন্ট করতে পারবে অথবা পার্সেল হাতে পেয়ে ক্যাশ টাকা দিতে পারবে।",
    feat4Title: "টাকার হিসাব পরিষ্কার, সরাসরি আপনার হাতে",
    feat4Desc: "প্রতিটি বিক্রির লাভের টাকা আপনার ওয়ালেটে জমা হবে। যেকোনো সময় ১ ক্লিকে সেই টাকা আপনার বিকাশ, নগদ বা ব্যাংক একাউন্টে তুলে নিন।",
    feat5Title: "বেশি বিক্রি পেতে সহজ প্রচার সুবিধা",
    feat5Desc: "বিক্রি বাড়াতে চান? চিপ-বাজারের প্রধান পাতায় আপনার দোকান বা সেরা পণ্য হাইলাইট করে সারা দেশের হাজারো নতুন ক্রেতার কাছে সহজে পৌঁছে যান।",
    feat6Title: "ভুল বা অতিরিক্ত অর্ডারের কোনো ভয় নেই",
    feat6Desc: "কোনো পণ্য স্টক শেষ হয়ে গেলে ওয়েবসাইট স্বয়ংক্রিয়ভাবে 'স্টক শেষ' দেখাবে। ফলে ভুলবশত অতিরিক্ত অর্ডার নেওয়ার কোনো ঝামেলা থাকবে না।",

    // How It Works
    howItWorksHeading: "৩টি সহজ ধাপে শুরু করুন আপনার ব্যবসা",
    howItWorksSub: "কোনো কারিগরি জ্ঞান ছাড়াই যে কেউ আজই পণ্য বিক্রি শুরু করতে পারবেন।",
    step1Title: "১. দোকানের নাম দিন মাত্র ৩০ সেকেন্ডে",
    step1Desc: "ফোন নম্বর দিয়ে সহজে অ্যাকাউন্ট খুলুন, দোকানের নাম লিখুন এবং মোবাইলে সুন্দর দেখায় এমন একটি ডিজাইন বেছে নিন।",
    step2Title: "২. পণ্যের ছবি ও দাম বসান টাকায় (৳)",
    step2Desc: "মোবাইল দিয়ে পণ্যের ছবি তুলুন, দাম ও বিবরণ লিখে সেভ করুন। প্রয়োজনমতো পাইকারি রেটও দিয়ে রাখতে পারেন।",
    step3Title: "৩. লিঙ্ক শেয়ার করে টাকা বুঝে নিন",
    step3Desc: "গ্রাহকদের লিঙ্ক পাঠান। অর্ডার বুঝে নিয়ে কুরিয়ারে পার্সেল পাঠান এবং লাভের টাকা নিজের বিকাশ বা ব্যাংকে নিন।",

    // Pricing
    pricingHeading: "সহজ ও স্বচ্ছ প্ল্যান — বাংলাদেশী টাকায়",
    pricingSub: "আপনার ব্যবসার পরিধি অনুযায়ী সঠিক প্ল্যান বেছে নিন। যেকোনো সময় আপগ্রেড বা বাতিল করতে পারবেন।",
    planStarterName: "স্টার্টার (ফ্রি)",
    planStarterPrice: "৳ ০",
    planStarterPeriod: "/ আজীবন ফ্রি",
    planStarterDesc: "১০০% আজীবন ফ্রি। নতুন উদ্যোক্তা, গৃহিণী, ছোট দোকানদার ও ঘরোয়া ব্যবসার জন্য উপযুক্ত।",
    planGrowthName: "প্রবৃদ্ধি (Growth)",
    planGrowthPrice: "৳ ৯৯৯",
    planGrowthPeriod: "/ মাস",
    planGrowthDesc: "দ্রুত বর্ধনশীল শপ ও পাইকারি বিক্রেতাদের জন্য নিজস্ব ওয়েবসাইট ডোমেন ও বিশেষ সুবিধা।",
    planGrowthBadge: "সবচেয়ে জনপ্রিয়",
    planEnterpriseName: "প্রাতিষ্ঠানিক (Enterprise)",
    planEnterprisePrice: "৳ ২,৪৯৯",
    planEnterprisePeriod: "/ মাস",
    planEnterpriseDesc: "বৃহৎ ব্র্যান্ড ও বড় পাইকারি ডিস্ট্রিবিউটরদের জন্য একাধিক স্টাফ এক্সেস ও সার্বক্ষণিক সাপোর্ট।",
    choosePlan: "প্ল্যান বেছে নিন",

    // Testimonials
    testimonialsHeading: "সফল বাংলাদেশী উদ্যোক্তাদের অভিজ্ঞতা",
    testimonialsSub: "জেনে নিন কীভাবে ব্যবসায়ীরা চিপ-বাজারের মাধ্যমে নিজেদের সেল ও ব্যবসা সহজে বাড়াচ্ছেন।",

    // FAQ
    faqHeading: "সাধারণ জিজ্ঞাসা (FAQ)",
    faqSub: "চিপ-বাজারে অনলাইন শপ চালু সংক্রান্ত প্রয়োজনীয় সব প্রশ্নের সহজ উত্তর।",

    // Final CTA
    finalCtaHeading: "আজই শুরু করুন আপনার অনলাইন ব্যবসা",
    finalCtaSub: "সারা বাংলাদেশের হাজারো বিক্রেতার সাথে যুক্ত হোন। মাত্র এক মিনিটে ফ্রিতে চালু করুন আপনার স্টোর।",
    finalCtaButton: "ফ্রিতে দোকান তৈরি করুন",

    // Footer
    footerAbout: "বাংলাদেশের প্রতিটি মানুষের জন্য নিজের ফ্রি অনলাইন দোকান তৈরি, সারা দেশে পণ্য বিক্রি এবং নিরাপদে টাকা বুঝে নেওয়ার সবচেয়ে সহজ প্ল্যাটফর্ম।",
    footerPlatform: "প্ল্যাটফর্ম",
    footerMerchants: "মার্চেন্ট সুবিধা",
    footerSecurity: "নিরাপত্তা ও স্বচ্ছতা",
    footerMadeWith: "",

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
    flashDealNotice: "যাচাইকৃত সরাসরি বিক্রেতা • সারা বাংলাদেশে দ্রুত ক্যাশ অন ডেলিভারি",

    // Cart Drawer
    shoppingBag: "শপিং ব্যাগ",
    emptyCartTitle: "আপনার ব্যাগ খালি",
    emptyCartSub: "অর্ডার করতে দোকান থেকে পণ্য যোগ করুন।",
    remove: "মুছে ফেলুন",
    each: "প্রতিটি",
    subtotal: "সাবটোটাল",
    total: "সর্বমোট",
    proceedToCheckout: "চেকআউট করুন",
    reservingStock: "পণ্যটি সংরক্ষিত হচ্ছে...",
    stockHoldNotice: "⏱️ অর্ডার করার সময় পণ্যটি আপনার জন্য সংরক্ষিত থাকবে",
    orderReservedTitle: "অর্ডার গ্রহণ করা হয়েছে!",
    orderReservedDesc: "আপনার অর্ডার সফল হয়েছে। বিক্রেতা দ্রুত আপনার পার্সেল ডেলিভারির ব্যবস্থা করবেন।",
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
