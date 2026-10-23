-- Expand-only contact migration. Historical ownership and monetary values are untouched.
-- A customer-entered delivery/contact phone never establishes account identity.
ALTER TABLE orders ALTER COLUMN customer_email DROP NOT NULL;
ALTER TABLE orders ADD COLUMN customer_phone text;
ALTER TABLE orders ADD CONSTRAINT orders_customer_phone_e164
  CHECK (customer_phone IS NULL OR customer_phone ~ '^\+[1-9][0-9]{6,14}$');
