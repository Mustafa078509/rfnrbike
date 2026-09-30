const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

export default async function handler(req) {
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const token = process.env.SHIPPO_API_TOKEN;
  if (!token) {
    return json({ ok: false, error: 'SHIPPO_API_TOKEN is not configured in Netlify.' }, 500);
  }

  try {
    const response = await fetch('https://api.goshippo.com/shipments/?results=1', {
      headers: {
        Authorization: `ShippoToken ${token}`,
        Accept: 'application/json'
      }
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return json({
        ok: false,
        error: 'Shippo connection failed.',
        status: response.status,
        details: body
      }, 502);
    }

    return json({
      ok: true,
      message: 'Shippo API connection is working.',
      mode: token.startsWith('shippo_test_') ? 'test' : 'live'
    });
  } catch (error) {
    return json({ ok: false, error: 'Unable to reach Shippo.', details: error.message }, 500);
  }
}
