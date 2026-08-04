import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return <footer className="site-footer">
    <div className="footer-lead"><span className="eyebrow">BOGOR · INDONESIA</span><h2>Local roots deserve<br /><em>a bigger future.</em></h2></div>
    <div className="footer-grid">
      <div className="footer-brand"><div className="logo-plate"><Image src="/brand/yubie-logo.webp" alt="Yubie" width={190} height={103} unoptimized /></div><p>{siteConfig.tagline}</p></div>
      <div><span className="footer-label">Explore</span><Link href="/shop">Shop</Link><Link href="/recipes">Recipes</Link><Link href="/our-roots">Our Roots</Link><Link href="/impact">Impact</Link></div>
      <div><span className="footer-label">Connect</span><Link href="/b2b">B2B</Link><a href={siteConfig.social.instagram}>Instagram</a><a href={siteConfig.social.tiktok}>TikTok</a><a href={`mailto:${siteConfig.email}`}>Email</a></div>
      <div><span className="footer-label">Care</span><Link href="/faq">FAQ</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/checkout">Checkout</Link></div>
    </div>
    <div className="footer-bottom"><span>© 2026 Yubie</span><span>Rooted here. Made for now.</span></div>
  </footer>;
}
