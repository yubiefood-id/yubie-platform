import { resolve } from "node:path";
import { verifyCatalogOutput } from "./catalog-artifact.mjs";

const manifest = await verifyCatalogOutput(resolve(process.argv[2] || ".vercel/output"));
console.log(JSON.stringify({ status: "CATALOG_ARTIFACT_VERIFIED", ...manifest }));
