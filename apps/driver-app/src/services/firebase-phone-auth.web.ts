import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';
import { api } from './api';

const RECAPTCHA_ID = 'firebase-recaptcha';

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;
let pendingConfirmation: ConfirmationResult | null = null;

async function ensureFirebase(): Promise<Auth> {
  const config = await api.getFirebaseConfig();
  if (!getApps().length) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApps()[0]!;
  }
  auth = getAuth(firebaseApp);
  return auth;
}

function ensureRecaptcha(activeAuth: Auth): RecaptchaVerifier {
  if (typeof document === 'undefined') {
    throw new Error('Firebase phone auth requires a browser');
  }

  let container = document.getElementById(RECAPTCHA_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = RECAPTCHA_ID;
    container.style.display = 'none';
    document.body.appendChild(container);
  }

  recaptchaVerifier?.clear();
  recaptchaVerifier = new RecaptchaVerifier(activeAuth, RECAPTCHA_ID, {
    size: 'invisible',
  });
  return recaptchaVerifier;
}

export async function sendFirebasePhoneOtp(phone: string): Promise<void> {
  const activeAuth = await ensureFirebase();
  const verifier = ensureRecaptcha(activeAuth);
  try {
    pendingConfirmation = await signInWithPhoneNumber(activeAuth, phone, verifier);
  } catch (err: unknown) {
    // Reset reCAPTCHA so the next attempt gets a fresh verifier instead of timing out
    recaptchaVerifier?.clear();
    recaptchaVerifier = null;

    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('too-many-requests') || code.includes('error-code:-39')) {
      throw new Error(
        'Too many verification attempts. Please wait a few minutes before trying again.',
      );
    }
    throw err;
  }
}

export async function verifyFirebasePhoneOtp(code: string): Promise<string> {
  if (!pendingConfirmation) {
    throw new Error('No verification in progress. Request a new code.');
  }

  const credential = await pendingConfirmation.confirm(code);
  const idToken = await credential.user.getIdToken();
  pendingConfirmation = null;
  recaptchaVerifier?.clear();
  recaptchaVerifier = null;
  return idToken;
}