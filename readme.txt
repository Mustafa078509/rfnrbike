RFN ADMIN PASSWORD RESET

Files:
- admin-reset-password.html
- identity-client.js
- auth.css
- netlify/functions/admin-reset-password.js
- netlify.toml

NETLIFY ENVIRONMENT VARIABLES (Site configuration > Environment variables):
1. SUPABASE_URL=https://buprdivnomupwvazrlhl.supabase.co
2. SUPABASE_PUBLISHABLE_KEY=your sb_publishable key
3. SUPABASE_SERVICE_ROLE_KEY=your Supabase service_role secret key

IMPORTANT:
- Never put SUPABASE_SERVICE_ROLE_KEY inside HTML or browser JavaScript.
- The logged-in user must have role = admin in public.profiles.
- Deploy the netlify/functions folder with the site.
- Open /admin-reset-password.html while logged in as an admin.
