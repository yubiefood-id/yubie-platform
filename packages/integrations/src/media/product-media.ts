import { createHash } from "node:crypto";
import { lstat,readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { approvedYubiPhotos, type ApprovedYubiPhoto } from "@yubie/domain";

export interface ProductMediaStore {root: string; assets: readonly ApprovedYubiPhoto[];}
export const defaultProductMediaStore: ProductMediaStore = {root:fileURLToPath(new URL("../../assets/product-media/",import.meta.url)),assets:approvedYubiPhotos};
export async function loadProductPhoto(store: ProductMediaStore, productId: string, assetId: string) {
  const a=store.assets.find(a=>a.productId===productId && a.assetId===assetId);
  if(!a || a.kind!=="final-photograph" || a.approvalStatus!=="approved" || !a.approvalRef || !/^[a-f0-9]{64}$/.test(a.sha256) || a.fileName!==`${a.sha256}.${a.mimeType==="image/png"?"png":"jpg"}`)throw new Error("media_not_approved");
  const path=resolve(store.root,a.fileName);
  const stat=await lstat(path);
  if(!stat.isFile() || stat.size>5*1024*1024 || stat.size!==a.byteLength)throw new Error("invalid_media_file");
  const bytes=await readFile(path);
  if(bytes.length!==a.byteLength || bytes.length>5*1024*1024 || createHash("sha256").update(bytes).digest("hex")!==a.sha256)throw new Error("invalid_media_bytes");
  const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:"warning"});
  const meta=await image.metadata();
  if((meta.format!=="jpeg" && meta.format!=="png") || (meta.format==="png"?"image/png":"image/jpeg")!==a.mimeType || meta.width!==a.width || meta.height!==a.height || Math.max(a.width,a.height)>1600 || meta.exif || meta.pages && meta.pages>1)throw new Error("invalid_media_format");
  await image.raw().toBuffer();
  return {bytes,asset:a};
}
