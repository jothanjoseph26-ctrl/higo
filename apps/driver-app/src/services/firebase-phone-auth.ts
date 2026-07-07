import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

let pendingConfirmation: FirebaseAuthTypes.ConfirmationResult | null = null;

export async function preInitializeRecaptcha(): Promise<void> {
  // Native Firebase phone auth does not need the web reCAPTCHA bootstrap.
}

export async function sendFirebasePhoneOtp(phone: string): Promise<void> {
  pendingConfirmation = await auth().signInWithPhoneNumber(phone);
}

export async function verifyFirebasePhoneOtp(code: string): Promise<string> {
  if (!pendingConfirmation) {
    throw new Error('No Firebase phone verification is in progress');
  }

  const credential = await pendingConfirmation.confirm(code);
  if (!credential) {
    throw new Error('Firebase phone verification failed');
  }
  const idToken = await credential.user.getIdToken();
  pendingConfirmation = null;
  return idToken;
}
