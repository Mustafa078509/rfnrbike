RFN BIKE INVENTORY CONTROL

Open: /admin/bikes.html

You can now:
1. Set the quantity for each bike color.
2. Set a color to In Stock or Out of Stock.
3. Save dealer price, retail price, category, and bike status.
4. The total bike quantity is calculated from the color quantities when every
   color has a quantity entered.
5. A color with quantity 0 is automatically treated as Out of Stock.
6. The storefront shows the selected color quantity and blocks ordering an
   out-of-stock color.

Database requirement:
Run supabase/bike-color-inventory-control.sql once in Supabase SQL Editor.
It adds a quantity field to every existing bike color. Then manage all future
color quantities from /admin/bikes.html; you do not need to run SQL again.

Important:
Use /admin/bikes.html for bike inventory. /admin/inventory.html remains for
parts inventory.
