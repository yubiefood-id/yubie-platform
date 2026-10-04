export const siteConfig = {
  name: "Yubie",
  tagline: "Rooted here. Made for now.",
  descriptor: "Modern Indonesian sweet-potato food brand",
  location: "Bogor, Indonesia",
  email: "hello@yubie.id",
  announcement: "Promo peluncuran: gunakan YUBIE15 untuk diskon 15% di checkout.",
  social: {
    instagram: "https://instagram.com/yubie.id",
    tiktok: "https://tiktok.com/@yubie.id",
  },
} as const;

export const navigation = [
  { label: "Home", href: "/" },
  { label: "Our Products", href: "/products" },
  { label: "Our Roots", href: "/our-roots" },
  { label: "B2B", href: "/b2b" },
] as const;
