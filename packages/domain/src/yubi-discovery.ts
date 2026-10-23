import { productFamilies } from "./product-discovery.js";

export const YUBI_CATALOG_VERSION = "october-2026-commercial-v1";
export interface ApprovedYubiPhoto {
  assetId: string;
  productId: string;
  kind: "final-photograph";
  approvalStatus: "approved";
  approvalRef: string;
  sha256: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  byteLength: number;
  width: number;
  height: number;
}
/** Add only reviewed final photographs and exact processed-file digests. Concepts are ineligible. */
export const approvedYubiPhotos: readonly ApprovedYubiPhoto[] = [];

export function resolveYubiProduct(id: string, photos = approvedYubiPhotos) {
  const p=productFamilies.find(p=>p.id===id && p.status==="available");
  if(!p || !/^yubie-(flour|shake|ppang|mie)$/.test(p.slug))return null;
  const variants=p.sizes.filter(v=>v.available && Number.isInteger(v.price) && v.price!>0);
  if(!variants.length)return null;
  const photo=photos.find(a=>a.productId===p.id && a.kind==="final-photograph" && a.approvalStatus==="approved" && !!a.approvalRef);
  return {
    id:p.id,name:p.name,description:p.descriptor,
    variantPrices:variants.map(v=>v.price!),
    variantRows:variants.map(v=>`${v.label} — Rp${v.price!.toLocaleString("id-ID")}`),
    websiteUrl:`https://yubiefood.com/products/${p.slug}`,
    catalogVersion:YUBI_CATALOG_VERSION,
    ...(photo?{assetId:photo.assetId}:{}),
  };
}
