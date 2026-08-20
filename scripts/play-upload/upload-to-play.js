#!/usr/bin/env node
/**
 * Upload AAB to Google Play Console
 * Usage: node upload-to-play.js <aab-path> <package-name> [track]
 * Example: node upload-to-play.js ./app-release.aab com.hiconnectgo.driver production
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../services-key/play-store-deployment.json');

// Increase default socket timeout for large file uploads
https.globalAgent.keepAlive = true;
https.globalAgent.keepAliveMsecs = 30000;
https.globalAgent.timeout = 600000;

async function uploadAab(aabPath, packageName, track = 'internal') {
    if (!fs.existsSync(aabPath)) {
        console.error(`AAB file not found: ${aabPath}`);
        process.exit(1);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidpublisher = google.androidpublisher({
        version: 'v3',
        auth,
        timeout: 600000,
    });

    console.log(`Uploading ${path.basename(aabPath)} to ${packageName} (${track} track)...`);

    // Step 1: Create edit
    const edit = await androidpublisher.edits.insert({
        packageName,
        resource: {},
    });
    const editId = edit.data.id;
    console.log(`  Created edit: ${editId}`);

    try {
        // Step 2: Upload AAB (with retry)
        let uploadResult;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const aabStream = fs.createReadStream(aabPath);
                uploadResult = await androidpublisher.edits.bundles.upload({
                    packageName,
                    editId,
                    media: {
                        mimeType: 'application/octet-stream',
                        body: aabStream,
                    },
                });
                break;
            } catch (uploadErr) {
                console.error(`  Upload attempt ${attempt} failed: ${uploadErr.message}`);
                if (attempt === 3) throw uploadErr;
                console.log(`  Retrying in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        console.log(`  Uploaded: versionCode ${uploadResult.data.versionCode}`);

        // Step 3: Assign to track
        const trackResult = await androidpublisher.edits.tracks.update({
            packageName,
            editId,
            track,
            resource: {
                releases: [{
                    versionCodes: [String(uploadResult.data.versionCode)],
                    status: 'completed',
                }],
            },
        });
        console.log(`  Assigned to track: ${track}`);

        // Step 4: Commit
        await androidpublisher.edits.commit({
            packageName,
            editId,
        });
        console.log(`  Committed! Upload complete.`);

        return {
            versionCode: uploadResult.data.versionCode,
            packageName,
            track,
        };
    } catch (err) {
        // If something fails, delete the edit
        console.error(`  Upload failed: ${err.message}`);
        try {
            await androidpublisher.edits.delete({ packageName, editId });
            console.log(`  Cleaned up edit ${editId}`);
        } catch (e) { /* ignore */ }
        throw err;
    }
}

// CLI
const [,, aabPath, packageName, track] = process.argv;

if (!aabPath || !packageName) {
    console.log('Usage: node upload-to-play.js <aab-path> <package-name> [track]');
    console.log('');
    console.log('Examples:');
    console.log('  node upload-to-play.js ./driver.aab com.hiconnectgo.driver internal');
    console.log('  node upload-to-play.js ./passenger.aab com.higopassenger production');
    process.exit(1);
}

uploadAab(aabPath, packageName, track || 'internal')
    .then(result => {
        console.log(`\nDone! Package: ${result.packageName}, Version: ${result.versionCode}, Track: ${result.track}`);
    })
    .catch(err => {
        console.error(`\nFailed: ${err.message}`);
        process.exit(1);
    });
