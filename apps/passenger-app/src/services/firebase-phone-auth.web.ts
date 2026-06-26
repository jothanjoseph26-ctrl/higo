import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type Auth,
  type ConfirmationResult,
} from 'firebase/auth';
import { api } from './api';

/** Must match nativeID on login screen (react-native-web → id attribute). */
export const RECAPTCHA_CONTAINER_ID = 'firebase-recaptcha';

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;
let pendingConfirmation: ConfirmationResult | null = null;
let sendInProgress = false;

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

function ensureRecaptchaContainer(): HTMLElement {
  const container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (!container) {
    throw new Error(
      'reCAPTCHA container is missing. Reload the page and try again.',
    );
  }
  return container;
}

/** Fully remove widget + verifier so a new one can mount on the same element. */
function destroyRecaptcha(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // Widget may already be cleared
    }
    recaptchaVerifier = null;
  }
  const container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (container) {
    container.innerHTML = '';
  }
}

/** Reuse a single RecaptchaVerifier — only create when none exists. */
function getOrCreateRecaptcha(activeAuth: Auth): RecaptchaVerifier {
  if (typeof document === 'undefined') {
    throw new Error('Firebase phone auth requires a browser');
  }

  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  ensureRecaptchaContainer();
  recaptchaVerifier = new RecaptchaVerifier(activeAuth, RECAPTCHA_CONTAINER_ID, {
    size: 'normal',
  });
  return recaptchaVerifier;
}

function mapFirebasePhoneError(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);

  if (code.includes('too-many-requests') || code.includes('error-code:-39')) {
    return new Error(
      'Too many verification attempts. Please wait a few minutes before trying again.',
    );
  }
  if (
    code.includes('auth/invalid-app-credential') ||
    code.includes('auth/app-not-authorized')
  ) {
    return new Error(
      'Firebase Phone Auth is not authorized for this domain. Add admin-production-13cc.up.railway.app to Firebase Authorized domains and enable Phone sign-in.',
    );
  }
  if (
    message.includes('already been rendered') ||
    message.includes('recaptcha-already')
  ) {
    return new Error('Verification is already in progress. Please wait a moment and try again.');
  }
  if (
    message.includes('Cannot contact reCAPTCHA') ||
    message.includes('contact reCAPTCHA')
  ) {
    return new Error(
      'Cannot reach Google reCAPTCHA. Disable ad blockers, try Incognito mode, switch network (mobile data), or disconnect VPN.',
    );
  }
  if (message.includes('CONNECTION_CLOSED') || message.includes('Failed to fetch')) {
    return new Error(
      'Could not reach Firebase to send SMS. Check your network connection and try again.',
    );
  }
  return err instanceof Error ? err : new Error(message);
}

export async function sendFirebasePhoneOtp(phone: string): Promise<void> {
  if (sendInProgress) {
    return;
  }

  sendInProgress = true;
  try {
    const activeAuth = await ensureFirebase();

    // Resend: tear down previous session before a new SMS attempt
    if (pendingConfirmation) {
      destroyRecaptcha();
      pendingConfirmation = null;
    }

    const verifier = getOrCreateRecaptcha(activeAuth);
    pendingConfirmation = await signInWithPhoneNumber(activeAuth, phone, verifier);
  } catch (err: unknown) {
    destroyRecaptcha();
    pendingConfirmation = null;
    throw mapFirebasePhoneError(err);
  } finally {
    sendInProgress = false;
  }
}

export async function verifyFirebasePhoneOtp(code: string): Promise<string> {
  if (!pendingConfirmation) {
    throw new Error('No verification in progress. Request a new code.');
  }

  try {
    const credential = await pendingConfirmation.confirm(code);
    const idToken = await credential.user.getIdToken();
    return idToken;
  } finally {
    pendingConfirmation = null;
    destroyRecaptcha();
  }
}