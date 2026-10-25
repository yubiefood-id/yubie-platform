"use client";

import { trackEvent } from "@/lib/analytics";
import { siteConfig } from "@/config/site";

/** Sitewide strip surfacing the product-trial feedback form (Google Form).
    WhatsApp stays on the hero CTA, footer and the promo panel — not here. */
export function ContactBar() {
  return <div className="contact-bar">
    <a href={siteConfig.social.feedbackForm} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("contact_bar_click", { target: "feedback-form" })}>📝 Feedback Produk Yubie</a>
  </div>;
}
