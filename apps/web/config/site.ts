export const siteConfig = {
  origin: "https://yubiefood.com",
  name: "Yubie",
  tagline: "Rooted here. Made for now.",
  descriptor: "Modern Indonesian sweet-potato food brand",
  location: "Bogor, Indonesia",
  email: "hello@yubiefood.com",
  announcement: "Promo peluncuran: gunakan YUBIE15 untuk diskon 15% di checkout.",
  social: {
    instagram: "https://www.instagram.com/yubiefood.official/",
    tiktok: "https://www.tiktok.com/@yubiefood.official",
    whatsappCommunity: "https://chat.whatsapp.com/IVpNHQOsn371YeTSdyX6q2",
  },
} as const;

export const navigation = [
  { label: "Home", href: "/" },
  { label: "Our Story", href: "/our-story" },
  { label: "Our Products", href: "/products" },
  { label: "Our Roots", href: "/our-roots" },
  { label: "B2B", href: "/b2b" },
] as const;
