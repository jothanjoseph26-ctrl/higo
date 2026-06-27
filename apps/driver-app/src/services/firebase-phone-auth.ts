export async function sendFirebasePhoneOtp(_phone: string): Promise<void> {
  throw new Error('Firebase phone auth is only available on web');
}

export async function verifyFirebasePhoneOtp(_code: string): Promise<string> {
  throw new Error('Firebase phone auth is only available on web');
}

export async function preInitializeRecaptcha(): Promise<void> {
  // No-op on native platforms
}