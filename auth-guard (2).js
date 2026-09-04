import { getUser, getAccessToken, handleAuthCallback, logout } from './identity-client.js';

document.documentElement.style.visibility = 'hidden';
window.rfnGetAccessToken = getAccessToken;


let callbackUser = null;

try {
  const callback = await handleAuthCallback();
  callbackUser = callback?.user ?? null;
} catch {
  callbackUser = null;
}

const user = callbackUser ?? await getUser();

if (!user) {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login.html?returnTo=${encodeURIComponent(returnTo)}`);
} else {
  document.documentElement.style.visibility = 'visible';
}

window.rfnLogout = async function rfnLogout() {
  try {
    await logout();
  } finally {
    window.location.replace('/login.html');
  }
};
