RFN PART PRICES LINKED

Dashboard writes part name, quantity, dealer price, and retail price to public.inventory through /api/store-products.
Every parts catalog page now loads /parts-database.js and reads the same public.inventory table for its own bike.

Required Netlify environment variables:
SUPABASE_URL=https://buprdivnomupwvazrlhl.supabase.co
SUPABASE_ANON_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

Admin pages:
/adminv2/login.html
/adminv2/dashboard.html

After upload, use Clear cache and deploy site.
