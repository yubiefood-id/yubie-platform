import type { Product } from "@/types/commerce";

export const products: Product[] = [
  {
    id: "flour",
    slug: "yubie-flour",
    name: "Yubie Flour",
    descriptor: "All-Purpose Sweet Potato Flour",
    status: "available",
    image: "/photography/hero-lifestyle.webp",
    imageAlt: "Rangkaian produk Yubie termasuk kemasan Yubie Flour",
    eyebrow: "THE EVERYDAY STARTER",
    story: "Tepung ubi jalar serbaguna untuk eksplorasi pancake, cookies, brownies, cake, bubur, dan kreasi dapur lainnya.",
    sizes: [
      { id: "250g", label: "250 g", price: 15000, available: true },
      { id: "500g", label: "500 g", price: 28000, available: true },
      { id: "1kg", label: "1 kg", price: 52000, available: true },
    ],
    verificationStatus: "verified",
  },
  {
    id: "shake",
    slug: "yubie-shake",
    name: "Yubie Shake",
    descriptor: "Instant Purple Sweet Potato Drink",
    status: "coming-soon",
    image: "/products/yubie-shake.webp",
    imageAlt: "Kemasan pouch Yubie Shake 300 gram",
    eyebrow: "COMING SOON",
    story: "Format minuman ubi ungu praktis yang sedang kami siapkan untuk rutinitas modern.",
    sizes: [],
    verificationStatus: "required",
  },
  {
    id: "ppang",
    slug: "yubie-ppang",
    name: "Yubie Ppang",
    descriptor: "Korean-inspired purple sweet-potato bread",
    status: "coming-soon",
    image: "/photography/ppang-box.webp",
    imageAlt: "Yubie Ppang berbentuk bulat ungu dalam kotak premium",
    eyebrow: "COMING SOON",
    story: "Interpretasi bakery kontemporer dengan karakter ubi ungu yang khas dan format yang playful.",
    sizes: [],
    verificationStatus: "required",
  },
];

export const getProduct = (slug: string) => products.find((product) => product.slug === slug);
