export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

const messages: Record<string, string> = {
  'auth/invalid-phone-number': 'Enter a valid mobile number.',
  'auth/invalid-verification-code': 'That code is not correct. Check it and try again.',
  'auth/code-expired': 'That code has expired. Request a new one.',
  'auth/too-many-requests': 'Too many attempts. Please wait a while and try again.',
  'auth/quota-exceeded': 'SMS sending is temporarily unavailable. Please try again later.',
  'auth/captcha-check-failed': 'Security check failed. Reload the page and try again.',
  'auth/network-request-failed': 'Check your connection and try again.',
};

export function firebaseMessage(cause: unknown) {
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? messages[code] : undefined;
}

/**
 * Sends the code by SMS and returns the step that exchanges it for a Firebase ID token.
 * Firebase only proves the phone number: the Time Bank session comes from that token, so the
 * Firebase session is closed as soon as the token is issued.
 */
export async function sendPhoneCode(
  config: FirebaseWebConfig,
  phone: string,
  host: HTMLElement,
): Promise<(code: string) => Promise<string>> {
  const { getApps, initializeApp } = await import('firebase/app');
  const { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } =
    await import('firebase/auth');
  const auth = getAuth(getApps()[0] ?? initializeApp(config));
  // A verifier cannot be reused, and each one needs an empty element of its own.
  const element = document.createElement('div');
  host.replaceChildren(element);
  const verifier = new RecaptchaVerifier(auth, element, { size: 'invisible' });
  try {
    const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
    return async (code) => {
      const { user } = await confirmation.confirm(code);
      const idToken = await user.getIdToken();
      await signOut(auth);
      return idToken;
    };
  } finally {
    verifier.clear();
  }
}
