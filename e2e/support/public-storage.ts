/** Session-only test fixture; never writes customer/payment state. */
export function dismissPromotionForOrigin(approvedOrigin: string) {
  // Playwright runs init scripts in every frame, including opaque documents.
  // Never touch their storage or another origin's session state.
  if (location.origin !== approvedOrigin) return;
  sessionStorage.setItem("yubie.promo.dismissed.v1", "1");
}
