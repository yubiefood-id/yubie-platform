"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

export interface HeroVideoSource {
  src: string;
  /** CSS media query selecting this rendition, e.g. "(max-width: 700px)". */
  media?: string;
}

interface VideoHeroProps {
  poster: string;
  posterAlt: string;
  /**
   * Responsive H.264 renditions derived from the single user-supplied hero
   * video. The poster is always the LCP element; the video never blocks it
   * (preload="none", play attempted only after mount, never under
   * reduced-motion or data-saving preferences).
   */
  videoSources?: HeroVideoSource[];
}

export function VideoHero({ poster, posterAlt, videoSources }: VideoHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSources?.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    video.play().catch(() => { /* autoplay refused: poster remains visible */ });
  }, [videoSources]);

  return <section className="hero" aria-labelledby="hero-title">
    {videoSources?.length
      ? <video className="hero-video" ref={videoRef} poster={poster} muted loop playsInline preload="none" aria-hidden="true">{videoSources.map((source) => <source key={source.src} src={source.src} media={source.media} />)}</video>
      : <Image className="hero-image" src={poster} alt={posterAlt} fill priority sizes="100vw" unoptimized />}
    <div className="hero-scrim" />
    <div className="hero-copy"><span className="eyebrow light-text">INDONESIAN ROOTS. MODERN NOURISHMENT.</span><h1 id="hero-title">ROOTED HERE.<br /><em>MADE FOR NOW.</em></h1><p>Temui cara baru menikmati ubi Indonesia—berbahan lokal, dibuat praktis untuk baking, breakfast, dan kreasi sehari-hari.</p><div className="hero-actions"><Link className="button gold" href="/products" onClick={() => trackEvent("hero_cta_click", { target: "products" })}>Shop Products <span>↗</span></Link><Link className="text-link light-text" href="/our-roots" onClick={() => trackEvent("hero_cta_click", { target: "our-roots" })}>Discover Our Roots <span>→</span></Link></div></div>
    <div className="hero-index"><span>01</span><i /><small>SCROLL TO DISCOVER</small></div>
  </section>;
}
