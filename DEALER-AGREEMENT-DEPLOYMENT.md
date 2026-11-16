# RFN USA Dealer Agreement registration integration

Status: code review / pre-production. **Do not merge to main until the checklist below is confirmed.**

## What is included
- register.html: RFN sky blue/red design, full agreement in scroll pane, checkbox enabled only at the bottom
- assets/rfn-dealer-agreement.txt: agreement terms transcribed from RFN Dealer Agreement dated 2/17/2026, with blank paper signature fields removed per request
- netlify/functions/dealer-register.mjs: server-side Supabase sign-up, PDF generation via pdf-lib, secure private storage and acceptance record
- netlify/functions/dealer-agreements.mjs: authenticated admin-only PDF download and acceptance listing
- admin-dealer-agreements.html: admin record viewer
- supabase-dealer-agreements.sql: one-time database/storage setup

## Deployment prerequisites
1. Run supabase-dealer-agreements.sql in the correct Supabase project and verify the table and PRIVATE storage bucket exist.
2. In Netlify set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY), SITE_URL=https://dealerrfn.netlify.app, RFN_AGREEMENT_ADMIN_EMAILS to the confirmed admin account email. Never place secrets in client HTML.
3. Ensure pdf-lib dependency installs in Netlify (and update package-lock.json with npm install before release when a registry connection is available).
4. Validate the agreement text against the signed-off legal source. The PDF is typeset from the full agreement text and appends a separate electronic-acceptance receipt; it does not reproduce the original Word pagination or typography.
5. Test registration with a new disposable dealer email: successful sign-up, email confirmation behavior, one acceptance row, private PDF, and admin download.
6. Test a normal dealer account cannot list or download agreement records; an unconfirmed or unlisted account is rejected.
7. Verify admin account email is confirmed and included in RFN_AGREEMENT_ADMIN_EMAILS.
8. Review sign-up abuse safeguards (rate limits/CAPTCHA), and whether policy requires manual approval for new dealer accounts.

## Operational caveat
If sign-up succeeds but private storage or database archiving fails, account creation cannot automatically be rolled back. The UI explicitly tells the user to contact RFN USA Sales and not to register again. Investigate logs and fix the acceptance record manually before allowing the account to operate.

The visual scroll control prevents skipping acceptance in the webpage but is not proof the person read the contract. Acceptance is explicitly recorded and tied to an authenticated user ID and contract checksum.
