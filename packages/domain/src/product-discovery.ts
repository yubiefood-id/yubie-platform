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
    descriptor: "Tepung ubi jalar ungu Ayamurasaki untuk baking, cooking, dan kreasi sehari-hari.",
    positioning: "EVERYDAY INGREDIENT",
    format: "flour",
    status: "available",
    image: "/products/yubie-flour.webp",
    imageAlt: "Konsep kemasan Yubie Flour—pouch tepung ubi jalar ungu",
    eyebrow: "EVERYDAY INGREDIENT",
    story: "Tepung berbahan ubi jalar ungu Ayamurasaki untuk dapur rumah, bakery, dan pengembangan produk pangan.",
    sizes: [
      { id: "250g", label: "250 g", price: 35000, available: true, sku: "YBF-250" },
      { id: "1kg", label: "1 kg", price: 120000, available: true, sku: "YBF-1000" },
    ],
    verificationStatus: "verified",
    ingredients: "Ubi jalar ungu varietas Ayamurasaki.",
    producer: "PT Nutrihealth Karya Indonesia",
    pack: "Pouch 250 g atau 1 kg.",
    shelfLife: "2 tahun sesuai dokumen informasi kemasan; tanggal kedaluwarsa pada kemasan tetap menjadi acuan.",
  },
  {
    id: "shake",
    slug: "yubie-shake",
    name: "Yubie Shake",
    descriptor: "Minuman serbuk instan berbasis ubi jalar ungu.",
    positioning: "PREMIUM CONVENIENCE",
    format: "shake",
    status: "available",
    image: "/products/yubie-shake.webp",
    imageAlt: "Konsep kemasan Yubie Shake—pouch minuman serbuk instan ubi ungu",
    eyebrow: "PREMIUM CONVENIENCE",
    story: "Format minuman serbuk berbasis ubi ungu yang praktis disiapkan untuk rutinitas modern.",
    sizes: [
      { id: "sachet", label: "1 sachet · 45 g", price: 19500, available: true, sku: "YBS-045" },
      { id: "pack-7", label: "Pack · 7 sachet", price: 129000, available: true, sku: "YBS-7X45" },
    ],
    verificationStatus: "verified",
    usageSteps: ["Pour", "Add Water", "Mix"],
    ingredients: "Tepung ubi ungu, susu bubuk, kacang kenari, tepung putih telur, gula aren, dan Lactobacillus plantarum Dad-13.",
    preparation: "Tuangkan 1 sachet ke gelas atau shaker, tambahkan 250–300 mL air suhu ruang, aduk atau kocok hingga rata, diamkan 1–2 menit, lalu aduk kembali.",
    producer: "PT Nutrihealth Karya Indonesia",
    pack: "Sachet 45 g; tersedia satuan atau pack isi 7 sachet.",
  },
  {
    id: "ppang",
    slug: "yubie-ppang",
    name: "Yubie Ppang",
    descriptor: "Frozen Goguma Ppang · One Bite",
    positioning: "FROZEN ONE-BITE",
    format: "ppang",
    status: "available",
    image: "/products/yubie-ppang-concept.webp",
    imageAlt: "Studi visual Yubie Ppang berupa roti ubi one-bite dalam kotak ungu tanpa klaim kemasan",
    eyebrow: "FROZEN ONE-BITE",
    story: "Ppang berbasis ubi Cilembu dalam pilihan mini dan maxi—hangatkan saat ingin menikmati tekstur dan filling-nya.",
    sizes: [
      { id: "mini", label: "1 Mini Ppang · 35 g", price: 9000, available: true, sku: "YBP-MINI-035" },
      { id: "maxi", label: "1 Maxi Ppang", price: 19000, available: true, sku: "YBP-MAXI" },
      { id: "mini-pack-5", label: "Pack · 5 Mini Ppang", price: 42000, available: true, sku: "YBP-MINI-5" },
    ],
    verificationStatus: "verified",
    usageSteps: ["Keep Frozen", "Heat", "Enjoy"],
    ingredients: "Ubi Cilembu, tepung tapioka, margarin, susu cair, gula pasir, telur, tepung beras, tepung terigu, susu bubuk, minyak kelapa sawit, gula palem, dark chocolate, white chocolate, keju oles, keju cheddar, whipping cream, butter, dan garam.",
    preparation: "Hangatkan sebelum disajikan: microwave 15–20 detik, air fryer 150°C selama 3–5 menit, atau oven 150°C selama 5–7 menit.",
    producer: "PT Nutrihealth Karya Indonesia",
    pack: "Mini Ppang 35 g per buah; pack mini berisi 5 buah.",
  },
  {
    id: "mie",
    slug: "yubie-mie",
    name: "Yubie Mie",
    descriptor: "Mie berbahan tepung ubi ungu untuk sajian praktis sehari-hari.",
    positioning: "SAVOURY EVERYDAY",
    format: "mie",
    status: "available",
    image: "/products/yubie-mie-concept.webp",
    imageAlt: "Studi visual Yubie Mie berupa sajian mie ubi dengan kemasan konsep tanpa klaim",
    eyebrow: "SAVOURY EVERYDAY",
    story: "Format mie praktis yang memperluas keluarga Yubie dari baking dan minuman ke sajian gurih.",
    sizes: [
      { id: "single", label: "1 bungkus · 75 g", price: 16000, available: true, sku: "YBM-075" },
      { id: "pack-3", label: "Pack · 3 bungkus", price: 45000, available: true, sku: "YBM-3X75" },
    ],
    verificationStatus: "verified",
    ingredients: "Tepung ubi ungu, tepung tapioka, tepung terigu, garam, dan agar-agar.",
    preparation: "Didihkan sekitar 400 mL air, masukkan mie dan masak 3–4 menit, tiriskan, lalu campurkan dengan bumbu hingga merata.",
    producer: "PT Nutrihealth Karya Indonesia",
    pack: "75 g per bungkus; tersedia satuan atau pack isi 3.",
    usageSteps: ["Boil", "Drain", "Mix"],
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
    image: "/photography/roots/ubi-ungu.webp",
    imageAlt: "Studi visual ubi ungu utuh dan terbelah dengan daging berwarna ungu alami",
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
    image: "/photography/roots/ubi-madu.webp",
    imageAlt: "Studi visual ubi madu dengan kulit kemerahan dan daging berwarna kuning madu",
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
    image: "/photography/roots/ubi-oranye.webp",
    imageAlt: "Studi visual ubi oranye utuh dan terbelah dengan warna oranye hangat",
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
    image: "/photography/roots/ubi-merah.webp",
    imageAlt: "Studi visual ubi merah dengan kulit merah tanah dan tekstur panen yang alami",
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
    image: "/photography/roots/ubi-jepang.webp",
    imageAlt: "Studi visual ubi Jepang dengan kulit ungu kemerahan dan daging krem keemasan",
  },
];

export const productRootOfferings: ProductRootOffering[] = [
  {
    id: "flour-ubi-ungu",
    productId: "flour",
    rootId: "ubi-ungu",
    status: "available",
    sizeIds: ["250g", "1kg"],
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
    status: "available",
    sizeIds: ["sachet", "pack-7"],
    applicationIds: ["porridge"],
  },
  {
    id: "ppang-ubi-ungu",
    productId: "ppang",
    rootId: "ubi-ungu",
    status: "available",
    sizeIds: ["mini", "maxi", "mini-pack-5"],
    applicationIds: [],
  },
  {
    id: "mie-ubi-ungu",
    productId: "mie",
    rootId: "ubi-ungu",
    status: "available",
    sizeIds: ["single", "pack-3"],
    applicationIds: ["noodles"],
  },
];

export const foodApplications: FoodApplication[] = [
  { id: "pancakes", slug: "pancakes", name: "Pancakes", descriptor: "Breakfast canvas dengan karakter warna dan rasa dari root pilihan.", image: "/photography/applications/pancakes.webp", imageAlt: "Studi sajian pancake ubi ungu dengan pisang dan taburan kelapa", productIds: ["flour"], rootIds: ["ubi-ungu"], recipeIds: ["purple-pancakes"] },
  { id: "cookies", slug: "cookies", name: "Cookies", descriptor: "Eksplorasi tekstur dan warna untuk everyday baking.", image: "/photography/applications/cookies.webp", imageAlt: "Studi sajian soft cookies ubi dengan marbling ungu dan keemasan", productIds: ["flour"], rootIds: ["ubi-madu"], recipeIds: ["soft-cookies"] },
  { id: "brownies", slug: "brownies", name: "Brownies", descriptor: "Format panggang dengan visual root yang distinctive.", image: "/photography/applications/brownies.webp", imageAlt: "Studi sajian brownies ubi ungu bertekstur lembut", productIds: ["flour"], rootIds: ["ubi-ungu", "ubi-merah"], recipeIds: ["yubie-brownies"] },
  { id: "cake", slug: "cake", name: "Cake", descriptor: "Ruang eksplorasi untuk cake rumahan dan pengembangan bakery.", image: "/photography/applications/cake.webp", imageAlt: "Studi sajian cake ubi keemasan dengan marbling ungu", productIds: ["flour"], rootIds: ["ubi-madu", "ubi-oranye", "ubi-jepang"], recipeIds: [] },
  { id: "noodles", slug: "noodles", name: "Noodles", descriptor: "Aplikasi savoury yang memperluas kemungkinan tepung ubi.", image: "/photography/applications/noodles.webp", imageAlt: "Studi sajian mie ubi dengan sayuran hijau dan potongan ubi panggang", productIds: ["flour"], rootIds: ["ubi-merah", "ubi-jepang"], recipeIds: [] },
  { id: "porridge", slug: "porridge", name: "Porridge", descriptor: "Ide breakfast lembut berbahan eksplorasi root.", image: "/photography/applications/porridge.webp", imageAlt: "Studi sajian bubur ubi ungu dengan pisang dan taburan wijen", productIds: ["flour", "shake"], rootIds: ["ubi-ungu", "ubi-oranye"], recipeIds: ["creamy-bowl"] },
];

export const recipes: RecipeSummary[] = [
  { id: "purple-pancakes", slug: "purple-pancakes", title: "Purple Pancakes", category: "Breakfast", productIds: ["flour"], rootIds: ["ubi-ungu"], applicationId: "pancakes", publicationStatus: "concept", image: "/photography/applications/pancakes.webp", imageAlt: "Konsep Purple Pancakes Yubie dengan pisang dan kelapa" },
  { id: "yubie-brownies", slug: "yubie-brownies", title: "Yubie Brownies", category: "Baking", productIds: ["flour"], rootIds: ["ubi-ungu", "ubi-merah"], applicationId: "brownies", publicationStatus: "concept", image: "/photography/applications/brownies.webp", imageAlt: "Konsep brownies ubi ungu Yubie" },
  { id: "soft-cookies", slug: "soft-cookies", title: "Soft Sweet Potato Cookies", category: "Snacks", productIds: ["flour"], rootIds: ["ubi-madu"], applicationId: "cookies", publicationStatus: "concept", image: "/photography/applications/cookies.webp", imageAlt: "Konsep soft cookies berbahan ubi untuk Yubie" },
  { id: "yubie-ppang", slug: "yubie-ppang", title: "Yubie Ppang", category: "One-bite", productIds: ["ppang"], rootIds: ["ubi-ungu", "ubi-jepang"], applicationId: "cake", publicationStatus: "concept", image: "/products/yubie-ppang-concept.webp", imageAlt: "Studi visual Yubie Ppang one-bite dalam kotak ungu tanpa klaim kemasan" },
  { id: "creamy-bowl", slug: "creamy-bowl", title: "Creamy Breakfast Bowl", category: "Breakfast", productIds: ["shake"], rootIds: ["ubi-ungu"], applicationId: "porridge", publicationStatus: "concept", image: "/photography/applications/porridge.webp", imageAlt: "Konsep creamy breakfast bowl ubi ungu Yubie" },
];

export function filterRecipes(productId?: string, rootId?: string): RecipeSummary[] {
  return recipes.filter((recipe) =>
    (!productId || recipe.productIds.includes(productId)) &&
    (!rootId || recipe.rootIds.includes(rootId)),
  );
}
