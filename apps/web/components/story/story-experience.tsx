"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

const chapters = [
  { id: "origin", label: "Our Story", number: "01" },
  { id: "education", label: "Education", number: "02" },
  { id: "documentation", label: "Documentation", number: "03" },
  { id: "team", label: "Our Team", number: "04" },
] as const;

const educationCards = [
  {
    id: "ubi-ube",
    label: "Ubi ≠ Ube",
    kicker: "KENALI AKARNYA",
    title: "Sama-sama ungu. Bukan tanaman yang sama.",
    body: "Ubi ungu Indonesia adalah ubi jalar (Ipomoea batatas), sedangkan ube yang populer dalam kuliner Filipina adalah yam (Dioscorea alata). Keduanya punya identitas sendiri—ubi lokal tidak perlu menjadi ube untuk terasa relevan.",
    note: "Identitas bahan dimulai dari nama yang tepat.",
  },
  {
    id: "diversity",
    label: "Pangan beragam",
    kicker: "BANGUN POLA, BUKAN MITOS",
    title: "Tidak ada satu pangan yang mengerjakan semuanya.",
    body: "Umbi, kacang-kacangan, sayur, buah, serealia, dan sumber protein bekerja sebagai bagian dari pola makan yang beragam. Yubie tidak diposisikan sebagai obat atau jalan pintas, tetapi sebagai salah satu cara membawa pangan lokal ke pilihan sehari-hari.",
    note: "Pilihan kecil menjadi berarti ketika dilakukan berulang kali.",
  },
  {
    id: "evidence",
    label: "Bukti gizi",
    kicker: "CLAIM WITH CARE",
    title: "Potensi bahan bukan otomatis klaim produk.",
    body: "Karakter ubi jalar dipengaruhi varietas dan proses. Karena itu, informasi nilai gizi, serat, umur simpan, alergen, dan klaim pada produk akhir hanya boleh dipublikasikan setelah pengujian serta persetujuan label yang sesuai.",
    note: "Riset memberi arah. Verifikasi produk memberi izin untuk berbicara.",
  },
  {
    id: "formats",
    label: "Root to format",
    kicker: "FOOD TECHNOLOGY IN PRACTICE",
    title: "Satu akar. Banyak cara untuk hadir.",
    body: "Pengolahan memperpanjang kemungkinan penggunaan ubi: dari bahan segar menuju tepung dan format pangan modern seperti shake, ppang, serta mie. Setiap format tetap memerlukan spesifikasi, pengujian, dan cara penyajian yang sesuai.",
    note: "Praktis bukan berarti menghapus proses—justru membuat prosesnya lebih disiplin.",
  },
] as const;

const team = [
  {
    name: "Nadhya Shafa",
    role: "Chief Executive Officer",
    discipline: "Agribisnis · FEM IPB",
    focus: "Koordinasi tim, strategi bisnis, keputusan, dan kemitraan rantai pasok.",
    mark: "NS",
  },
  {
    name: "Nadira Mumtaz Fauzia",
    role: "Chief Production Officer",
    discipline: "Ilmu Gizi · FKGiz IPB",
    focus: "Pengembangan produk, standardisasi proses, kendali mutu, dan dokumentasi produksi.",
    mark: "NM",
  },
  {
    name: "Renata Azrarefa",
    role: "Chief Marketing Officer",
    discipline: "Manajemen Industri Jasa Makanan dan Gizi · SV IPB",
    focus: "Riset pasar, brand, komunikasi produk, pemasaran B2C/B2B, dan validasi konsumen.",
    mark: "RA",
  },
  {
    name: "Dr.agr. Eny Palupi, S.TP., M.Sc.",
    role: "Pembimbing Teknis",
    discipline: "Food Science and Nutrition · IPB University",
    focus: "Pendampingan teknis untuk pengembangan pangan lokal, formulasi, dan jalur pembuktian ilmiah.",
    mark: "EP",
  },
] as const;

const journey = [
  ["01", "Melihat yang dekat", "Ubi jalar Indonesia sudah akrab, tetapi potensinya belum selalu hadir dalam format yang dekat dengan rutinitas modern."],
  ["02", "Membaca peluang", "Tim lintas agribisnis, gizi, dan food service memetakan bahan, proses, pengguna, serta peluang nilai tambah."],
  ["03", "Menguji bentuk", "Eksplorasi bergerak dari tepung menuju aplikasi—baking, minuman, ppang, mie, dan pengembangan untuk mitra pangan."],
  ["04", "Bertumbuh dengan bukti", "Produk, klaim, dan dampak dipisahkan dengan jelas: yang sudah terverifikasi dipublikasikan; yang masih diuji tetap menjadi agenda R&D."],
] as const;

const ecosystem = [
  {
    number: "01",
    title: "Akar lokal",
    label: "SOURCE",
    description: "Mulai dari identitas bahan, konteks Indonesia, dan hubungan yang transparan dengan rantai pasok.",
  },
  {
    number: "02",
    title: "Rancang format",
    label: "CREATE",
    description: "Terjemahkan karakter bahan menjadi tepung, shake, ppang, atau mie dengan tujuan penggunaan yang jelas.",
  },
  {
    number: "03",
    title: "Uji & catat",
    label: "VERIFY",
    description: "Spesifikasi proses, pengujian produk akhir, dan sumber bukti dicatat sebelum menjadi komunikasi publik.",
  },
  {
    number: "04",
    title: "Bawa ke meja",
    label: "SERVE",
    description: "Produk hadir sebagai pilihan pangan—bukan janji medis—dengan harga, format, dan penggunaan yang mudah dipahami.",
  },
] as const;

const productFormats = [
  { name: "Flour", role: "Fondasi serbaguna", cue: "baking · kitchen · B2B", href: "/products/yubie-flour" },
  { name: "Shake", role: "Format minuman", cue: "portion · mix · enjoy", href: "/products/yubie-shake" },
  { name: "Ppang", role: "Format bakery", cue: "heat · share · enjoy", href: "/products/yubie-ppang" },
  { name: "Mie", role: "Format hidangan", cue: "cook · pair · serve", href: "/products/yubie-mie" },
] as const;

const evidenceFlow = [
  ["01", "Source", "Asal data, dokumen, dan pemilik fakta jelas."],
  ["02", "Specify", "SKU, proses, versi, dan ruang lingkup ditentukan."],
  ["03", "Verify", "Bukti ditinjau terhadap produk akhir yang tepat."],
  ["04", "Approve", "Pemilik klaim memberi keputusan dan tanggal berlaku."],
  ["05", "Publish", "Hanya bahasa yang disetujui masuk ke kanal publik."],
] as const;

type ChapterId = (typeof chapters)[number]["id"];

export function StoryExperience() {
  const [activeChapter, setActiveChapter] = useState<ChapterId>("origin");
  const [activeEducation, setActiveEducation] = useState<(typeof educationCards)[number]["id"]>("ubi-ube");
  const progressRef = useRef<HTMLSpanElement>(null);
  const chapterNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("story-enhanced");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-story-chapter]"));
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-story-reveal]"));

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10%", threshold: 0.12 },
    );

    revealItems.forEach((item) => revealObserver.observe(item));

    let frame = 0;
    const updateProgress = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const available = document.documentElement.scrollHeight - window.innerHeight;
        const progress = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0;
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;

        const headerHeight = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 0;
        const chapterNavHeight = chapterNavRef.current?.offsetHeight ?? 0;
        const marker = headerHeight + chapterNavHeight + 24;
        const current = sections.find((section) => {
          const bounds = section.getBoundingClientRect();
          return bounds.top <= marker && bounds.bottom > marker;
        });
        if (current?.id) setActiveChapter(current.id as ChapterId);
      });
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      document.documentElement.classList.remove("story-enhanced");
      revealObserver.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  const activeEducationCard = educationCards.find((card) => card.id === activeEducation) ?? educationCards[0];

  const onEducationKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + educationCards.length) % educationCards.length;
    setActiveEducation(educationCards[nextIndex].id);
    document.getElementById(`education-tab-${educationCards[nextIndex].id}`)?.focus();
  };

  const navigateToChapter = (event: MouseEvent<HTMLAnchorElement>, chapterId: ChapterId) => {
    event.preventDefault();
    const target = document.getElementById(chapterId);
    if (!target) return;

    const headerHeight = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 0;
    const chapterNavHeight = chapterNavRef.current?.offsetHeight ?? 0;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - chapterNavHeight - 16);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setActiveChapter(chapterId);
    window.history.pushState(null, "", `#${chapterId}`);
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <main id="main" className="our-story-page">
      <div className="story-progress" aria-hidden="true"><span ref={progressRef} /></div>

      <header className="story-hero">
        <Image
          className="story-hero-image"
          src="/story/team-yubie.webp"
          alt="Kolaborator Yubie memperkenalkan Yubie Flour dalam sebuah sesi pengembangan produk"
          fill
          priority
          sizes="100vw"
          unoptimized
        />
        <div className="story-hero-scrim" />
        <div className="story-hero-copy">
          <span className="eyebrow light-text">OUR STORY · BOGOR, INDONESIA</span>
          <h1>Yang tumbuh dekat,<br /><em>layak punya masa depan besar.</em></h1>
          <p>Yubie lahir dari keyakinan bahwa ubi Indonesia dapat hadir dengan identitasnya sendiri—dipelajari dengan serius, diolah secara modern, dan diceritakan dengan jujur.</p>
          <a className="story-scroll-cue" href="#origin"><span>Mulai ceritanya</span><b aria-hidden="true">↓</b></a>
        </div>
        <p className="story-hero-caption">Dokumentasi tim dan kolaborator Yubie · 2026</p>
      </header>

      <nav ref={chapterNavRef} className="story-chapter-nav" aria-label="Bab Our Story">
        <div>
          {chapters.map((chapter) => (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              aria-current={activeChapter === chapter.id ? "location" : undefined}
              onClick={(event) => navigateToChapter(event, chapter.id)}
            >
              <span>{chapter.number}</span>{chapter.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="story-origin story-chapter" id="origin" data-story-chapter aria-labelledby="origin-title">
        <div className="story-origin-intro" data-story-reveal>
          <span className="story-chapter-number">01</span>
          <div>
            <span className="eyebrow">OUR STORY</span>
            <h2 id="origin-title">Bukan mencari bahan baru.<br /><em>Melihat kembali yang sudah kita punya.</em></h2>
          </div>
          <p>Di tengah makanan yang semakin seragam, Yubie memulai dari pertanyaan sederhana: bagaimana pangan yang tumbuh dekat dengan kita dapat menjadi mudah dipilih dalam kehidupan hari ini?</p>
        </div>

        <div className="story-origin-spread" data-story-reveal>
          <figure className="story-origin-main-image">
            <Image src="/story/local-food-exploration.webp" alt="Eksplorasi ubi ungu dan tepung ubi pada pameran pangan lokal" fill sizes="(max-width: 900px) 100vw, 58vw" unoptimized />
            <figcaption>Pangan lokal memberi titik awal; pengembangan produk memberi jalan untuk membawanya lebih jauh.</figcaption>
          </figure>
          <div className="story-origin-copy">
            <p className="story-dropcap">Nama <strong>Yubie</strong> berangkat dari “Yubi”—penanda ubi jalar sebagai bahan utama—dan “Bie”, bunyi yang ringan, ramah, dan mudah diingat.</p>
            <p>Namun Yubie bukan sekadar nama untuk tepung atau satu jenis produk. Ia adalah cara kerja: memahami karakter bahan, merancang format yang relevan, lalu menahan diri dari klaim yang belum selesai dibuktikan.</p>
            <blockquote>“Ubi lokal tidak harus menjadi ube untuk naik kelas.”</blockquote>
          </div>
        </div>

        <div className="story-journey" aria-label="Perjalanan pengembangan Yubie" data-story-reveal>
          <div className="story-journey-line" aria-hidden="true" />
          {journey.map(([number, title, description]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <section className="story-ecosystem" aria-labelledby="ecosystem-title" data-story-reveal>
          <header>
            <span className="eyebrow">FROM ROOT TO RELEVANCE</span>
            <h3 id="ecosystem-title">Nilai tidak berhenti di bahan.<br /><em>Ia dibangun sebagai sistem.</em></h3>
            <p>Setiap tahap menjawab pertanyaan yang berbeda: apa bahannya, untuk siapa formatnya, bukti apa yang tersedia, dan bagaimana produk dipahami saat sampai di meja.</p>
          </header>
          <div className="ecosystem-map">
            {ecosystem.map((item) => (
              <article key={item.number}>
                <div><span>{item.number}</span><i>{item.label}</i></div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="story-process-gallery" data-story-reveal>
          <figure>
            <Image src="/story/pilot-processing.webp" alt="Tim melakukan pengolahan ubi ungu pada peralatan produksi skala pilot" fill sizes="(max-width: 800px) 100vw, 60vw" unoptimized />
            <figcaption><span>01</span> Dari formulasi menuju proses yang dapat diamati dan diulang.</figcaption>
          </figure>
          <figure>
            <Image src="/story/drum-dryer-detail.webp" alt="Detail proses pengeringan puree ubi ungu pada drum dryer" fill sizes="(max-width: 800px) 100vw, 40vw" unoptimized />
            <figcaption><span>02</span> Food technology menerjemahkan bahan segar menjadi format yang lebih praktis.</figcaption>
          </figure>
        </div>
      </section>

      <section className="story-education story-chapter" id="education" data-story-chapter aria-labelledby="education-title">
        <header className="story-section-heading" data-story-reveal>
          <span className="story-chapter-number">02</span>
          <div><span className="eyebrow">EDUCATION</span><h2 id="education-title">Know the root.<br /><em>Question the claim.</em></h2></div>
          <p>Pendidikan Yubie membantu orang memahami bahan dan proses—tanpa mengubah pangan menjadi janji medis.</p>
        </header>

        <div className="education-lab" data-story-reveal>
          <div className="education-orbit" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit-core">UBI<br />LOKAL</span>
            <i className="orbit-label label-one">varietas</i>
            <i className="orbit-label label-two">proses</i>
            <i className="orbit-label label-three">format</i>
            <i className="orbit-label label-four">bukti</i>
          </div>
          <div className="education-console">
            <div className="education-tabs" role="tablist" aria-label="Topik edukasi Yubie">
              {educationCards.map((card, index) => (
                <button
                  id={`education-tab-${card.id}`}
                  key={card.id}
                  type="button"
                  role="tab"
                  aria-selected={activeEducation === card.id}
                  aria-controls="education-panel"
                  tabIndex={activeEducation === card.id ? 0 : -1}
                  onClick={() => setActiveEducation(card.id)}
                  onKeyDown={(event) => onEducationKeyDown(event, index)}
                >
                  <span>0{index + 1}</span>{card.label}
                </button>
              ))}
            </div>
            <article id="education-panel" role="tabpanel" aria-live="polite" aria-labelledby={`education-tab-${activeEducationCard.id}`}>
              <span className="eyebrow">{activeEducationCard.kicker}</span>
              <h3>{activeEducationCard.title}</h3>
              <p>{activeEducationCard.body}</p>
              <strong>{activeEducationCard.note}</strong>
            </article>
          </div>
        </div>

        <div className="root-to-table" data-story-reveal>
          <header><span className="eyebrow">ROOT TO TABLE</span><h3>Satu perjalanan, empat titik kendali.</h3></header>
          <ol>
            <li><span>01</span><b>Kenali</b><p>Varietas, identitas botani, karakter sensori, dan tujuan penggunaan.</p></li>
            <li><span>02</span><b>Olah</b><p>Proses harus memiliki spesifikasi; visual produk bukan bukti mutu.</p></li>
            <li><span>03</span><b>Verifikasi</b><p>Uji produk akhir sebelum menerbitkan angka, klaim, atau umur simpan.</p></li>
            <li><span>04</span><b>Nikmati</b><p>Gunakan sebagai bagian dari pola makan yang beragam dan porsi yang sesuai.</p></li>
          </ol>
        </div>

        <section className="root-identity" aria-labelledby="root-identity-title" data-story-reveal>
          <header>
            <span className="eyebrow">IDENTITY BEFORE AESTHETIC</span>
            <h3 id="root-identity-title">Ubi jalar dan ube:<br /><em>mirip warna, berbeda identitas.</em></h3>
          </header>
          <div className="root-identity-grid">
            <article className="root-identity-card local-root">
              <span>YUBIE&apos;S ROOT</span>
              <h4>Ubi jalar</h4>
              <i>Ipomoea batatas</i>
              <dl>
                <div><dt>Kelompok</dt><dd>Sweet potato</dd></div>
                <div><dt>Bagian Yubie</dt><dd>Akar dari eksplorasi produk</dd></div>
                <div><dt>Prinsip</dt><dd>Diceritakan dengan identitas lokalnya sendiri</dd></div>
              </dl>
            </article>
            <div className="root-identity-divider" aria-hidden="true"><span>≠</span><small>NAME IT<br />CORRECTLY</small></div>
            <article className="root-identity-card">
              <span>RELATED, NOT IDENTICAL</span>
              <h4>Ube</h4>
              <i>Dioscorea alata</i>
              <dl>
                <div><dt>Kelompok</dt><dd>Yam</dd></div>
                <div><dt>Konteks populer</dt><dd>Identik dengan kuliner Filipina</dd></div>
                <div><dt>Prinsip</dt><dd>Tidak dipakai sebagai nama pengganti ubi jalar</dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section className="format-constellation" aria-labelledby="format-title" data-story-reveal>
          <header><span className="eyebrow">ONE ROOT · FOUR FORMATS</span><h3 id="format-title">Bukan empat cerita terpisah.<br /><em>Empat pintu menuju pangan lokal.</em></h3></header>
          <div>
            {productFormats.map((format, index) => (
              <Link key={format.name} href={format.href} className="format-node">
                <span>0{index + 1}</span><strong>{format.name}</strong><p>{format.role}</p><small>{format.cue}</small><i aria-hidden="true">↗</i>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="story-documentation story-chapter" id="documentation" data-story-chapter aria-labelledby="documentation-title">
        <header className="story-section-heading dark" data-story-reveal>
          <span className="story-chapter-number">03</span>
          <div><span className="eyebrow">DOCUMENTATION</span><h2 id="documentation-title">What we know.<br /><em>What we are still proving.</em></h2></div>
          <p>Kepercayaan tidak dibangun dengan kata paling besar. Ia dibangun dengan sumber, status, penanggung jawab, dan keberanian untuk mengatakan “belum”.</p>
        </header>

        <div className="evidence-ledger" data-story-reveal>
          <article className="evidence-card verified">
            <span>01 · DOCUMENTED</span>
            <h3>Boleh diceritakan sekarang</h3>
            <ul>
              <li>Identitas Yubie sebagai inovasi pangan berbahan ubi jalar Indonesia.</li>
              <li>Empat keluarga produk dan varian komersial yang tercatat.</li>
              <li>Arah pengembangan, dokumentasi proses, serta struktur tim.</li>
            </ul>
            <b>STATUS · SOURCE REVIEWED</b>
          </article>
          <article className="evidence-card testing">
            <span>02 · IN VALIDATION</span>
            <h3>Harus melewati gate</h3>
            <ul>
              <li>Informasi nilai gizi dan klaim serat pada setiap produk akhir.</li>
              <li>Umur simpan, alergen, cara simpan, dan instruksi final.</li>
              <li>Status perizinan dan sertifikasi untuk entitas serta SKU yang tepat.</li>
            </ul>
            <b>STATUS · DO NOT PROMOTE YET</b>
          </article>
          <article className="evidence-card blocked">
            <span>03 · NEVER INFER</span>
            <h3>Tidak boleh dijanjikan</h3>
            <ul>
              <li>Efek penyembuhan, pencegahan penyakit, atau hasil penurunan berat badan.</li>
              <li>Status halal, BPOM, atau sertifikasi lain tanpa bukti SKU-spesifik.</li>
              <li>Dampak petani, UMKM, dan lingkungan tanpa pengukuran yang dapat diaudit.</li>
            </ul>
            <b>STATUS · CLAIM PROTECTED</b>
          </article>
        </div>

        <section className="evidence-pipeline" aria-labelledby="evidence-pipeline-title" data-story-reveal>
          <header>
            <span className="eyebrow light-text">THE EVIDENCE PIPELINE</span>
            <h3 id="evidence-pipeline-title">Dari dokumen internal<br /><em>menjadi bahasa publik.</em></h3>
            <p>Publikasi adalah tahap terakhir, bukan titik awal. Perubahan spesifikasi mengulang pemeriksaan agar bahasa publik tetap terkait dengan produk yang benar.</p>
          </header>
          <ol>
            {evidenceFlow.map(([number, title, description]) => (
              <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
            ))}
          </ol>
        </section>

        <div className="documentation-library" data-story-reveal>
          <div>
            <span className="eyebrow">OPEN BUILDING</span>
            <h3>Dokumentasi juga bagian dari produk.</h3>
            <p>Arsitektur, product-truth gate, runbook produksi, dan keputusan teknis disimpan sebagai sistem kerja—agar pengetahuan Yubie tidak hanya hidup di kepala satu orang.</p>
          </div>
          <div className="documentation-links">
            <a href="https://github.com/yubiefood-id/yubie-platform/blob/main/docs/MASTER_DEVELOPMENT_PROMPT.md"><span>01</span><strong>Master Development Prompt</strong><i>Direction ↗</i></a>
            <a href="https://github.com/yubiefood-id/yubie-platform/tree/main/docs/development"><span>02</span><strong>Development Handbook</strong><i>Build ↗</i></a>
            <a href="https://github.com/yubiefood-id/yubie-platform/tree/main/docs/production"><span>03</span><strong>Production Handbook</strong><i>Operate ↗</i></a>
            <a href="https://github.com/yubiefood-id/yubie-platform/blob/main/docs/production/PRODUCT_TRUTH_SOURCE.md"><span>04</span><strong>Product Truth Source</strong><i>Verify ↗</i></a>
          </div>
        </div>
      </section>

      <section className="story-team story-chapter" id="team" data-story-chapter aria-labelledby="team-title">
        <header className="story-section-heading" data-story-reveal>
          <span className="story-chapter-number">04</span>
          <div><span className="eyebrow">OUR TEAM</span><h2 id="team-title">Three disciplines.<br /><em>One local-food mission.</em></h2></div>
          <p>Yubie dibangun dari pertemuan agribisnis, ilmu gizi, pengembangan produk, dan komunikasi pasar—didampingi kepakaran food science and nutrition.</p>
        </header>

        <figure className="team-portrait" data-story-reveal>
          <Image src="/story/team-yubie.webp" alt="Tim dan kolaborator Yubie memegang produk Yubie Flour" fill sizes="100vw" unoptimized />
          <figcaption><span>PEOPLE BEHIND THE ROOT</span><p>Produk pangan tidak lahir dari satu keahlian. Ia bergerak dari bahan, formulasi, proses, brand, hingga pengalaman konsumen.</p></figcaption>
        </figure>

        <div className="team-grid" data-story-reveal>
          {team.map((member, index) => (
            <article key={member.name}>
              <div className="team-mark" aria-hidden="true">{member.mark}</div>
              <span>0{index + 1}</span>
              <h3>{member.name}</h3>
              <strong>{member.role}</strong>
              <small>{member.discipline}</small>
              <p>{member.focus}</p>
            </article>
          ))}
        </div>

        <div className="story-closing" data-story-reveal>
          <span className="eyebrow light-text">THE NEXT CHAPTER</span>
          <h2>Dari umbi lokal,<br /><em>menuju meja yang lebih beragam.</em></h2>
          <p>Kisah berikutnya tidak hanya kami tulis. Ia tumbuh melalui produk yang diuji, mitra yang ikut membangun, dan konsumen yang memilih pangan lokal dengan lebih sadar.</p>
          <div><Link className="button gold" href="/products">Explore our products <span>↗</span></Link><Link className="text-link light-text" href="/b2b">Build with Yubie <span>→</span></Link></div>
        </div>
      </section>
    </main>
  );
}
