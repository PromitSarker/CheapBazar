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

  // FAQ Data tailored for everyday Bangladeshi sellers & shoppers
  const faqs = [
    {
      q: language === "bn" ? "চিপ-বাজারে অনলাইন শপ খুলতে কি কোনো টাকা লাগে?" : "Is there any cost to create an online store on Cheap-Bazar?",
      a: language === "bn"
        ? "না! সম্পূর্ণ ফ্রিতে যে কেউ নিজের অনলাইন দোকান চালু করতে পারবেন। কোনো মাসিক ফি বা গোপন চার্জ নেই।"
        : "No, it is 100% free! Anyone can launch their online store with zero setup fee, no monthly charge, and no credit card required."
    },
    {
      q: language === "bn" ? "বিক্রির টাকা কীভাবে আমার হাতে পাব?" : "How do I receive money from customer sales?",
      a: language === "bn"
        ? "ক্রেতারা বিকাশ, নগদ, রকেটে অনলাইনে অথবা পার্সেল পেয়ে ক্যাশে টাকা দিতে পারবে। প্রতিটি বিক্রির টাকা আপনার ওয়ালেটে জমা হবে এবং যেকোনো সময় ১ ক্লিকে আপনার নিজের বিকাশ, নগদ বা ব্যাংক একাউন্টে তুলে নিতে পারবেন।"
        : "Customers can pay online with bKash, Nagad, Rocket, or pay Cash on Delivery. All earnings appear in your wallet, and you can withdraw them directly into your personal bKash, Nagad, or Bank account anytime."
    },
    {
      q: language === "bn" ? "দোকান চালাতে কি কম্পিউটার লাগবে, নাকি মোবাইল দিয়েই চলবে?" : "Do I need a computer or can I run this on my mobile phone?",
      a: language === "bn"
        ? "আপনার হাতের সাধারণ স্মার্টফোনই যথেষ্ট! মোবাইল দিয়ে ছবি তুলে আপলোড করতে পারবেন, দাম বসাতে পারবেন এবং নতুন অর্ডার দেখতে পারবেন।"
        : "Your smartphone is completely enough! You can take photos of your products, set prices, and manage customer orders right from your mobile phone."
    },
    {
      q: language === "bn" ? "অর্ডারের পণ্য গ্রাহকের কাছে ডেলিভারি কীভাবে করব?" : "How do I deliver products to my customers?",
      a: language === "bn"
        ? "আপনি রেডএক্স, স্টেডফাস্ট, সুন্দরবন বা আপনার পছন্দের যেকোনো লোকাল কুরিয়ার সার্ভিসের মাধ্যমে পণ্য ডেলিভারি দিতে পারবেন। গ্রাহক পার্সেল পেয়ে ক্যাশ টাকা দিলে কুরিয়ার আপনাকে টাকা দিয়ে দেবে।"
        : "You can deliver nationwide using any local courier service (like Steadfast, RedX, Sundarban, or Paperfly). Customers pay cash when they receive the parcel."
    },
    {
      q: language === "bn" ? "আমি কি একই সাথে খুচরা ও পাইকারি বিক্রি করতে পারব?" : "Can I sell both retail and bulk wholesale?",
      a: language === "bn"
        ? "হ্যাঁ! সাধারণ ক্রেতাদের জন্য খুচরা ১ পিসের দাম দিয়ে রাখবেন, আর যারা বেশি কিনবে (যেমন ৬ বা ১২ পিস) তাদের জন্য বিশেষ পাইকারি ছাড়ের দাম সেট করে রাখতে পারবেন।"
        : "Yes! You can set regular retail prices for individual shoppers, and also configure special discounted prices for bulk wholesale buyers who order in larger quantities."
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
                <span>cheapbazar.com/store/tushar-fashion</span>
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
                    background: previewTemplate === "modern" ? "linear-gradient(135deg, #db2777, #be185d)" : "#18181b",
                  }}
                >
                  👗
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
                <div className="preview-prod-img-box" style={{ background: "#fce7f3" }}>
                  👗
                </div>
                <h5 className="preview-prod-name">{t.previewItem1}</h5>
                <p className="muted small" style={{ margin: 0 }}>
                  {language === "bn" ? "খাঁটি সুতি সুতা দিয়ে বোনা ঐতিহ্যবাহী জামদানি শাড়ি।" : "Handloom woven soft cotton authentic Jamdani saree."}
                </p>
                <div className="preview-prod-footer">
                  <span className="preview-price">{formatTaka(1450, language)}</span>
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
                <div className="preview-prod-img-box" style={{ background: "#e0f2fe" }}>
                  👔
                </div>
                <h5 className="preview-prod-name">{t.previewItem2}</h5>
                <p className="muted small" style={{ margin: 0 }}>
                  {language === "bn" ? "আরামদায়ক প্রিমিয়াম সুতি কাপড়ে নিখুঁত সুতার কাজ।" : "Comfortable premium breathable cotton with neat embroidery."}
                </p>
                <div className="preview-prod-footer">
                  <span className="preview-price">{formatTaka(850, language)}</span>
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
              <span className="small">
                {language === "bn" ? "🚚 সারা দেশে দ্রুত হোম ডেলিভারি" : "🚚 Fast Nationwide Home Delivery"}
              </span>
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
                ? "“আমরা মাত্র ৫ মিনিটে আমাদের বুটিক শপ অনলাইন করেছি। কাস্টমাররা সরাসরি বিকাশ বা ক্যাশ অন ডেলিভারিতে অর্ডার করতে পারছে। প্রথম মাসেই আমাদের বিক্রি দ্বিগুণ হয়ে গেছে!”"
                : "“We took our boutique shop online in just 5 minutes. Customers can order seamlessly with bKash or COD. Our monthly sales doubled in the very first month!”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar">TR</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "তানভীর রহমান" : "Tanvir Rahman"}</strong>
                <span>{language === "bn" ? "স্বত্বাধিকারী, রূপালী ফ্যাশন" : "Owner, Rupali Fashion"}</span>
              </div>
            </div>
          </div>

          {/* Testimonial 2 */}
          <div className="testimonial-card">
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-quote">
              {language === "bn"
                ? "“একই দোকানে সাধারণ ক্রেতাদের কাছে খুচরা আবার পাইকারি ব্যবসায়ীদের কাছে একসাথে বেশি পণ্য বিক্রি করতে পারছি। বিক্রির লাভ ও টাকার হিসাব ড্যাশবোর্ডে একদম পরিষ্কার থাকে—কোনো ভুল হয় না!”"
                : "“I can easily sell single pieces to retail shoppers and bulk orders to wholesale clients from the same shop. The sales and profit calculations in the dashboard are crystal clear!”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar" style={{ background: "linear-gradient(135deg, #10b981, #047857)" }}>FA</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "ফারজানা আক্তার" : "Farzana Akter"}</strong>
                <span>{language === "bn" ? "স্বত্বাধিকারী, চট্টগ্রাম ফেব্রিক হাব" : "Owner, CTG Fabric Hub"}</span>
              </div>
            </div>
          </div>

          {/* Testimonial 3 */}
          <div className="testimonial-card">
            <div className="testimonial-stars">★★★★★</div>
            <p className="testimonial-quote">
              {language === "bn"
                ? "“ফেসবুক পেজে আগে ইনবক্সে মেসেজ সামলাতে দিনরাত শেষ হয়ে যেত। এখন কাস্টমারকে শুধু দোকানের লিঙ্ক পাঠিয়ে দিই, তারা নিজেরাই সাইজ ও রঙ দেখে অর্ডার করে ফেলে। সময় বেঁচে যায় এবং নিশ্চিন্তে ব্যবসা চালাচ্ছি।”"
                : "“Handling hundreds of Facebook inbox messages used to take all day. Now I just share my store link and customers place their own orders. It saves hours of time and makes running the business stress-free!”"}
            </p>
            <div className="testimonial-author">
              <div className="author-avatar" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>SA</div>
              <div className="author-meta">
                <strong>{language === "bn" ? "সাইফুল আলম" : "Saiful Alam"}</strong>
                <span>{language === "bn" ? "প্রতিষ্ঠাতা, সুন্দরবন অর্গানিক হানি" : "Founder, Sundarban Organics"}</span>
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
