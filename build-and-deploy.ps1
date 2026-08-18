# build-and-deploy.ps1
# One command: commit, push, build, download AABs, upload to Play Store
# Usage: .\build-and-deploy.ps1 "fix: improve matching speed"

param(
    [string]$CommitMessage = "ci: build android release AABs",
    [string]$App = "both",
    [switch]$SkipPlayUpload
)

$ErrorActionPreference = "Stop"
$repo = "jothanjoseph26-ctrl/higo"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HiGO Build & Deploy Automation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Stage and commit
Write-Host "`n[1/6] Committing changes..." -ForegroundColor Yellow
git add -A
$commitOutput = git commit -m $CommitMessage 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nothing to commit." -ForegroundColor Yellow
} else {
    Write-Host "  Committed: $CommitMessage" -ForegroundColor Green
}

# Step 2: Push
Write-Host "`n[2/6] Pushing to GitHub..." -ForegroundColor Yellow
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Pushed" -ForegroundColor Green

# Step 3: Trigger workflow
Write-Host "`n[3/6] Triggering Android build..." -ForegroundColor Yellow
gh workflow run android-build.yml --repo $repo --ref main -f app=$App -f build_type=aab 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed to trigger!" -ForegroundColor Red
    exit 1
}
Write-Host "  Workflow triggered" -ForegroundColor Green

# Step 4: Wait for run
Write-Host "`n[4/6] Waiting for workflow..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$runId = ""
for ($i = 0; $i -lt 60; $i += 3) {
    $runs = gh run list --workflow=android-build.yml --repo $repo --limit 1 --json databaseId,status 2>&1 | ConvertFrom-Json
    if ($runs.Count -gt 0 -and $runs[0].status -notin @("queued", "waiting")) {
        $runId = $runs[0].databaseId
        break
    }
    Start-Sleep -Seconds 3
    Write-Host "  Waiting... ($($i+3)s)" -ForegroundColor Gray
}

if (-not $runId) {
    Write-Host "  Could not detect run. Check: https://github.com/$repo/actions" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Build #$runId started" -ForegroundColor Green

# Step 5: Watch build
Write-Host "`n[5/6] Building (10-20 min)..." -ForegroundColor Yellow
gh run watch $runId --repo $repo --exit-status
Write-Host "  Build complete!" -ForegroundColor Green

# Step 6: Download artifacts
Write-Host "`n[6/6] Downloading artifacts..." -ForegroundColor Yellow
$artifactDir = "dist\android-builds\$(Get-Date -Format 'yyyy-MM-dd_HHmm')"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

$driverAab = ""
$passengerAab = ""

if ($App -eq "both" -or $App -eq "driver") {
    gh run download $runId --repo $repo --name higo-driver-aab --dir "$artifactDir\driver" 2>&1
    $driverAab = Get-ChildItem "$artifactDir\driver\*.aab" | Select-Object -First 1
    Write-Host "  Driver AAB: $($driverAab.Name)" -ForegroundColor Green
}
if ($App -eq "both" -or $App -eq "passenger") {
    gh run download $runId --repo $repo --name higo-passenger-aab --dir "$artifactDir\passenger" 2>&1
    $passengerAab = Get-ChildItem "$artifactDir\passenger\*.aab" | Select-Object -First 1
    Write-Host "  Passenger AAB: $($passengerAab.Name)" -ForegroundColor Green
}

# Step 7: Upload to Play Store (optional)
if (-not $SkipPlayUpload) {
    $serviceAccountPath = Join-Path $scriptDir "services-key\play-store-deployment.json"
    if (Test-Path $serviceAccountPath) {
        Write-Host "`n[BONUS] Uploading to Play Store..." -ForegroundColor Yellow

        if ($driverAab -and ($App -eq "both" -or $App -eq "driver")) {
            Write-Host "  Uploading driver app..." -ForegroundColor Cyan
            node "$scriptDir\scripts\play-upload\upload-to-play.js" $driverAab.FullName "com.hiconnectgo.driver" internal
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Driver uploaded!" -ForegroundColor Green
            } else {
                Write-Host "  Driver upload failed (build still works)" -ForegroundColor Yellow
            }
        }

        if ($passengerAab -and ($App -eq "both" -or $App -eq "passenger")) {
            Write-Host "  Uploading passenger app..." -ForegroundColor Cyan
            node "$scriptDir\scripts\play-upload\upload-to-play.js" $passengerAab.FullName "com.higopassenger" internal
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Passenger uploaded!" -ForegroundColor Green
            } else {
                Write-Host "  Passenger upload failed (build still works)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "`n  Play Store upload skipped (no service account key)" -ForegroundColor Yellow
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ALL DONE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Artifacts: $artifactDir" -ForegroundColor White
Write-Host ""
Write-Host "  Apps:" -ForegroundColor Yellow
if ($driverAab) { Write-Host "    Driver:    $($driverAab.FullName)" -ForegroundColor White }
if ($passengerAab) { Write-Host "    Passenger: $($passengerAab.FullName)" -ForegroundColor White }
