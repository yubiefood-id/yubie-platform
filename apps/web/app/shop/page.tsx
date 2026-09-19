import type { Metadata } from "next";
import { ProductCard } from "@/components/commerce/product-card";
import { products } from "@/config/products";

export const metadata: Metadata = { title: "Produk", description: "Temukan produk Yubie dan beli melalui marketplace partner resmi." };
export default function ShopPage() {
  return <main id="main" className="shop-page"><header><span className="eyebrow">TEMUKAN PRODUK</span><h1>Made to make<br /><em>something good.</em></h1><p>Produk berbasis ubi Indonesia untuk rutinitas, eksperimen, dan kreasi masa kini. Pembelian D2C melalui marketplace partner—bukan checkout di yubie.id.</p></header><div className="shop-toolbar"><span>{products.length} produk</span></div><section className="product-grid">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</section></main>;
}
