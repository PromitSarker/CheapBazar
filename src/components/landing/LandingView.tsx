"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  template: string;
  customDomain?: string | null;
  productCount: number;
  sampleProducts?: { name: string; price: number }[];
}

export default function LandingView({ stores }: { stores: StoreItem[] }) {
  const { t, language, toNumerals, formatTaka } = useLanguage();

  // Interactive Live Preview Card State
  const [previewTemplate, setPreviewTemplate] = useState<"classic" | "modern">("classic");
  const [previewCartCount, setPreviewCartCount] = useState<number>(1);
  const [addedItemName, setAddedItemName] = useState<string | null>(null);

  // Interactive FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handlePreviewAddToCart = (itemName: string) => {
    setPreviewCartCount((prev) => prev + 1);
    setAddedItemName(itemName);
    setTimeout(() => setAddedItemName(null), 1500);
  };

  // FAQ Data tailored to Bangladesh e-commerce context
  const faqs = [
    {
      q: language === "bn" ? "চিপ-বাজারে অনলাইন শপ চালু করতে কি কোনো ফি দিতে হবে?" : "Is there any setup fee to create a store on Cheap-Bazar?",
      a: language === "bn"
        ? "না, কোনো সেটআপ ফি বা মাসিক ফি নেই! আমাদের স্টার্টার প্ল্যানে যে কেউ সম্পূর্ণ ফ্রিতে নিজের ব্র্যান্ড নামে অনলাইন শপ তৈরি করে পণ্য বিক্রি শুরু করতে পারবেন।"
        : "No, there is zero setup fee or upfront charge! With our Starter plan, anyone can launch an online storefront for free under their own brand name."
    },
    {
      q: language === "bn" ? "কাস্টমারদের থেকে পেমেন্ট কীভাবে গ্রহণ করব?" : "How do I collect payments from customers?",
      a: language === "bn"
        ? "আপনি সরাসরি বিকাশ, নগদ, রকেট, ব্যাংক ট্রান্সফার এবং সারা বাংলাদেশে ক্যাশ অন ডেলিভারি (COD) এর মাধ্যমে পেমেন্ট গ্রহণ করতে পারবেন। প্রতিটি অর্ডারের টাকা আপনার ডাবল-এন্ট্রি ওয়ালেটে জমা হবে।"
        : "You can accept payments via bKash, Nagad, Rocket, direct Bank Transfer, or nationwide Cash on Delivery (COD). All funds settle seamlessly into your merchant double-entry wallet."
    },
    {
      q: language === "bn" ? "আমি কি আমার নিজস্ব ডোমেন (.com বা .com.bd) ব্যবহার করতে পারব?" : "Can I connect my own custom domain (.com or .com.bd)?",
      a: language === "bn"
        ? "হ্যাঁ! আপনার স্টোর ডিফল্টভাবে cheapbazar.com/store/your-shop ঠিকানায় চালু হবে। এছাড়াও আমাদের ড্যাশবোর্ড সেটিংস থেকে যেকোনো সময় নিজস্ব ডোমেন যুক্ত করে এজ SSL সহ চালাতে পারবেন।"
        : "Yes! Your store immediately gets a dedicated address like cheapbazar.com/store/your-shop, and you can map your custom domain (.com or .com.bd) with automatic edge SSL from settings."
    },
    {
      q: language === "bn" ? "খুচরা ও পাইকারি ডাবল প্রাইসিং কীভাবে কাজ করে?" : "How does the dual retail and wholesale pricing engine work?",
      a: language === "bn"
        ? "সাধারণ ক্রেতাদের জন্য রেগুলার রিটেইল প্রাইস থাকবে এবং পাইকারি ক্রেতাদের জন্য মিনিমাম অর্ডার কোয়ান্টিটি (MOQ) সহ বিশেষ ডিসকাউন্টেড রেট নির্ধারণ করতে পারবেন।"
        : "You can set everyday retail rates for individual shoppers while configuring bulk wholesale pricing with Minimum Order Quantities (MOQ) for high-volume B2B buyers."
    },
    {
      q: language === "bn" ? "স্টক রিজার্ভেশন (১৫ মিনিট লক) বলতে কী বোঝায়?" : "What is the 15-minute stock reservation guarantee?",
      a: language === "bn"
        ? "যখন কোনো কাস্টমার চেকআউট শুরু করে, তখন পণ্যটি অন্য কারও কাছে বিক্রি হওয়া রোধ করতে ১৫ মিনিটের জন্য লক থাকে। এতে অতিরিক্ত অর্ডার বা স্টক অমিলের ঝামেলা হয় না।"
        : "When a customer enters the checkout flow, inventory is locked for 15 minutes to prevent overselling and inventory collisions, giving buyers time to complete payment."
    }
  ];

  return (
    <div className="landing">
      {/* =========================================================================
          1. HERO SECTION
          ========================================================================= */}
      <section className="hero animate-slide-up" style={{ animationDelay: "0ms" }}>
        <div className="hero-badge">
          <span className="hero-badge-dot"></span>
          {t.heroBadge}
        </div>
        <h1>
          {t.heroHeading1} <br />
          <span className="text-gradient">{t.heroHeadingGradient}</span>
        </h1>
        <p>{t.heroDesc}</p>
        <div className="hero-actions">
          <Link href="/signup" className="button glow-button hero-button">
            {t.startForFree}
          </Link>
          <Link href="#explore" className="button button-outline hero-button">
            {t.viewDemo}
          </Link>
        </div>
        <span className="small muted" style={{ marginTop: "1rem" }}>
          {t.noCreditCard}
        </span>

        {/* Floating Trust Metrics Bar */}
        <div className="hero-trust-bar">
          <div className="trust-stat-item">
            <span className="trust-stat-val">{t.statVolumeVal}</span>
            <span className="trust-stat-label">{t.statVolumeLabel}</span>
          </div>
          <div className="trust-stat-item">
            <span className="trust-stat-val">{t.statSetupVal}</span>
            <span className="trust-stat-label">{t.statSetupLabel}</span>
          </div>
          <div className="trust-stat-item">
            <span className="trust-stat-val">{t.statFreeVal}</span>
            <span className="trust-stat-label">{t.statFreeLabel}</span>
          </div>
          <div className="trust-stat-item">
            <span className="trust-stat-val">{t.statNationwideVal}</span>
            <span className="trust-stat-label">{t.statNationwideLabel}</span>
          </div>
        </div>

        {/* =========================================================================
            2. INTERACTIVE LIVE STOREFRONT PREVIEW CARD
            ========================================================================= */}
        <div className="preview-showcase-container animate-slide-up" style={{ animationDelay: "150ms" }}>
          <div className="interactive-preview-card">
            {/* Simulated Browser Bar */}
            <div className="preview-topbar">
              <div className="preview-browser-dots">
                <span className="browser-dot red"></span>
                <span className="browser-dot yellow"></span>
                <span className="browser-dot green"></span>
              </div>
              <div className="preview-address-bar">
                <span>🔒</span>
                <span>cheapbazar.com/store/demo-bakery</span>
              </div>
              <div className="preview-template-switch">
                <button
                  type="button"
                  className={`template-pill-btn ${previewTemplate === "classic" ? "active" : ""}`}
                  onClick={() => setPreviewTemplate("classic")}
                >
                  {t.previewClassic}
                </button>
                <button
                  type="button"
                  className={`template-pill-btn ${previewTemplate === "modern" ? "active" : ""}`}
                  onClick={() => setPreviewTemplate("modern")}
                >
                  {t.previewModern}
                </button>
              </div>
            </div>

            {/* Storefront Header */}
            <div
              className="preview-store-hero"
              style={{
                background:
                  previewTemplate === "modern"
                    ? "linear-gradient(135deg, rgba(244, 244, 245, 0.9) 0%, rgba(228, 228, 231, 0.6) 100%)"
                    : "rgba(255, 255, 255, 0.95)",
              }}
            >
              <div className="preview-store-info">
                <div
                  className="preview-store-avatar"
                  style={{
                    background: previewTemplate === "modern" ? "linear-gradient(135deg, #2563eb, #1e40af)" : "#18181b",
                  }}
                >
                  🥖
                </div>
                <div className="preview-store-title">
                  <h4>
                    {t.previewStoreName}
                    <span className="preview-verified-badge">✓ Verified</span>
                  </h4>
                  <p>{t.previewStoreTagline}</p>
                </div>
              </div>

              <div className="preview-cart-counter">
                <span>🛍️</span>
                <span>
                  {toNumerals(previewCartCount)} {t.bag}
                </span>
              </div>
            </div>

            {/* Storefront Products Grid */}
            <div className="preview-products-grid">
              {/* Product 1 */}
              <div className="preview-product-card">
                <div className="preview-prod-img-box" style={{ background: "#fef3c7" }}>
                  🍞
                </div>
                <h5 className="preview-prod-name">{t.previewItem1}</h5>
                <p className="muted small" style={{ margin: 0 }}>
                  {language === "bn" ? "৪৮ ঘণ্টার ফারমেন্টেশন, কাঠের চুলোয় তৈরি।" : "48-hr slow fermentation, wood-fired crust."}
                </p>
                <div className="preview-prod-footer">
                  <span className="preview-price">{formatTaka(450, language)}</span>
                  <button
                    type="button"
                    className="preview-add-btn"
                    onClick={() => handlePreviewAddToCart(t.previewItem1)}
                  >
                    {addedItemName === t.previewItem1 ? "✓ Added" : t.addToCart}
                  </button>
                </div>
              </div>

              {/* Product 2 */}
              <div className="preview-product-card">
                <div className="preview-prod-img-box" style={{ background: "#ffedd5" }}>
                  🥐
                </div>
                <h5 className="preview-prod-name">{t.previewItem2}</h5>
                <p className="muted small" style={{ margin: 0 }}>
                  {language === "bn" ? "ফ্রেঞ্চ বাটারে ৩ দিনে স্তরযুক্ত ক্রিস্পি ক্রস্যান্ট।" : "Laminated over 3 days with French butter."}
                </p>
                <div className="preview-prod-footer">
                  <span className="preview-price">{formatTaka(220, language)}</span>
                  <button
                    type="button"
                    className="preview-add-btn"
                    onClick={() => handlePreviewAddToCart(t.previewItem2)}
                  >
                    {addedItemName === t.previewItem2 ? "✓ Added" : t.addToCart}
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Footer Strip */}
            <div className="preview-footer-strip">
              <span>{t.previewCartReserved}</span>
              <span className="small">⚡ 24hr Fast Courier Delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. CORE PLATFORM CAPABILITIES (BENTO GRID)
          ========================================================================= */}
      <section className="features-container animate-slide-up" style={{ animationDelay: "200ms" }}>
        <div className="bento-header">
          <h2>{t.featuresHeading}</h2>
          <p className="muted">{t.featuresSub}</p>
        </div>

        <div className="feature-bento-grid">
          {/* Feature 1 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">🌐</div>
            <h3>{t.feat1Title}</h3>
            <p>{t.feat1Desc}</p>
          </div>

          {/* Feature 2 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">📦</div>
            <h3>{t.feat2Title}</h3>
            <p>{t.feat2Desc}</p>
          </div>

          {/* Feature 3 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">📱</div>
            <h3>{t.feat3Title}</h3>
            <p>{t.feat3Desc}</p>
          </div>

          {/* Feature 4 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">⚖️</div>
            <h3>{t.feat4Title}</h3>
            <p>{t.feat4Desc}</p>
          </div>

          {/* Feature 5 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">🚀</div>
            <h3>{t.feat5Title}</h3>
            <p>{t.feat5Desc}</p>
          </div>

          {/* Feature 6 */}
          <div className="feature-box">
            <div className="feature-icon-bubble">🔒</div>
            <h3>{t.feat6Title}</h3>
            <p>{t.feat6Desc}</p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. HOW IT WORKS IN 3 STEPS
          ========================================================================= */}
      <section className="how-it-works-section animate-slide-up" style={{ animationDelay: "250ms" }}>
        <div className="bento-header">
          <h2>{t.howItWorksHeading}</h2>
          <p className="muted">{t.howItWorksSub}</p>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <span className="step-badge">01</span>
            <h3>{t.step1Title}</h3>
            <p>{t.step1Desc}</p>
          </div>

          <div className="step-card">
            <span className="step-badge">02</span>
            <h3>{t.step2Title}</h3>
            <p>{t.step2Desc}</p>
          </div>

          <div className="step-card">
            <span className="step-badge">03</span>
            <h3>{t.step3Title}</h3>
            <p>{t.step3Desc}</p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. FEATURED CREATORS & LIVE STOREFRONTS
          ========================================================================= */}
      <section className="section bento-section animate-slide-up" style={{ animationDelay: "300ms" }} id="explore">
        <div className="bento-header">
          <h2>{t.creatorsSectionTitle}</h2>
          <p className="muted">{t.creatorsSectionSub}</p>
        </div>

        {stores.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <p className="muted">{t.noStores}</p>
            <Link href="/signup" className="button glow-button" style={{ marginTop: "1rem" }}>
              {t.startForFree}
            </Link>
          </div>
        ) : (
          <div className="card-grid">
            {stores.map((s) => (
              <Link key={s.id} href={`/store/${s.slug}`} className="card store-card group">
                <div className="card-content">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="card-icon">
                      {s.template === "modern" ? "✨" : "🛍️"}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        padding: "3px 8px",
                        borderRadius: "99px",
                        background: s.template === "modern" ? "rgba(59, 130, 246, 0.1)" : "rgba(0, 0, 0, 0.05)",
                        color: s.template === "modern" ? "#2563eb" : "#4b5563",
                      }}
                    >
                      {s.template}
                    </span>
                  </div>

                  <strong>{s.name}</strong>

                  <span className="muted small">
                    {toNumerals(s.productCount)} {t.productsCount}
                  </span>

                  {s.sampleProducts && s.sampleProducts.length > 0 && (
                    <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                      <span className="small muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                        {language === "bn" ? "জনপ্রিয় পণ্য:" : "Popular items:"}
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {s.sampleProducts.map((p, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: "0.75rem",
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "#334155",
                            }}
                          >
                            {p.name} ({formatTaka(p.price, language)})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <span
                    style={{
                      marginTop: "auto",
                      paddingTop: "0.75rem",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "#2563eb",
                    }}
                  >
                    {t.visitStore}
                  </span>
                </div>
                <div className="card-gradient-overlay"></div>
              </Link>
            ))}
          </div>
        )}
      </section>



      {/* =========================================================================
          7. MERCHANT SUCCESS STORIES & TESTIMONIALS
          ========================================================================= */}
      <section className="testimonials-section animate-slide-up" style={{ animationDelay: "400ms" }}>
        <div className="bento-header">
          <h2>{t.testimonialsHeading}</h2>
          <p className="muted">{t.testimonialsSub}</p>
        </div>

        <div className="testimonials-grid">
          {/* Testimonial 1 */}
          <div className="testimonial-card">
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-quote">
              {language === "bn"
                ? "“আমরা মাত্র ৫ মিনিটে আমাদের বেকারি অনলাইন করেছি। কাস্টমাররা সরাসরি বিকাশ বা ক্যাশ অন ডেলিভারিতে অর্ডার করতে পারছে। প্রথম সপ্তাহেই আমাদের বিক্রি ৫০% বৃদ্ধি পেয়েছে!”"
                : "“We took our artisan bakery online in just 5 minutes. Customers can order seamlessly with bKash or COD. Our weekly sales increased by over 50%!”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar">TR</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "তানভীর রহমান" : "Tanvir Rahman"}</strong>
                <span>{language === "bn" ? "মালিক, ঢাকা ক্রাফটস বেকারি" : "Founder, Dhaka Crafts"}</span>
              </div>
            </div>
          </div>

          {/* Testimonial 2 */}
          <div className="testimonial-card">
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-quote">
              {language === "bn"
                ? "“খুচরা এবং পাইকারি দুটি আলাদা প্রাইসিং একসাথে পরিচালনা করার সুবিধা চিপ-বাজারের চেয়ে ভালো কোথাও পাইনি। ডাবল-এন্ট্রি লেজার আমার প্রতিটি টাকার নিখুঁত হিসাব রাখে।”"
                : "“The dual retail and wholesale engine is phenomenal. I can supply bulk buyers and retail shoppers simultaneously without accounting mistakes.”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar" style={{ background: "linear-gradient(135deg, #10b981, #047857)" }}>FA</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "ফারজানা আক্তার" : "Farzana Akter"}</strong>
                <span>{language === "bn" ? "স্বত্বাধিকারী, চট্টগ্রাম ফ্যাব্রিক হাব" : "Owner, CTG Fabric Hub"}</span>
              </div>
            </div>
          </div>

          {/* Testimonial 3 */}
          <div className="testimonial-card">
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-quote">
              {language === "bn"
                ? "“১৫ মিনিটের স্টক রিজার্ভেশন ফিচারটি অসাধারণ। ফেসবুক লাইভে একসাথে শত শত কাস্টমার অর্ডার করলেও স্টক ডুপ্লিকেট হয় না। একদম নিশ্চিন্তে ব্যবসা চালাচ্ছি।”"
                : "“The 15-minute stock hold feature is incredible. Even when we get massive surges during social sales, inventory never duplicates or oversells.”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>SA</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "সাইফুল আলম" : "Saiful Alam"}</strong>
                <span>{language === "bn" ? "প্রতিষ্ঠাতা, সিলেট অর্গানিক হানি" : "Founder, Sylhet Organics"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FREQUENTLY ASKED QUESTIONS (ACCORDION)
          ========================================================================= */}
      <section className="faq-section animate-slide-up" style={{ animationDelay: "450ms" }}>
        <div className="bento-header">
          <h2>{t.faqHeading}</h2>
          <p className="muted">{t.faqSub}</p>
        </div>

        <div className="faq-list">
          {faqs.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className={`faq-item ${isOpen ? "open" : ""}`}>
                <button
                  type="button"
                  className="faq-trigger"
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={isOpen}
                >
                  <span>{item.q}</span>
                  <svg
                    className="faq-chevron"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && <div className="faq-body">{item.a}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          9. HIGH-IMPACT FINAL CALL TO ACTION
          ========================================================================= */}
      <section className="final-cta-section animate-slide-up" style={{ animationDelay: "500ms" }}>
        <div className="final-cta-card">
          <h2>{t.finalCtaHeading}</h2>
          <p>{t.finalCtaSub}</p>
          <Link href="/signup" className="button">
            {t.finalCtaButton}
          </Link>
          <span className="small" style={{ color: "#94a3b8", marginTop: "0.5rem" }}>
            {t.noCreditCard}
          </span>
        </div>
      </section>
    </div>
  );
}
