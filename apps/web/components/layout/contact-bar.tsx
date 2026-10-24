"use client";

import { trackEvent } from "@/lib/analytics";
import { siteConfig } from "@/config/site";
import { WhatsAppIcon } from "@/components/layout/social-links";

/** Sitewide contact strip: WhatsApp community first, product-trial feedback form after. */
export function ContactBar() {
  return <div className="contact-bar">
    <a href={siteConfig.social.whatsappCommunity} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("contact_bar_click", { target: "whatsapp-community" })}><WhatsAppIcon /> WhatsApp Yubie</a>
    <a href={siteConfig.social.feedbackForm} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("contact_bar_click", { target: "feedback-form" })}>📝 Feedback Produk Yubie</a>
  </div>;
}
