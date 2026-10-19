# iPaymu provider contract

Fetched **2026-10-19** from the public documentation. No merchant API call was made. Sandbox and production credentials are different. Chat-supplied VA and API key are not part of this contract and must not be used.

Sources:

- Redirect: https://docs.ipaymu.com/id/docs/payment/redirect-payment
- Request signature: https://docs.ipaymu.com/id/docs/signature
- Callback: https://docs.ipaymu.com/id/docs/callback
- Check transaction: https://docs.ipaymu.com/id/docs/transaction/check-transaction
- History: https://docs.ipaymu.com/id/docs/transaction/history-transaction

## Create hosted redirect

`POST https://sandbox.ipaymu.com/api/v2/payment` with `Content-Type: application/json` and headers `va`, `signature`, `timestamp` (`YYYYMMDDHHmmss`).

Required body fields include `product`, `qty`, `price`, `description`, `returnUrl`, `notifyUrl`, `cancelUrl`. `referenceId` is optional in the docs and mandatory for Yubie.

Documented success body:

```json
{
  "Status": 200,
  "Message": "success",
  "Data": {
    "SessionID": "91538218-5158-459B-8716-DD97FFE3EDAB",
    "Url": "https://sandbox.ipaymu.com/payment/91538218-5158-459B-8716-DD97FFE3EDAB"
  }
}
```

The create response does not include `transactionId`. The browser must be sent only to `Data.Url` after the host is allowlisted to `sandbox.ipaymu.com`.

## Request signature

The example hashes the exact JSON string that is sent:

1. `bodyHash = SHA256(exactBodyBytes)` as lowercase hex.
2. `stringToSign = METHOD + ":" + VA + ":" + bodyHash + ":" + APIKey`.
3. `signature = HMAC-SHA256(stringToSign, APIKey)` as lowercase hex.

The formula box on the same page writes `RequestBody` instead of `bodyHash`. The worked example and the component list for POST both use the SHA-256 body hash. Yubie signs the bytes of the body that `fetch` sends, not a re-serialized object. GET query signing is out of scope until a GET endpoint is used.

The API key is the HMAC key. It is not the `signature` header.

## Callback signature (different algorithm)

Callback `Content-Type` is dashboard-selected: `application/x-www-form-urlencoded` (documented default) or `application/json`.

Headers include `X-Signature`, `X-Timestamp` (ISO-8601 with offset in the example), and `X-External-ID`.

The HMAC key is the merchant VA, not the API key. Documented steps: normalize types (`trx_id`, `status_code`, `transaction_status_code`, `paid_off` as integers; `is_escrow` as boolean; missing `additional_info` as `[]`), sort keys ascending, JSON-serialize, escape `/` to `\/`, HMAC-SHA256 with the VA, compare in constant time.

Example fields that matter for reconciliation: `sid` (session), `trx_id`, `reference_id` and `referenceId`, `merchant` (documented as the merchant VA), `amount` / `total` / `sub_total`, `status` (`berhasil`, `pending`, `expired`), `status_code` (`1` success, `0` pending, `-2` expired), `transaction_status_code` (`1` settled path, `6` success not settled), `is_sandbox`.

iPaymu retries until it receives HTTP 200. Yubie returns 200 only after an authenticated callback is committed to the inbox. Invalid signatures are rejected and not acknowledged as success. A signature match alone does not mark an order paid.

## Check transaction

`POST https://sandbox.ipaymu.com/api/v2/transaction` requires `transactionId`. It does not accept `SessionID` as that field.

The documented response includes both `TransactionId` and `SessionId`, plus `ReferenceId`, `Amount`, and numeric `Status`:

- `0` pending, `1` success, `2` cancelled, `3` refund, `4` error, `5` failed, `6` success unsettled, `7` escrow, `-2` expired.

This call is the authoritative read **after** `trx_id` is known. It cannot, by itself, look up a create that returned only `SessionID`.

## History

`POST https://sandbox.ipaymu.com/api/v2/history` filters by status and a date window. `limit` maximum is 20. Example rows include `TransactionId`, `ReferenceId`, `Amount`, and `Status`. There is no documented filter for `SessionID` or a single `referenceId`. A bounded history scan can be a recovery aid. It is not an atomic lookup, and a matching `ReferenceId` inside a page is not proof that no second transaction exists on another page unless the window and page set are fully read. Yubie will not treat a partial history page as cancel-or-release authority.

## Not documented

These were not found on the pages above. They stay open until iPaymu support answers in writing:

1. Cancel a redirect session by `SessionID`.
2. Look up one transaction by `referenceId` or by `SessionID`.
3. Behavior when `referenceId` is reused while an earlier session is still payable.
4. How a merchant discovers `transactionId` when the create HTTP call times out after iPaymu has stored the session and before any callback.
5. Whether `X-Timestamp` is part of the callback MAC, and the allowed clock skew.
6. Whether JSON callbacks use the same normalization as form bodies.

No cancel-by-session client will be invented. `cancelPaymentSession` for iPaymu returns not accepted. Stock is not released on that result.

## Hard stop

`COMMERCE_PROVIDER=ipaymu` stays off on staging until sandbox credentials are injected by the operator into the secret store, callback fixtures are verified, and the SessionID-to-transaction recovery path is either proven in sandbox or explicitly fail-closed (hold `pending_reconciliation`, no second payable session, no stock release). Code may ship behind mocks before that gate. A mock test is not a sandbox PASS.
