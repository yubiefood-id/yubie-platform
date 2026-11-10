// WA-03: deterministic fallback copies for the bounded AI helper. These are
// worker-side answers (the engine never sees generation outcomes) and mirror
// the ai_unavailable copy in packages/assistant deterministic/v2-flow — keep
// them in sync.
const TRIMODE_FOOTER = "\n\n9. Kembali\n0. Customer Service\nKetik menu untuk menu utama.";

export const AI_UNAVAILABLE_COPY =
  "Maaf, Tanya AI Yubi sedang tidak bisa menjawab sekarang. Ketik 0 untuk bantuan Customer Service, atau menu untuk pilihan lain." + TRIMODE_FOOTER;

export const AI_QUOTA_EXHAUSTED_COPY =
  "Kuota Tanya AI Yubi untuk chat ini sudah tercapai. Kamu bisa terus menjelajah menu, atau ketik 0 agar tim Customer Service membantu." + TRIMODE_FOOTER;
