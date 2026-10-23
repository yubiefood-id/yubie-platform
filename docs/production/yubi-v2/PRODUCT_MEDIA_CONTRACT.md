# Product media contract

Source: packages/domain/src/product-discovery.ts → resolveYubiProduct. Stable IDs
flour/shake/ppang/mie map only to these canonical pages:

| Product | Canonical URL |
| --- | --- |
| Yubie Flour | https://yubiefood.com/products/yubie-flour |
| Yubie Shake | https://yubiefood.com/products/yubie-shake |
| Yubie Ppang | https://yubiefood.com/products/yubie-ppang |
| Yubie Mie | https://yubiefood.com/products/yubie-mie |

Published status and available variants with positive integer prices are resolved
on the server. Nine current variants are tested against the commercial catalog.
No hardcoded template prices, arbitrary customer URL, redirect, query or fragment
is accepted. No phone, account ID or credential enters attribution URLs.

All four existing website illustrations are concepts/studies. User decision:
only approved final photographs qualify. approvedYubiPhotos is deliberately empty;
no image in this change is a product approval. Consequently all four selections
currently use honest text fallback, and R2 final-photo acceptance is BLOCKED_EXTERNAL.

Product/Brand supplies each final source photograph and exact SKU approval.
An operator runs locally:

```sh
node scripts/prepare-yubi-photo.mjs "$PRODUCT_ID" "$FINAL_PHOTO_FILE" "$REVIEW_OUTPUT_DIRECTORY"
```

The three shell variables above are operator-supplied local arguments, not application configuration. It transforms only the supplied local
source to JPEG, max 1600 pixels, strips metadata, checks ≤5 MiB, and emits a pending
manifest candidate. It grants no approval. Review the resulting bytes, obtain an
approval reference, then add the immutable hash-named file beneath
packages/integrations/assets/product-media and its exact approved manifest in
packages/domain/src/yubi-discovery.ts through a reviewed change. Do not generate
certification text, substitute a concept, or point the loader at remote storage.

SEND_PRODUCT_MEDIA carries trusted thread ref, product ID, approved asset ID,
caption, canonical PDP URL, stable delivery key and correlation ID. The worker
rebuilds its dispatch authorization callback; customer JSON cannot supply it.
The loader accepts only manifest-owned final-photograph/approved assets with a
nonempty approval reference. The filename must equal SHA-256 plus jpg/png;
lstat rejects symlinks/nonfiles, size and hash must match, and sharp decodes with a
40 MP input bound. Only JPEG/PNG, exact approved dimensions, max1600, no EXIF or
animation qualify. It performs no HTTP fetch and exposes no internal file path.

Zammad POST /api/v1/ticket_articles contains sender Agent, configured WhatsApp
article type, internal=false, body=approved caption, preferences.yubie_delivery_key,
and exactly one attachments entry with filename, base64 data and mime-type.
This produces a native channel attachment, not an image URL preview.

Contract evidence: pinned upstream Zammad 7.1.3 commit
8facd9250f4e1634124965eb0ba79a78a3fcdc19, app/models/channel/driver/whatsapp.rb;
the adapter uses its ticket article attachment shape and WhatsApp delivery
preferences. [Ticket article API](https://docs.zammad.org/en/latest/api/ticket/articles.html)
and [WhatsApp channel](https://admin-docs.zammad.org/en/latest/channels/whatsapp/index.html)
are reference contracts. Actual deployed version/digest is still unverified.

Fixture tests validate the actual base64 attachment, MIME, digest/dimensions,
caption/link, missing/rejected media and one durable fallback. The fixture's
SYNTHETIC_TEST_ONLY approval is never release evidence. REST success means
accepted, not delivered; preferences.whatsapp timestamp_sent/delivered/read or
delivery_status=fail drive reconciliation. Unknown acknowledgment is held.

Definitive media rejection creates one text fallback with canonical PDP and a
sanitized correlation event. Timeout/unknown does not send a second customer
message until provider reconciliation proves failure. Five transient attempts
are bounded; unresolved outcomes require operator inspection.

R3 operator must prove on real approved identities: image visible in WhatsApp,
correct photograph/variants, caption and PDP usable in the same article, channel
delivery status and recipient confirmation. If the deployed channel strips the
caption/link, record failure and implement/test an explicit image→text sequence
before acceptance. Do not mark current caption behavior live-verified.
