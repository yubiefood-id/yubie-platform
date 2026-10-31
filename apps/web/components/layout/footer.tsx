import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { SocialLinks } from "@/components/layout/social-links";
import { merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";

export function Footer() {
  const identityReady = merchantIdentityComplete;
  return <footer className="site-footer">
    <div className="footer-lead"><span className="eyebrow">BOGOR · INDONESIA</span><h2>Local roots deserve<br /><em>a bigger future.</em></h2></div>
    <div className="footer-grid">
      {/* Transparent logo master (alpha rebuilt from the supplied file) —
          no box, no plate, aspect ratio preserved. See PRODUCT_TRUTH_SOURCE.md. */}
      <div className="footer-brand"><Image className="footer-logo" src="/brand/transparent_yubie.png" alt="Yubie" width={1250} height={910} unoptimized /><p>{siteConfig.tagline}</p></div>
      <div><span className="footer-label">Explore</span><Link href="/products">Produk</Link><Link href="/our-story">Our Story</Link><Link href="/our-roots">Our Roots</Link><Link href="/impact">Impact</Link><Link href="/products/yubie-flour">Cara beli</Link></div>
      <div><span className="footer-label">Connect</span><Link href="/b2b">B2B</Link><a href={siteConfig.social.whatsappCommunity} target="_blank" rel="noopener noreferrer">Komunitas WhatsApp</a><a href={`mailto:${siteConfig.email}`}>Email</a></div>
      <div><span className="footer-label">Bantuan</span><Link href="/faq">FAQ</Link><Link href="/contact">Hubungi Kami</Link><Link href="/terms">Syarat &amp; Ketentuan</Link><Link href="/refund-policy">Kebijakan Pengembalian Dana</Link><Link href="/privacy">Kebijakan Privasi</Link></div>
    </div>
    <div className="footer-identity">
      <span className="footer-label">Identitas Usaha</span>
      <p>
        <span>{siteConfig.name} — {siteConfig.descriptor}</span>
        <span>Wilayah usaha: {merchantIdentity.publicRegion}</span>
        <span>Email: <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></span>
        {identityReady && merchantIdentity.supportPhone ? <span>Telepon: <a href={merchantIdentity.supportPhone.telUrl} data-merchant-field="phone">{merchantIdentity.supportPhone.value}</a></span> : null}
        {identityReady && merchantIdentity.registeredAddress ? <span>Alamat usaha terdaftar: <span data-merchant-field="address">{merchantIdentity.registeredAddress.value}</span></span> : null}
        {identityReady && merchantIdentity.legalOperatorName ? <span>Pengelola: <span data-merchant-field="legal-name">{merchantIdentity.legalOperatorName.value}</span>{merchantIdentity.entityType ? <> (<span data-merchant-field="entity-type">{merchantIdentity.entityType.value}</span>)</> : null}</span> : null}
      </p>
    </div>
    <div className="footer-social-row"><span className="footer-label">Follow Us</span><SocialLinks /></div>
    <div className="footer-bottom"><span>© 2026 Yubie</span><span>Rooted here. Made for now.</span></div>
  </footer>;
}
