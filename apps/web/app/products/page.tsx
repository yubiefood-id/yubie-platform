import type { Metadata } from "next";
import { ProductCatalog } from "@/components/commerce/product-catalog";
import { products } from "@/config/products";

export const metadata: Metadata = {
  title: "Our Products",
  description: "Belanja Yubie Flour, Shake, Ppang, dan Mie dengan pilihan ukuran dan harga dalam Rupiah.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return <main id="main" className="shop-page">
    <header><span className="eyebrow">OUR PRODUCTS</span><h1>Choose your Yubie.<br /><em>Build your basket.</em></h1><p>Empat format berbasis ubi untuk baking, minuman, snack, dan sajian gurih. Pilih varian langsung dari kartu produk atau buka detail untuk informasi lengkap.</p></header>
    <div className="shop-toolbar"><span>{products.length} produk · seluruh harga dalam Rupiah</span></div>
    <section aria-label="Katalog produk Yubie"><ProductCatalog products={products} /></section>
  </main>;
}
