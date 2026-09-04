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

// Kept for compatibility with existing pages.
export class MissingIdentityError extends Error {}


/* =====================================================
   Local session functions
===================================================== */

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

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session)
  );

  localStorage.setItem('rfnLoggedIn', 'true');
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('rfnLoggedIn');
}


/* =====================================================
   General Supabase request
===================================================== */

async function request(path, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,
      headers
    }
  );

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload.msg ||
      payload.message ||
      payload.error_description ||
      payload.error ||
      'Supabase request failed.';

    throw new AuthError(
      message,
      response.status,
      payload.error_code || payload.code || ''
    );
  }

  return payload;
}


/* =====================================================
   Authenticated database request
===================================================== */

async function databaseRequest(path, options = {}) {
  let session = readSession();

  if (!session?.access_token) {
    throw new AuthError(
      'You must be logged in.',
      401,
      'not_authenticated'
    );
  }

  const makeRequest = async () => {
    return fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        ...options,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      }
    );
  };

  let response = await makeRequest();

  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession(session.refresh_token);

    if (!session) {
      throw new AuthError(
        'Your session has expired. Please log in again.',
        401,
        'session_expired'
      );
    }

    response = await makeRequest();
  }

  let payload = null;

  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.details ||
      payload?.hint ||
      payload?.error ||
      'Database request failed.';

    throw new AuthError(
      message,
      response.status,
      payload?.code || ''
    );
  }

  return payload;
}


/* =====================================================
   Session helpers
===================================================== */

function normalizeSession(payload) {
  if (!payload) return null;

  if (payload.access_token) {
    return payload;
  }

  if (payload.session?.access_token) {
    return payload.session;
  }

  return null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;

  try {
    const payload = await request(
      '/auth/v1/token?grant_type=refresh_token',
      {
        method: 'POST',
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      }
    );

    const session = normalizeSession(payload);

    if (session) {
      saveSession(session);
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}


/* =====================================================
   Sign up
===================================================== */

export async function signup(
  email,
  password,
  metadata = {}
) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  const cleanPassword = String(password || '');

  const dealerName = String(
    metadata.dealer_name || ''
  ).trim();

  const contactPerson = String(
    metadata.contact_person ||
    metadata.full_name ||
    ''
  ).trim();

  const phone = String(
    metadata.phone || ''
  ).trim();

  const address = String(
    metadata.address || ''
  ).trim();

  if (!normalizedEmail || !cleanPassword) {
    throw new AuthError(
      'Email and password are required.',
      422
    );
  }

  if (!dealerName) {
    throw new AuthError(
      'Dealer name is required.',
      422
    );
  }

  if (!contactPerson) {
    throw new AuthError(
      'Contact person is required.',
      422
    );
  }

  if (!phone) {
    throw new AuthError(
      'Phone number is required.',
      422
    );
  }

  if (!address) {
    throw new AuthError(
      'Business address is required.',
      422
    );
  }

  if (cleanPassword.length < 8) {
    throw new AuthError(
      'Password must contain at least 8 characters.',
      422
    );
  }

  const payload = await request(
    '/auth/v1/signup',
    {
      method: 'POST',

      body: JSON.stringify({
        email: normalizedEmail,
        password: cleanPassword,

        data: {
          full_name: contactPerson,
          dealer_name: dealerName,
          contact_person: contactPerson,
          phone: phone,
          address: address,
          email: normalizedEmail,
          role: 'dealer'
        }
      })
    }
  );

  const session = normalizeSession(payload);

  if (session) {
    saveSession(session);
  }

  const user =
    payload.user ||
    session?.user ||
    null;

  /*
   If email confirmation is disabled, the user has a
   session and we can also make sure the profile exists.
  */
  if (session && user?.id) {
    try {
      await upsertProfile({
        id: user.id,
        email: normalizedEmail,
        full_name: contactPerson,
        dealer_name: dealerName,
        contact_person: contactPerson,
        phone,
        address,
        role: 'dealer'
      });
    } catch (error) {
      console.warn(
        'Account created, but profile could not be updated:',
        error
      );
    }
  }

  return {
    user,
    session,
    requiresEmailConfirmation: !session
  };
}


/* =====================================================
   Login
===================================================== */

export async function login(email, password) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  const cleanPassword = String(password || '');

  if (!normalizedEmail || !cleanPassword) {
    throw new AuthError(
      'Email and password are required.',
      422
    );
  }

  const payload = await request(
    '/auth/v1/token?grant_type=password',
    {
      method: 'POST',

      body: JSON.stringify({
        email: normalizedEmail,
        password: cleanPassword
      })
    }
  );

  const session = normalizeSession(payload);

  if (!session) {
    throw new AuthError(
      'Supabase did not return a login session.',
      500
    );
  }

  saveSession(session);

  return session.user || payload.user || null;
}


/* =====================================================
   Get current authenticated user
===================================================== */

export async function getUser() {
  let session = readSession();

  if (!session?.access_token) {
    return null;
  }

  let response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`
      }
    }
  );

  if (
    response.status === 401 &&
    session.refresh_token
  ) {
    session = await refreshSession(
      session.refresh_token
    );

    if (!session) {
      return null;
    }

    response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization:
            `Bearer ${session.access_token}`
        }
      }
    );
  }

  if (!response.ok) {
    clearSession();
    return null;
  }

  return response.json();
}


/* =====================================================
   Access token helper for authenticated API requests
===================================================== */

export async function getAccessToken() {
  const user = await getUser();

  if (!user?.id) {
    return null;
  }

  const session = readSession();
  return session?.access_token || null;
}


/* =====================================================
   Dealer profile database
===================================================== */

export async function upsertProfile(profile) {
  if (!profile?.id) {
    throw new AuthError(
      'User ID is required to save the profile.',
      422
    );
  }

  const cleanProfile = {
    id: profile.id,
    email: String(profile.email || '')
      .trim()
      .toLowerCase(),

    full_name: String(
      profile.full_name ||
      profile.contact_person ||
      ''
    ).trim(),

    dealer_name: String(
      profile.dealer_name || ''
    ).trim(),

    contact_person: String(
      profile.contact_person ||
      profile.full_name ||
      ''
    ).trim(),

    phone: String(
      profile.phone || ''
    ).trim(),

    address: String(
      profile.address || ''
    ).trim(),

    role: profile.role === 'admin'
      ? 'admin'
      : 'dealer',

    updated_at: new Date().toISOString()
  };

  return databaseRequest(
    'profiles?on_conflict=id',
    {
      method: 'POST',

      headers: {
        Prefer:
          'resolution=merge-duplicates,return=representation'
      },

      body: JSON.stringify(cleanProfile)
    }
  );
}


export async function getProfile() {
  const user = await getUser();

  if (!user?.id) {
    return null;
  }

  const profiles = await databaseRequest(
    `profiles?id=eq.${encodeURIComponent(user.id)}` +
    '&select=id,email,full_name,dealer_name,' +
    'contact_person,phone,address,role,' +
    'created_at,updated_at',
    {
      method: 'GET'
    }
  );

  return Array.isArray(profiles)
    ? profiles[0] || null
    : profiles;
}


export async function updateProfile(changes = {}) {
  const user = await getUser();

  if (!user?.id) {
    throw new AuthError(
      'You must be logged in.',
      401
    );
  }

  const allowedChanges = {};

  if (changes.dealer_name !== undefined) {
    allowedChanges.dealer_name = String(
      changes.dealer_name
    ).trim();
  }

  if (changes.contact_person !== undefined) {
    allowedChanges.contact_person = String(
      changes.contact_person
    ).trim();

    allowedChanges.full_name = String(
      changes.contact_person
    ).trim();
  }

  if (changes.full_name !== undefined) {
    allowedChanges.full_name = String(
      changes.full_name
    ).trim();
  }

  if (changes.phone !== undefined) {
    allowedChanges.phone = String(
      changes.phone
    ).trim();
  }

  if (changes.address !== undefined) {
    allowedChanges.address = String(
      changes.address
    ).trim();
  }

  allowedChanges.updated_at =
    new Date().toISOString();

  const result = await databaseRequest(
    `profiles?id=eq.${encodeURIComponent(user.id)}`,
    {
      method: 'PATCH',

      headers: {
        Prefer: 'return=representation'
      },

      body: JSON.stringify(allowedChanges)
    }
  );

  return Array.isArray(result)
    ? result[0] || null
    : result;
}


/* =====================================================
   Logout
===================================================== */

export async function logout() {
  const session = readSession();

  try {
    if (session?.access_token) {
      await fetch(
        `${SUPABASE_URL}/auth/v1/logout`,
        {
          method: 'POST',

          headers: {
            apikey: SUPABASE_KEY,
            Authorization:
              `Bearer ${session.access_token}`,

            'Content-Type': 'application/json'
          }
        }
      );
    }
  } finally {
    clearSession();
  }
}


/* =====================================================
   Email confirmation callback
===================================================== */

export async function handleAuthCallback() {
  const hash = new URLSearchParams(
    window.location.hash.replace(/^#/, '')
  );

  const accessToken =
    hash.get('access_token');

  const refreshToken =
    hash.get('refresh_token');

  if (!accessToken) {
    return null;
  }

  const expiresIn = Number(
    hash.get('expires_in') || 3600
  );

  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type:
      hash.get('token_type') || 'bearer',

    expires_in: expiresIn,

    expires_at:
      Math.floor(Date.now() / 1000) +
      expiresIn
  };

  saveSession(session);

  history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  );

  const user = await getUser();

  /*
   After email confirmation, copy user metadata into
   the public.profiles table if needed.
  */
  if (user?.id) {
    const metadata =
      user.user_metadata || {};

    try {
      await upsertProfile({
        id: user.id,
        email: user.email || metadata.email || '',
        full_name:
          metadata.full_name ||
          metadata.contact_person ||
          '',

        dealer_name:
          metadata.dealer_name || '',

        contact_person:
          metadata.contact_person ||
          metadata.full_name ||
          '',

        phone:
          metadata.phone || '',

        address:
          metadata.address || '',

        role: 'dealer'
      });
    } catch (error) {
      console.warn(
        'Unable to create dealer profile:',
        error
      );
    }
  }

  return {
    user,
    session
  };
}

/* =====================================================
   Password update after a valid recovery callback
===================================================== */
export async function updatePassword(newPassword) {
  const cleanPassword = String(newPassword || '');
  if (cleanPassword.length < 8) {
    throw new AuthError('Password must contain at least 8 characters.', 422, 'weak_password');
  }

  let session = readSession();
  if (!session?.access_token) {
    throw new AuthError('The reset link is invalid or expired.', 401, 'missing_recovery_session');
  }

  let response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: cleanPassword })
  });

  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession(session.refresh_token);
    if (!session) throw new AuthError('The reset link is invalid or expired.', 401);
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: cleanPassword })
    });
  }

  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    throw new AuthError(payload.message || payload.error_description || payload.error || 'Unable to update password.', response.status, payload.code || '');
  }
  return payload;
}
