# Android CI/CD Setup Guide (GitHub Actions)

Replaces EAS Build with GitHub Actions workflows.

## Quick Start

### 1. Generate a Release Keystore (one-time)

Run on your local machine (Windows):

```bash
keytool -genkeypair -v ^
  -storetype PKCS12 ^
  -keystore release.keystore ^
  -alias higo ^
  -keyalg RSA ^
  -keysize 2048 ^
  -validity 10000 ^
  -storepass YOUR_STORE_PASSWORD ^
  -keypass YOUR_KEY_PASSWORD ^
  -dname "CN=Hiconnect Global Services, OU=Engineering, O=Jetech Limited, L=Abuja, ST=FCT, C=NG"
```

### 2. Encode the Keystore for GitHub Secrets

```bash
certutil -encodehex -f release.keystore keystore_base64.txt 0
```

Or on PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Out-File keystore_base64.txt
```

### 3. Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret Name | Value |
|-------------|-------|
| `ANDROID_KEYSTORE_BASE64` | Contents of `keystore_base64.txt` (the base64 string) |
| `ANDROID_KEYSTORE_PASSWORD` | The store password you chose |
| `ANDROID_KEY_ALIAS` | `higo` (or whatever alias you used) |
| `ANDROID_KEY_PASSWORD` | The key password you chose |
| `GOOGLE_MAPS_API_KEY` | `AIzaSyAfmoovUBAAMK2hLAFYf0ZUcZaPZupJ2dA` |

### 4. Build Apps

#### Option A: Manual Trigger (Recommended)

1. Go to **Actions → Android Build**
2. Click **Run workflow**
3. Select app (both/driver/passenger) and build type (apk/aab)
4. Download the artifact when done

#### Option B: Tag-based Build

```bash
# Build both apps (AAB for Play Store)
git tag v1.0.0
git push origin v1.0.0

# Build driver only
git tag driver-v1.0.0
git push origin driver-v1.0.0

# Build passenger only
git tag passenger-v1.0.0
git push origin passenger-v1.0.0
```

### 5. Upload to Play Store

Download the AAB artifact from GitHub Actions, then:
- Go to [Google Play Console](https://play.google.com/console)
- Select your app → **Production** → **Create new release**
- Upload the `.aab` file from `app/build/outputs/bundle/release/`

---

## How It Works

| Step | What Happens |
|------|-------------|
| Checkout | Pulls your code |
| Node + pnpm | Sets up JS runtime and package manager |
| Java 17 | Required for Android/Gradle builds |
| `pnpm install` | Installs all dependencies |
| Build workspace libs | Builds `@higo/brand-tokens`, `@higo/shared-types`, `@higo/api-client` |
| Decode keystore | Converts base64 keystore to file |
| Gradle build | Runs `assembleRelease` (APK) or `bundleRelease` (AAB) |
| Upload artifact | Makes the build downloadable from GitHub Actions |

## Environment Variables

These are set automatically during the build (from `eas.json`):

| Variable | Driver | Passenger |
|----------|--------|-----------|
| `EXPO_PUBLIC_APP_URL` | `https://pilot.hiconnectgo.com` | `https://ride.hiconnectgo.com` |
| `EXPO_PUBLIC_API_BASE_URL` | `https://api.hiconnectgo.com/api` | `https://api.hiconnectgo.com/api` |
| `EXPO_PUBLIC_SOCKET_URL` | `https://api.hiconnectgo.com` | `https://api.hiconnectgo.com` |
| `EXPO_PUBLIC_MAPS_MOCK` | `false` | `false` |
| `EXPO_PUBLIC_PUSH_MOCK` | `false` | `false` |

## Troubleshooting

### Build fails with "Could not find keystore"
- Make sure `ANDROID_KEYSTORE_BASE64` secret is set correctly
- The base64 string should NOT include headers/footers

### Build fails with "SDK not found"
- Java 17 is set up automatically. If it fails, check the Actions runner logs.

### Workspace libs not found
- The workflow runs `nx run-many -t build` for workspace libs before the Gradle build
- If this fails, check that `pnpm install` completed successfully
