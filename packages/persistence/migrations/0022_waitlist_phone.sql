-- Product waitlist switches identity from email to phone number: the waitlist
-- form is a promo/contact surface where users register their WhatsApp number.
-- The email form was never mounted in any page build, so the table is expected
-- EMPTY in every environment.
--
-- PRE-APPLY CHECK (operator, per environment):
--   SELECT count(*) FROM product_waitlist_entries;  -- must be 0
-- If rows exist, stop: email-era rows have no phone and the NOT NULL below
-- fails loudly. Do not backfill phones from emails.
--
-- Rollback (forward-only data): DROP INDEX product_waitlist_phone_product;
-- ALTER TABLE product_waitlist_entries DROP COLUMN phone;
-- ALTER TABLE product_waitlist_entries ALTER COLUMN email SET NOT NULL;
-- (rows joined after this migration are lost).

ALTER TABLE product_waitlist_entries ADD COLUMN phone TEXT NOT NULL;
ALTER TABLE product_waitlist_entries ALTER COLUMN email DROP NOT NULL;

DROP INDEX product_waitlist_email_product;
CREATE UNIQUE INDEX product_waitlist_phone_product ON product_waitlist_entries (phone, product_id);
