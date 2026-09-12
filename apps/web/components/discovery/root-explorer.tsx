"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { foodApplications, productFamilies, rootVarieties } from "@yubie/domain";
import { trackEvent } from "@/lib/analytics";

export function RootExplorer({ compact = false }: { compact?: boolean }) {
  const [activeId, setActiveId] = useState(rootVarieties[0].id);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = rootVarieties.find((root) => root.id === activeId) ?? rootVarieties[0];
  const applications = active.bestApplicationIds.map((id) => foodApplications.find((item) => item.id === id)).filter(Boolean);
  const products = active.relatedProductIds.map((id) => productFamilies.find((item) => item.id === id)).filter(Boolean);

  useEffect(() => { trackEvent("root_discovery_view", { surface: compact ? "homepage" : "our_roots" }); }, [compact]);

  const select = (id: string, source: "pointer" | "keyboard") => {
    setActiveId(id);
    trackEvent("root_selector_change", { root_id: id, surface: compact ? "homepage" : "our_roots", source });
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rootVarieties.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + rootVarieties.length) % rootVarieties.length;
    select(rootVarieties[next].id, "keyboard");
    tabs.current[next]?.focus();
  };

  return <div className={`root-explorer${compact ? " compact" : ""}`}>
    <div className="root-tabs" role="tablist" aria-label="Pilih varietas ubi">
      {rootVarieties.map((root, index) => <button
        ref={(element) => { tabs.current[index] = element; }}
        key={root.id}
        id={`root-tab-${root.id}`}
        role="tab"
        aria-selected={active.id === root.id}
        aria-controls="root-panel"
        tabIndex={active.id === root.id ? 0 : -1}
        onMouseEnter={() => select(root.id, "pointer")}
        onFocus={() => setActiveId(root.id)}
        onClick={() => select(root.id, "pointer")}
        onKeyDown={(event) => onKeyDown(index, event)}
      ><span style={{ background: root.colourHex }} aria-hidden="true" /><b>0{index + 1}</b>{root.name}</button>)}
    </div>
    <section id="root-panel" className="root-panel" role="tabpanel" aria-labelledby={`root-tab-${active.id}`} tabIndex={0}>
      <div className="root-visual">
        <Image src={active.image} alt={active.imageAlt} fill sizes="(max-width: 800px) 100vw, 48vw" unoptimized />
        <span className="asset-note">Approved Yubie ingredient study · varietal photography pending</span>
      </div>
      <div className="root-detail">
        <span className="eyebrow">{active.colour}</span>
        <h3>{active.name}</h3>
        <p className="root-character">{active.sensoryCharacter}</p>
        <p>{active.textureCharacter}</p>
        <dl><div><dt>Best applications</dt><dd>{applications.map((item) => item?.name).join(" · ")}</dd></div><div><dt>Related products</dt><dd>{products.map((item) => item?.name).join(" · ")}</dd></div></dl>
        {!compact && <Link className="text-link" href={`/recipes?root=${active.slug}`}>Explore recipes <span>→</span></Link>}
      </div>
    </section>
  </div>;
}
