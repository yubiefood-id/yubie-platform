import type { Metadata } from "next";
import { ProductCard } from "@/components/commerce/product-card";
import { products } from "@/config/products";

export const metadata: Metadata = { title: "Shop", description: "Belanja keluarga produk Yubie." };
export default function ShopPage() { return <main id="main" className="shop-page"><header><span className="eyebrow">SHOP THE ROOTS</span><h1>Made to make<br /><em>something good.</em></h1><p>Produk berbasis ubi Indonesia untuk rutinitas, eksperimen, dan kreasi masa kini.</p></header><div className="shop-toolbar"><span>{products.length} products</span><div><button className="active">All</button><button>Available</button><button>Coming Soon</button></div></div><section className="product-grid">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</section></main>; }
