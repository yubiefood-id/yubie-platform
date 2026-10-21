import { productFamilies } from "@yubie/domain";

// Only commercially approved catalog facts belong in the shared domain source.
// Label and safety specifications remain unpublished pending exact-SKU approval.
export const products = productFamilies;
export const getProduct = (slug: string) => products.find((product) => product.slug === slug);
