import type { Metadata } from "next";
import { ProductCard } from "@/components/commerce/product-card";
import { products } from "@/config/products";

export const metadata: Metadata = {
  title: "Our Products",
  description: "Keluarga produk Yubie berbahan ubi Indonesia—Yubie Flour tersedia sekarang melalui marketplace partner resmi.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return <main id="main" className="shop-page">
    <header><span className="eyebrow">OUR PRODUCTS</span><h1>One root family.<br /><em>Made for everyday.</em></h1><p>Produk berbahan ubi Indonesia untuk rutinitas, eksperimen, dan kreasi masa kini. Yubie Flour tersedia sekarang; format lain menyusul seiring verifikasi produk.</p></header>
    <div className="shop-toolbar"><span>{products.length} produk · Yubie Flour tersedia sekarang</span></div>
    <section className="product-grid" aria-label="Katalog produk Yubie">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</section>
  </main>;
}
