export interface DeliveryLocationSuggestion { id: string; label: string; }
/**
 * Structured administrative parts of a selected location, best-effort from
 * the provider's address components. Indonesian naming is preserved as the
 * provider returns it (languageCode id), e.g. city "Kabupaten Bogor".
 * Preview only: the customer may edit every field before submission.
 */
export interface DeliveryLocationAddress {
  province?: string;
  city?: string;
  district?: string;
  postalCode?: string;
}
/** Preview only: not address verification or permission to persist provider content. */
export interface DeliveryLocationSelection {
  label: string; latitude: number; longitude: number; countryCode: "ID"; placeId?: string;
  address?: DeliveryLocationAddress;
}
export interface DeliveryLocationProvider {
  autocomplete(input: { query: string; sessionToken: string }): Promise<DeliveryLocationSuggestion[]>;
  details(input: { placeId: string; sessionToken: string }): Promise<DeliveryLocationSelection | null>;
  reverse(input: { latitude: number; longitude: number }): Promise<DeliveryLocationSelection | null>;
}
