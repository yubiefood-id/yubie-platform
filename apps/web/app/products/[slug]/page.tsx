import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/commerce/product-detail";
import { getProduct, products } from "@/config/products";

export function generateStaticParams() { return products.map((product) => ({ slug: product.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const product = getProduct(slug); if (!product) return {}; return { title: product.name, description: product.descriptor, alternates: { canonical: `/products/${product.slug}` } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const product = getProduct(slug); if (!product) notFound(); return <main id="main"><ProductDetail product={product} /></main>; }
