import Image from "next/image";
import Link from "next/link";

export function EditorialPage({ eyebrow, title, intro, image = "/photography/ingredient-table.webp", children }: { eyebrow: string; title: string; intro: string; image?: string; children: React.ReactNode }) {
  return <main id="main" className="editorial-page"><header><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="editorial-image"><Image src={image} alt="" fill priority sizes="100vw" unoptimized /></div><div className="editorial-body">{children}<Link className="text-link" href="/shop">Explore Yubie <span>→</span></Link></div></main>;
}
