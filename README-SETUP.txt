RFN DEALER PORTAL — EMAILJS PASSWORD RESET
==========================================

FILES
-----
login.html
forgot-password.html
reset-password.html
identity-client.js
auth.css
netlify.toml
netlify/functions/send-reset-link.js

HOW IT WORKS
------------
1. Dealer clicks Forgot Password.
2. Netlify Function asks Supabase to create a secure one-time recovery link.
3. EmailJS sends that link to the dealer.
4. Dealer opens reset-password.html and chooses a new password.

EMAILJS SETUP
-------------
1. Log in to EmailJS.
2. Email Services > Add New Service.
3. Connect Gmail, Outlook, or another supported mailbox.
4. Copy the Service ID.
5. Email Templates > Create New Template.
6. Set the recipient field (To Email) to:
   {{to_email}}
7. Suggested subject:
   Reset your RFN dealer password
8. Suggested template body:

   Hello,

   We received a request to reset your RFN dealer account password.

   Reset your password:
   {{reset_link}}

   If you did not request this change, ignore this email.

   RFN USA Dealer Portal

9. Copy the Template ID.
10. Account > General: copy the Public Key.
11. Account > Security: copy the Private Key if your EmailJS plan/account shows one.
    The function supports it but can work without it.

NETLIFY ENVIRONMENT VARIABLES
-----------------------------
Add these in Netlify:
Site configuration > Environment variables

SUPABASE_URL
https://buprdivnomupwvazrlhl.supabase.co

SUPABASE_SERVICE_ROLE_KEY
Your Supabase service_role / secret server key

EMAILJS_SERVICE_ID
Example: service_abc123

EMAILJS_TEMPLATE_ID
Example: template_abc123

EMAILJS_PUBLIC_KEY
Your EmailJS public key

EMAILJS_PRIVATE_KEY
Your EmailJS private key (optional but recommended)

SITE_URL
https://dealerrfn.netlify.app

SECURITY
--------
Never place SUPABASE_SERVICE_ROLE_KEY or EMAILJS_PRIVATE_KEY in HTML,
identity-client.js, or any browser-visible file.

DEPLOYMENT
----------
Netlify Functions must be deployed through GitHub or Netlify CLI.
Do not rely on ordinary static drag-and-drop for this function.

Project structure must be:

project-root/
  login.html
  forgot-password.html
  reset-password.html
  identity-client.js
  auth.css
  netlify.toml
  netlify/
    functions/
      send-reset-link.js

After adding or changing environment variables, deploy again.

TEST
----
Open:
https://dealerrfn.netlify.app/.netlify/functions/send-reset-link

Expected browser response:
{"error":"Method not allowed."}

That response means the function is deployed. The Forgot Password page sends POST.

SUPABASE URL CONFIGURATION
--------------------------
In Supabase:
Authentication > URL Configuration

Site URL:
https://dealerrfn.netlify.app

Redirect URLs:
https://dealerrfn.netlify.app/reset-password.html

EMAILJS TEMPLATE VARIABLES
--------------------------
{{to_email}}
{{dealer_email}}
{{reset_link}}
{{site_name}}
{{support_email}}
