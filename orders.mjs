import { getStore } from '@netlify/blobs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://buprdivnomupwvazrlhl.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_HJ_AjabA3Uo26xp2R9O4SA_jY8ODq1z';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  }
});

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanOrder(body) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 100).map(item => ({
    bike: cleanText(item.bike, 120),
    name: cleanText(item.name, 200),
    code: cleanText(item.code, 120),
    color: cleanText(item.color, 80),
    qty: Math.max(1, Math.min(999, Number(item.qty) || 1)),
    price: Math.max(0, Number(item.price ?? item.dealerPrice) || 0)
  })) : [];

  return {
    customer: {
      firstName: cleanText(body.customer?.firstName, 80),
      lastName: cleanText(body.customer?.lastName, 80),
      email: cleanText(body.customer?.email, 160),
      phone: cleanText(body.customer?.phone, 50),
      address: cleanText(body.customer?.address, 250),
      city: cleanText(body.customer?.city, 100),
      province: cleanText(body.customer?.province, 100),
      postal: cleanText(body.customer?.postal, 30),
      country: cleanText(body.customer?.country, 10)
    },
    notes: cleanText(body.notes, 2000),
    items,
    total: items.reduce((sum, item) => sum + item.price * item.qty, 0)
  };
}

async function getAuthContext(req) {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const authHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`
  };

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders
  });

  if (!userResponse.ok) return null;

  const user = await userResponse.json();
  if (!user?.id) return null;

  // Role comes from public.profiles, not client-supplied data or editable user metadata.
  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}` +
    '&select=id,email,dealer_name,role&limit=1',
    { headers: authHeaders }
  );

  let profile = null;
  if (profileResponse.ok) {
    const profiles = await profileResponse.json();
    profile = Array.isArray(profiles) ? profiles[0] || null : null;
  }

  return {
    user,
    profile,
    role: profile?.role === 'admin' ? 'admin' : 'dealer'
  };
}

function canAccessOrder(auth, order) {
  if (auth.role === 'admin') return true;
  if (order?.dealerId === auth.user.id) return true;

  // Legacy orders created before dealerId was stored:
  // allow the logged-in dealer to see them only when the order email
  // matches the authenticated account email.
  const orderEmail = String(order?.dealerEmail || order?.customer?.email || '').trim().toLowerCase();
  const userEmail = String(auth.user?.email || '').trim().toLowerCase();
  return !order?.dealerId && !!userEmail && orderEmail === userEmail;
}

function publicOrder(record) {
  // Keep old and new field names for compatibility with the existing Orders page.
  return {
    ...record,
    order_number: record.id,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    first_name: record.customer?.firstName || '',
    last_name: record.customer?.lastName || '',
    email: record.customer?.email || '',
    phone: record.customer?.phone || '',
    items: (record.items || []).map(item => ({
      ...item,
      quantity: item.qty,
      part_number: item.code
    }))
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  }});

  try {
    const auth = await getAuthContext(req);
    if (!auth) return json({ error: 'Unauthorized. Please log in again.' }, 401);

    const store = getStore({ name: 'rfn-orders', consistency: 'strong' });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const orderId = parts.at(-1) !== 'orders' ? parts.at(-1) : null;

    if (req.method === 'POST') {
      const body = await req.json();
      const order = cleanOrder(body);

      if (!order.customer.firstName || !order.customer.lastName || !order.customer.email || order.items.length === 0) {
        return json({ error: 'Missing customer information or order items.' }, 400);
      }

      const id = `RFN-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const record = {
        id,
        status: 'New',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dealerId: auth.user.id,
        dealerEmail: auth.user.email || auth.profile?.email || '',
        dealerName: auth.profile?.dealer_name || '',
        ...order
      };

      await store.setJSON(`orders/${id}`, record);
      return json({ ok: true, order: publicOrder(record) }, 201);
    }

    if (req.method === 'GET' && orderId) {
      const order = await store.get(`orders/${orderId}`, { type: 'json' });
      if (!order) return json({ error: 'Order not found.' }, 404);
      if (!canAccessOrder(auth, order)) return json({ error: 'Forbidden.' }, 403);
      return json({ order: publicOrder(order) });
    }

    if (req.method === 'GET') {
      const result = await store.list({ prefix: 'orders/' });
      const orders = [];

      for (const blob of result.blobs) {
        const order = await store.get(blob.key, { type: 'json' });
        if (!order) continue;

        // Admin sees everything. Dealer only sees orders created by that login.
        if (canAccessOrder(auth, order)) {
          orders.push(publicOrder(order));
        }
      }

      orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return json({ orders, role: auth.role });
    }

    // Status changes and deletion are admin-only.
    if (req.method === 'PATCH' && orderId) {
      if (auth.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

      const current = await store.get(`orders/${orderId}`, { type: 'json' });
      if (!current) return json({ error: 'Order not found.' }, 404);

      const body = await req.json();
      const allowed = ['New', 'Processing', 'Completed', 'Cancelled'];
      const status = allowed.includes(body.status) ? body.status : current.status;
      const updated = { ...current, status, updatedAt: new Date().toISOString() };

      await store.setJSON(`orders/${orderId}`, updated);
      return json({ ok: true, order: publicOrder(updated) });
    }

    if (req.method === 'DELETE' && orderId) {
      if (auth.role !== 'admin') return json({ error: 'Admin access required.' }, 403);

      await store.delete(`orders/${orderId}`);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed.' }, 405);
  } catch (error) {
    console.error('Orders function error:', error);
    return json({ error: 'Database request failed.', details: error.message }, 500);
  }
}
