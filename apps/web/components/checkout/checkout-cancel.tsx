"use client";
import { CheckoutSuccess } from "./checkout-success";
/** Returning from the hosted page does not prove provider cancellation. */
export function CheckoutCancel() { return <CheckoutSuccess />; }
