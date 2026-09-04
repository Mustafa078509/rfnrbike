RFN PART CATALOG DASHBOARD UPGRADE

WHAT WAS ADDED
- Part Catalog dashboard grouped by Bike -> Section -> Parts.
- Edit part name, part number, dealer price, retail price and stock.
- Edit/upload a PART image.
- Edit/upload a SECTION DIAGRAM image.
- Catalog pages automatically use the updated database images.
- Supabase Storage bucket: catalog-images.

SETUP
1. Deploy this entire site ZIP to Netlify.
2. In Supabase > SQL Editor, run: PART-CATALOG-UPGRADE-RUN-ME.sql
3. Make sure Netlify environment variables already include:
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
4. Login to Admin and open:
   /admin/inventory.html

IMAGE UPLOAD
- Click Edit on a part.
- Under Diagram Image or Part Image, choose an image and click Upload.
- Click Save Part.
- Diagram changes are stored for the section and shown in the public part catalog.

NOTES
- Existing catalog HTML layout is preserved.
- The seed SQL reads the current catalog organization and pre-populates section names/diagram images for the supported catalog pages.
