"use client";

import { useMemo, useState } from "react";
import type { Product } from "@yubie/domain";
import { ProductCard } from "./product-card";

type CatalogFilter = "all" | "pantry" | "drink" | "snack";

const FILTERS: Array<{ id: CatalogFilter; label: string; productIds: string[] }> = [
  { id: "all", label: "Semua", productIds: [] },
  { id: "pantry", label: "Pantry", productIds: ["flour", "mie"] },
  { id: "drink", label: "Minuman", productIds: ["shake"] },
  { id: "snack", label: "Snack", productIds: ["ppang"] },
];

export function ProductCatalog({ products, showFilters = true }: { products: Product[]; showFilters?: boolean }) {
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const visible = useMemo(() => {
    const selected = FILTERS.find((item) => item.id === filter);
    return !selected || selected.productIds.length === 0 ? products : products.filter((product) => selected.productIds.includes(product.id));
  }, [filter, products]);

  return <>
    {showFilters && <div className="catalog-filter" role="group" aria-label="Filter produk">
      {FILTERS.map((item) => {
        const count = item.productIds.length === 0 ? products.length : products.filter((product) => item.productIds.includes(product.id)).length;
        return <button type="button" key={item.id} className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} <span>{count}</span></button>;
      })}
    </div>}
    <div className="product-grid commerce-grid" aria-live="polite">{visible.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>
  </>;
}
