export const siteConfig = {
  name: "Yubie",
  tagline: "Rooted here. Made for now.",
  descriptor: "Modern Indonesian sweet-potato food brand",
  location: "Bogor, Indonesia",
  email: "hello@yubie.id",
  announcement: "Launch offer coming soon — join the Yubie community.",
  social: {
    instagram: "https://instagram.com/yubie.id",
    tiktok: "https://tiktok.com/@yubie.id",
  },
} as const;

export const navigation = [
  { label: "Shop", href: "/shop" },
  { label: "Our Products", href: "/#products" },
  { label: "Recipes", href: "/recipes" },
  { label: "Our Roots", href: "/our-roots" },
  { label: "B2B", href: "/b2b" },
] as const;
