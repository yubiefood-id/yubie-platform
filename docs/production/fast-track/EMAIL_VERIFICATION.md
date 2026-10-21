# Safe inbound mailbox verification

Verdict: PENDING_OPERATOR_VERIFICATION. Read-only DNS on 2026-10-21 returned MX mx1.privateemail.com and mx2.privateemail.com, SPF include:spf.privateemail.com ~all and DMARC p=none. These prove DNS records only, not mailbox existence, inbound delivery or outbound authentication. DKIM selector/configuration has not been verified.

Email administrator actions, in Private Email administration for yubiefood.com:

1. Confirm hello@yubiefood.com is a provisioned, enabled mailbox or intentional alias with an accountable monitored destination, quota and recovery owner. Confirm authorized staff can open the inbox and spam/quarantine folders.
2. From an approved external operator mailbox send one non-sensitive message to hello@yubiefood.com with subject YUBIE-INBOUND-VERIFY plus a fresh random nonce. Include only the nonce and UTC send time. No customer information or attachments. The assistant sends no email.
3. Verify inbox receipt, matching nonce, UTC receive time and spam result. Record a restricted operator receipt with mailbox owner and verdict; publish only receipt reference/timestamps, never message bodies, auth headers or email exports.
4. If no receipt, inspect provider delivery logs, mailbox/alias routing, quota, filtering and bounce at the sending mailbox. Correct mailbox configuration under normal owner approval; request DNS approval only if an actual record change is required.
5. If outbound replies are part of operations, separately approve and send a reply; inspect SPF/DKIM/DMARC results in the receiving operator inbox. Obtain the actual DKIM selector from Private Email administration and verify its published key. Do not invent selectors, strengthen DMARC or change MX during this test.

Catalog contact remains unverified until this receipt exists. No source-code email change can establish delivery.
