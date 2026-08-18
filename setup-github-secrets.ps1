# GitHub Secrets Setup Script
# Run this once to configure all GitHub Actions secrets

$repo = "Floodgate46/higo"  # Update if your repo name is different

Write-Host "Setting up GitHub Actions secrets for $repo..." -ForegroundColor Cyan
Write-Host ""

# Read .env file
$envFile = Get-Content ".env" -Raw
$envLocal = Get-Content ".env.local" -Raw

function Set-GitHubSecret {
    param($Name, $Value)
    if ($Value -and $Value -ne "xxxxx" -and $Value -notmatch "^change_me") {
        $Value | gh secret set $Name --repo $repo
        Write-Host "  [OK] $Name" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] $Name (placeholder value)" -ForegroundColor Yellow
    }
}

# Android signing (keystore)
Write-Host "`n1. Android Signing..." -ForegroundColor Yellow
$keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
$keystoreBase64 | gh secret set ANDROID_KEYSTORE_BASE64 --repo $repo
Write-Host "  [OK] ANDROID_KEYSTORE_BASE64" -ForegroundColor Green
"higo2026" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo $repo
Write-Host "  [OK] ANDROID_KEYSTORE_PASSWORD" -ForegroundColor Green
"higo" | gh secret set ANDROID_KEY_ALIAS --repo $repo
Write-Host "  [OK] ANDROID_KEY_ALIAS" -ForegroundColor Green
"higo2026" | gh secret set ANDROID_KEY_PASSWORD --repo $repo
Write-Host "  [OK] ANDROID_KEY_PASSWORD" -ForegroundColor Green

# Google Maps
Write-Host "`n2. Google Maps..." -ForegroundColor Yellow
$mapsKey = ($envFile | Select-String "GOOGLE_MAPS_API_KEY=(.+)").Matches.Groups[1].Value
Set-GitHubSecret "GOOGLE_MAPS_API_KEY" $mapsKey

# Firebase
Write-Host "`n3. Firebase..." -ForegroundColor Yellow
$firebaseProjectId = ($envFile | Select-String "FIREBASE_PROJECT_ID=(.+)").Matches.Groups[1].Value
Set-GitHubSecret "FIREBASE_PROJECT_ID" $firebaseProjectId

# Paystack
Write-Host "`n4. Paystack..." -ForegroundColor Yellow
$paystackSecret = ($envFile | Select-String "PAYSTACK_SECRET_KEY=(.+)").Matches.Groups[1].Value
$paystackPublic = ($envFile | Select-String "PAYSTACK_PUBLIC_KEY=(.+)").Matches.Groups[1].Value
Set-GitHubSecret "PAYSTACK_SECRET_KEY" $paystackSecret
Set-GitHubSecret "PAYSTACK_PUBLIC_KEY" $paystackPublic

# Railway
Write-Host "`n5. Railway..." -ForegroundColor Yellow
$railwayToken = ($envFile | Select-String "RAILWAY_TOKEN=(.+)").Matches.Groups[1].Value
Set-GitHubSecret "RAILWAY_TOKEN" $railwayToken

Write-Host "`nDone! Go to https://github.com/$repo/settings/secrets/actions to verify." -ForegroundColor Cyan
