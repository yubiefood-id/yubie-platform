export interface DeliveryLocationSuggestion { id: string; label: string; }
/** Preview only: not address verification or permission to persist provider content. */
export interface DeliveryLocationSelection {
  label: string; latitude: number; longitude: number; countryCode: "ID"; placeId?: string;
}
export interface DeliveryLocationProvider {
  autocomplete(input: { query: string; sessionToken: string }): Promise<DeliveryLocationSuggestion[]>;
  details(input: { placeId: string; sessionToken: string }): Promise<DeliveryLocationSelection | null>;
  reverse(input: { latitude: number; longitude: number }): Promise<DeliveryLocationSelection | null>;
}
