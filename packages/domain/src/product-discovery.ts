import type { Product, ProductClaim } from "./index.js";

export type OfferingStatus = "available" | "coming-soon" | "b2b-only" | "informational";
export type PublicationStatus = "published" | "concept";

export interface RootVariety {
  id: string;
  slug: string;
  name: string;
  colour: string;
  colourHex: string;
  sensoryCharacter: string;
  textureCharacter: string;
  bestApplicationIds: string[];
  relatedProductIds: string[];
  claimIds: string[];
  image: string;
  imageAlt: string;
}

export interface ProductRootOffering {
  id: string;
  productId: string;
  rootId: string;
  status: OfferingStatus;
  sizeIds: string[];
  applicationIds: string[];
  specificationVersion?: string;
}

export interface FoodApplication {
  id: string;
  slug: string;
  name: string;
  descriptor: string;
  image: string;
  imageAlt: string;
  productIds: string[];
  rootIds: string[];
  recipeIds: string[];
}

export interface RecipeSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  productIds: string[];
  rootIds: string[];
  applicationId: string;
  publicationStatus: PublicationStatus;
  image: string;
  imageAlt: string;
}

export const productFamilies: Product[] = [
  {
    id: "flour",
    slug: "yubie-flour",
    name: "Yubie Flour",
    descriptor: "Tepung ubi serbaguna untuk baking, cooking, dan pengembangan produk pangan.",
    positioning: "EVERYDAY INGREDIENT",
    format: "flour",
    status: "available",
    image: "/photography/hero-lifestyle.webp",
    imageAlt: "Rangkaian produk Yubie termasuk kemasan Yubie Flour",
    eyebrow: "EVERYDAY INGREDIENT",
    story: "Satu format ingredient untuk kreasi B2C sehari-hari dan eksplorasi produk B2B.",
    sizes: [
      { id: "250g", label: "250 g", price: 15000, available: true, sku: "YBF-250" },
      { id: "500g", label: "500 g", price: 28000, available: true, sku: "YBF-500" },
      { id: "1kg", label: "1 kg", price: 52000, available: true, sku: "YBF-1000" },
    ],
    verificationStatus: "verified",
  },
  {
    id: "shake",
    slug: "yubie-shake",
    name: "Yubie Shake",
    descriptor: "Purple Sweet Potato Instant Puree",
    positioning: "PREMIUM CONVENIENCE",
    format: "shake",
    status: "coming-soon",
    image: "/products/yubie-shake.webp",
    imageAlt: "Konsep kemasan pouch Yubie Shake",
    eyebrow: "PREMIUM CONVENIENCE · COMING SOON",
    story: "Konsep format instan yang mudah disimpan, dibawa, dan disiapkan untuk ritme modern.",
    sizes: [],
    verificationStatus: "required",
    usageSteps: ["Pour", "Add Water", "Mix"],
  },
  {
    id: "ppang",
    slug: "yubie-ppang",
    name: "Yubie Ppang",
    descriptor: "Frozen Goguma Ppang · One Bite",
    positioning: "FROZEN ONE-BITE",
    format: "ppang",
    status: "coming-soon",
    image: "/photography/ppang-box.webp",
    imageAlt: "Konsep Yubie Ppang dalam kotak premium",
    eyebrow: "FROZEN ONE-BITE · COMING SOON",
    story: "Frozen convenience untuk disimpan, dipanaskan saat dibutuhkan, lalu dinikmati dalam format one-bite.",
    sizes: [],
    verificationStatus: "required",
    usageSteps: ["Keep Frozen", "Heat", "Enjoy"],
  },
];

export const getProductFamily = (slug: string) => productFamilies.find((product) => product.slug === slug);

export const productClaims: ProductClaim[] = [
  { id: "local", text: "Dikembangkan dari eksplorasi ubi Indonesia", approvalStatus: "approved", publicVisibility: true, scopeType: "brand", scopeId: "yubie" },
  { id: "multi", text: "Lima varietas, lima karakter kuliner", approvalStatus: "approved", publicVisibility: true, scopeType: "brand", scopeId: "yubie" },
  { id: "root-purple-anthocyanin", text: "Kaya antioksidan antosianin", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-ungu", verificationNote: "Requires evidence for the exact commercial root and approved wording." },
  { id: "root-honey-fibre", text: "Kaya serat", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-madu", verificationNote: "Requires compositional evidence and regulatory review." },
  { id: "root-honey-less-sugar", text: "Mengurangi penggunaan gula tambahan", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-madu", verificationNote: "Requires formulation evidence and approved comparative wording." },
  { id: "root-orange-beta-carotene", text: "Kaya beta-karoten (Vitamin A)", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-oranye", verificationNote: "Requires laboratory/compositional evidence and approved wording." },
  { id: "root-red-fibre", text: "Kaya serat pangan", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-merah", verificationNote: "Requires compositional evidence and regulatory review." },
  { id: "root-red-texture", text: "Penyeimbang tekstur tepung", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-merah", verificationNote: "Requires application testing for the commercial specification." },
  { id: "root-japanese-polyphenol", text: "Kaya polifenol", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-jepang", verificationNote: "Requires compositional evidence and regulatory review." },
  { id: "root-japanese-binding", text: "Daya ikat dough yang optimal", approvalStatus: "pending", publicVisibility: false, scopeType: "root", scopeId: "ubi-jepang", verificationNote: "Requires application testing and an approved comparison basis." },
  { id: "nutrition", text: "Nutrition facts require final verification", approvalStatus: "pending", publicVisibility: false, scopeType: "brand", scopeId: "yubie" },
  { id: "certification", text: "Certification information requires final verification", approvalStatus: "pending", publicVisibility: false, scopeType: "brand", scopeId: "yubie" },
];

export const publicClaimsFor = (claimIds: string[]) => productClaims.filter((claim) =>
  claimIds.includes(claim.id) && claim.approvalStatus === "approved" && claim.publicVisibility,
);

export const rootVarieties: RootVariety[] = [
  {
    id: "ubi-ungu",
    slug: "ubi-ungu",
    name: "Ubi Ungu",
    colour: "Ungu pekat",
    colourHex: "#68237f",
    sensoryCharacter: "Warna ungu alami dengan karakter rasa earthy yang lembut.",
    textureCharacter: "Arah eksplorasi untuk adonan berwarna dan kreasi panggang.",
    bestApplicationIds: ["pancakes", "brownies", "porridge"],
    relatedProductIds: ["flour", "shake", "ppang"],
    claimIds: ["root-purple-anthocyanin"],
    image: "/photography/ingredient-table.webp",
    imageAlt: "Studi bahan Yubie; foto spesifik Ubi Ungu masih menunggu produksi aset",
  },
  {
    id: "ubi-madu",
    slug: "ubi-madu",
    name: "Ubi Madu",
    colour: "Kuning madu",
    colourHex: "#c78a2d",
    sensoryCharacter: "Aroma manis alami dengan profil rasa yang familiar.",
    textureCharacter: "Arah eksplorasi untuk cookies dan cake.",
    bestApplicationIds: ["cookies", "cake"],
    relatedProductIds: ["flour"],
    claimIds: ["root-honey-fibre", "root-honey-less-sugar"],
    image: "/photography/ingredient-table.webp",
    imageAlt: "Studi bahan Yubie; foto spesifik Ubi Madu masih menunggu produksi aset",
  },
  {
    id: "ubi-oranye",
    slug: "ubi-oranye",
    name: "Ubi Oranye",
    colour: "Oranye hangat",
    colourHex: "#dc6f2f",
    sensoryCharacter: "Warna oranye hangat dengan rasa manis alami.",
    textureCharacter: "Arah eksplorasi untuk cake dan porridge.",
    bestApplicationIds: ["cake", "porridge"],
    relatedProductIds: ["flour"],
    claimIds: ["root-orange-beta-carotene"],
    image: "/photography/ingredient-table.webp",
    imageAlt: "Studi bahan Yubie; foto spesifik Ubi Oranye masih menunggu produksi aset",
  },
  {
    id: "ubi-merah",
    slug: "ubi-merah",
    name: "Ubi Merah",
    colour: "Merah tanah",
    colourHex: "#9f3d42",
    sensoryCharacter: "Karakter rasa bersahaja dengan rona merah alami.",
    textureCharacter: "Arah eksplorasi untuk brownies dan noodles.",
    bestApplicationIds: ["brownies", "noodles"],
    relatedProductIds: ["flour"],
    claimIds: ["root-red-fibre", "root-red-texture"],
    image: "/photography/ingredient-table.webp",
    imageAlt: "Studi bahan Yubie; foto spesifik Ubi Merah masih menunggu produksi aset",
  },
  {
    id: "ubi-jepang",
    slug: "ubi-jepang",
    name: "Ubi Jepang",
    colour: "Krem keemasan",
    colourHex: "#d5b37a",
    sensoryCharacter: "Profil lembut dengan rasa manis yang halus.",
    textureCharacter: "Arah eksplorasi untuk dough, ppang, dan noodles.",
    bestApplicationIds: ["cake", "noodles"],
    relatedProductIds: ["flour", "ppang"],
    claimIds: ["root-japanese-polyphenol", "root-japanese-binding"],
    image: "/photography/ingredient-table.webp",
    imageAlt: "Studi bahan Yubie; foto spesifik Ubi Jepang masih menunggu produksi aset",
  },
];

export const productRootOfferings: ProductRootOffering[] = [
  {
    id: "flour-ubi-ungu",
    productId: "flour",
    rootId: "ubi-ungu",
    status: "available",
    sizeIds: ["250g", "500g", "1kg"],
    applicationIds: ["pancakes", "cookies", "brownies", "cake", "noodles", "porridge"],
    specificationVersion: "public-catalog-v1",
  },
  ...["ubi-madu", "ubi-oranye", "ubi-merah", "ubi-jepang"].map((rootId) => ({
    id: `flour-${rootId}`,
    productId: "flour",
    rootId,
    status: "b2b-only" as const,
    sizeIds: [],
    applicationIds: rootVarieties.find((root) => root.id === rootId)?.bestApplicationIds ?? [],
  })),
  {
    id: "shake-ubi-ungu",
    productId: "shake",
    rootId: "ubi-ungu",
    status: "coming-soon",
    sizeIds: [],
    applicationIds: ["porridge"],
  },
  {
    id: "ppang-ubi-ungu",
    productId: "ppang",
    rootId: "ubi-ungu",
    status: "coming-soon",
    sizeIds: [],
    applicationIds: [],
  },
];

export const foodApplications: FoodApplication[] = [
  { id: "pancakes", slug: "pancakes", name: "Pancakes", descriptor: "Breakfast canvas dengan karakter warna dan rasa dari root pilihan.", image: "/photography/ingredient-table.webp", imageAlt: "Studi bahan Yubie sebagai visual sementara untuk aplikasi pancakes", productIds: ["flour"], rootIds: ["ubi-ungu"], recipeIds: ["purple-pancakes"] },
  { id: "cookies", slug: "cookies", name: "Cookies", descriptor: "Eksplorasi tekstur dan warna untuk everyday baking.", image: "/photography/brand-foundation.webp", imageAlt: "Studi produk Yubie sebagai visual sementara untuk aplikasi cookies", productIds: ["flour"], rootIds: ["ubi-madu"], recipeIds: ["soft-cookies"] },
  { id: "brownies", slug: "brownies", name: "Brownies", descriptor: "Format panggang dengan visual root yang distinctive.", image: "/photography/photography-direction.webp", imageAlt: "Arah fotografi Yubie sebagai visual sementara untuk aplikasi brownies", productIds: ["flour"], rootIds: ["ubi-ungu", "ubi-merah"], recipeIds: ["yubie-brownies"] },
  { id: "cake", slug: "cake", name: "Cake", descriptor: "Ruang eksplorasi untuk cake rumahan dan pengembangan bakery.", image: "/photography/ingredient-table.webp", imageAlt: "Studi bahan Yubie sebagai visual sementara untuk aplikasi cake", productIds: ["flour"], rootIds: ["ubi-madu", "ubi-oranye", "ubi-jepang"], recipeIds: [] },
  { id: "noodles", slug: "noodles", name: "Noodles", descriptor: "Aplikasi savoury yang memperluas kemungkinan tepung ubi.", image: "/photography/brand-foundation.webp", imageAlt: "Studi bahan Yubie sebagai visual sementara untuk aplikasi noodles", productIds: ["flour"], rootIds: ["ubi-merah", "ubi-jepang"], recipeIds: [] },
  { id: "porridge", slug: "porridge", name: "Porridge", descriptor: "Ide breakfast lembut berbasis eksplorasi root.", image: "/photography/shake-preparation.webp", imageAlt: "Studi penyajian Yubie sebagai visual sementara untuk aplikasi porridge", productIds: ["flour", "shake"], rootIds: ["ubi-ungu", "ubi-oranye"], recipeIds: ["creamy-bowl"] },
];

export const recipes: RecipeSummary[] = [
  { id: "purple-pancakes", slug: "purple-pancakes", title: "Purple Pancakes", category: "Breakfast", productIds: ["flour"], rootIds: ["ubi-ungu"], applicationId: "pancakes", publicationStatus: "concept", image: "/photography/ingredient-table.webp", imageAlt: "Studi bahan Yubie untuk konsep Purple Pancakes" },
  { id: "yubie-brownies", slug: "yubie-brownies", title: "Yubie Brownies", category: "Baking", productIds: ["flour"], rootIds: ["ubi-ungu", "ubi-merah"], applicationId: "brownies", publicationStatus: "concept", image: "/photography/photography-direction.webp", imageAlt: "Arah fotografi Yubie untuk konsep brownies" },
  { id: "soft-cookies", slug: "soft-cookies", title: "Soft Sweet Potato Cookies", category: "Snacks", productIds: ["flour"], rootIds: ["ubi-madu"], applicationId: "cookies", publicationStatus: "concept", image: "/photography/brand-foundation.webp", imageAlt: "Studi produk Yubie untuk konsep cookies" },
  { id: "yubie-ppang", slug: "yubie-ppang", title: "Yubie Ppang", category: "One-bite", productIds: ["ppang"], rootIds: ["ubi-ungu", "ubi-jepang"], applicationId: "cake", publicationStatus: "concept", image: "/photography/ppang-box.webp", imageAlt: "Konsep Yubie Ppang dalam kotak premium" },
  { id: "creamy-bowl", slug: "creamy-bowl", title: "Creamy Breakfast Bowl", category: "Breakfast", productIds: ["shake"], rootIds: ["ubi-ungu"], applicationId: "porridge", publicationStatus: "concept", image: "/photography/shake-preparation.webp", imageAlt: "Studi penyajian Yubie untuk konsep breakfast bowl" },
];

export function filterRecipes(productId?: string, rootId?: string): RecipeSummary[] {
  return recipes.filter((recipe) =>
    (!productId || recipe.productIds.includes(productId)) &&
    (!rootId || recipe.rootIds.includes(rootId)),
  );
}
