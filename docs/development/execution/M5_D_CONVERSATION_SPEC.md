# M5-D Conversation Spec (V1)

**Flow version:** `deterministic-v1`  
**Locale:** `id`

## Global commands

| Input | Action |
|-------|--------|
| `0`, `cs`, `admin`, `customer service`, `manusia`, `operator`, `bicara dengan admin`, `hubungi tim` | Immediate human handoff → CUSTOMER_SUPPORT |
| `menu`, `mulai`, `start` | HOME |
| `9`, `kembali`, `back` | Parent node (when valid) |

Every menu displays option `0. Customer Service`. No confirmation before handoff.

## Unknown handling

1. First unmatched input at a node → explain valid choices, re-render same node
2. Second consecutive unmatched → human handoff → CUSTOMER_SUPPORT

## HOME

```
Selamat datang di Yubie!
0 — Customer Service
1 — BELI
2 — INFO PRODUK
3 — BANTUAN PESANAN
4 — BISNIS / B2B
5 — KOMPLAIN
6 — LAINNYA
```

## 1 — BUY

### 1.1 Yubie Flour (`buy.flour`)
- Shopee → verified marketplace redirect
- Tokopedia → verified marketplace redirect
- Customer Service → handoff

### 1.2 Yubie Shake (`buy.shake`)
- Coming soon message
- B2B → `business.sample` entry
- Customer Service → handoff

### 1.3 Yubie Ppang (`buy.ppang`)
- Coming soon message
- B2B → `business.sample` entry
- Customer Service → handoff

## 2 — PRODUCT INFO (`product`)

Submenu:
- Apa produk ini? → approved product knowledge
- Cara pakai → approved usage
- Resep → published recipes only
- Root/varian → catalog (no unapproved claims)
- Bahan/nutrisi/alergen → approved gate or handoff
- Sertifikasi → approved gate or handoff
- Beli di mana → purchase options or coming-soon

## 3 — ORDER HELP (`order`)

1. Pilih marketplace (Shopee / Tokopedia / CS)
2. Kategori: pengiriman/status, pembayaran, cancel/refund, barang salah, rusak, kualitas, lainnya
3. Guidance template (no live order status) + CS option

## 4 — BUSINESS / B2B (`business`)

- Sample → progressive: company → use case → product → location → handoff SALES
- Bulk → company → business type → city → product → volume → timeline → handoff SALES
- Product development → business type → application → product → volume → timeline → handoff SALES
- Wholesale/distributor → handoff SALES
- Partnership/licensing → handoff SALES
- Human sales → handoff SALES

`0` at any B2B step → immediate SALES handoff.

## 5 — COMPLAINT (`complaint`)

Categories:
- Produk rusak
- Barang salah
- Rasa/aroma/tampilan tidak biasa
- Masalah kemasan
- Keamanan pangan/reaksi buruk → immediate FOOD_SAFETY
- Lainnya

Short collect: product, channel, category; optional order ref/batch → CUSTOMER_SUPPORT.

## 6 — OTHER (`other`)

Brief prompt → CUSTOMER_SUPPORT handoff.

## Handoff destinations

| Route | Destination |
|-------|-------------|
| Explicit human, general unresolved, complaint | CUSTOMER_SUPPORT |
| B2B, sample, bulk, partnership | SALES_PARTNERSHIP |
| Food safety, allergen adverse reaction | FOOD_SAFETY (high priority) |

## Template rules

- No invented price, stock, certification, availability
- Price/stock without live source: *"harga/promo/stok terbaru dapat dilihat di marketplace"*
- Sensitive facts require `APPROVED_PUBLIC` exact scope or handoff
