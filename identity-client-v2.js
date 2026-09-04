const SUPABASE_URL = 'https://buprdivnomupwvazrlhl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HJ_AjabA3Uo26xp2R9O4SA_jY8ODq1z';
const SESSION_KEY = 'rfnSupabaseSession';

export class AuthError extends Error {
  constructor(message, status = 400, code = '') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

// Kept for compatibility with the existing pages.
export class MissingIdentityError extends Error {}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session?.access_token) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('rfnLoggedIn', 'true');
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('rfnLoggedIn');
}

async function request(path, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.msg || payload.message || payload.error_description || payload.error || 'Authentication request failed.';
    throw new AuthError(message, response.status, payload.error_code || payload.code || '');
  }

  return payload;
}

function normalizeSession(payload) {
  if (!payload) return null;
  if (payload.access_token) return payload;
  if (payload.session?.access_token) return payload.session;
  return null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  try {
    const payload = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const session = normalizeSession(payload);
    if (session) saveSession(session);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export async function signup(email, password, metadata = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  if (!normalizedEmail || !cleanPassword) {
    throw new AuthError('Email and password are required.', 422);
  }
  if (cleanPassword.length < 8) {
    throw new AuthError('Password must contain at least 8 characters.', 422);
  }

  const payload = await request('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedEmail,
      password: cleanPassword,
      data: { full_name: String(metadata.full_name || '').trim() }
    })
  });

  const session = normalizeSession(payload);
  if (session) saveSession(session);

  return {
    user: payload.user || session?.user || null,
    session,
    requiresEmailConfirmation: !session
  };
}

export async function login(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');

  const payload = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail, password: cleanPassword })
  });

  const session = normalizeSession(payload);
  if (!session) throw new AuthError('Supabase did not return a login session.', 500);
  saveSession(session);
  return session.user || payload.user || null;
}

export async function getUser() {
  let session = readSession();
  if (!session?.access_token) return null;

  let response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession(session.refresh_token);
    if (!session) return null;
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`
      }
    });
  }

  if (!response.ok) {
    clearSession();
    return null;
  }

  return response.json();
}

export async function logout() {
  const session = readSession();
  try {
    if (session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
    }
  } finally {
    clearSession();
  }
}

export async function handleAuthCallback() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');

  if (!accessToken) return null;

  const expiresIn = Number(hash.get('expires_in') || 3600);
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: hash.get('token_type') || 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn
  };
  saveSession(session);
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return { user: await getUser(), session };
}

export function getStoredSession() {
  return readSession();
}

export async function supabaseRequest(path, options = {}) {
  let session = readSession();
  if (!session?.access_token) throw new AuthError('You are not signed in.', 401);

  const makeRequest = (token) => fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || options.headers?.Prefer || '',
      ...(options.headers || {})
    }
  });

  let response = await makeRequest(session.access_token);
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession(session.refresh_token);
    if (!session) throw new AuthError('Your session expired.', 401);
    response = await makeRequest(session.access_token);
  }

  let payload = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
  }
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error || `Database request failed (${response.status}).`;
    throw new AuthError(message, response.status, payload?.code || '');
  }
  return payload;
}

export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const rows = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,full_name,role`);
  return Array.isArray(rows) ? rows[0] || null : null;
}


export async function getAdminUser() {
  const user = await getUser();
  if (!user) return null;
  const result = await supabaseRequest('/rest/v1/rpc/get_my_admin_record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  return Array.isArray(result) ? result[0] || null : result || null;
}

export async function isCurrentAdmin() {
  const user = await getUser();
  if (!user) return false;
  const result = await supabaseRequest('/rest/v1/rpc/is_current_admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  return result === true || result === 'true';
}
