import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return <footer className="site-footer">
    <div className="footer-lead"><span className="eyebrow">BOGOR · INDONESIA</span><h2>Local roots deserve<br /><em>a bigger future.</em></h2></div>
    <div className="footer-grid">
      {/* Transparent logo master (alpha rebuilt from the supplied file) —
          no box, no plate, aspect ratio preserved. See PRODUCT_TRUTH_SOURCE.md. */}
      <div className="footer-brand"><Image className="footer-logo" src="/brand/transparent_yubie.png" alt="Yubie" width={1250} height={910} unoptimized /><p>{siteConfig.tagline}</p></div>
      <div><span className="footer-label">Explore</span><Link href="/products">Produk</Link><Link href="/our-story">Our Story</Link><Link href="/our-roots">Our Roots</Link><Link href="/impact">Impact</Link></div>
      <div><span className="footer-label">Connect</span><Link href="/b2b">B2B</Link><a href={siteConfig.social.instagram}>Instagram</a><a href={siteConfig.social.tiktok}>TikTok</a><a href={`mailto:${siteConfig.email}`}>Email</a></div>
      <div><span className="footer-label">Care</span><Link href="/faq">FAQ</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/products/yubie-flour">Cara beli</Link></div>
    </div>
    <div className="footer-bottom"><span>© 2026 Yubie</span><span>Rooted here. Made for now.</span></div>
  </footer>;
}
