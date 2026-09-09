import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { basename } from 'path';

const PACKAGE = process.argv[2] || 'com.hiconnectgo.driver';
const AAB_PATH = process.argv[3] || 'artifacts/app-release.aab';
const TRACK = 'alpha';

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'services-key/play-store-deployment.json',
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const androidpublisher = google.androidpublisher({ version: 'v3', auth });

  console.log('Creating edit...');
  const editRes = await androidpublisher.edits.insert({
    packageName: PACKAGE,
    resource: { id: undefined },
  });
  const editId = editRes.data.id;
  console.log('Edit ID:', editId);

  try {
    console.log('Uploading AAB...');
    const uploadRes = await androidpublisher.edits.bundles.upload({
      packageName: PACKAGE,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: readFileSync(AAB_PATH),
      },
    });
    const versionCode = uploadRes.data.versionCode;
    console.log('Uploaded. Version code:', versionCode);

    console.log(`Updating track "${TRACK}" to version ${versionCode}...`);
    await androidpublisher.edits.tracks.update({
      packageName: PACKAGE,
      editId,
      track: TRACK,
      resource: {
        releases: [{
          name: `v${versionCode}`,
          status: 'completed',
          versionCodes: [String(versionCode)],
        }],
      },
    });

    console.log('Committing edit...');
    await androidpublisher.edits.commit({
      packageName: PACKAGE,
      editId,
    });
    console.log(`Done! ${PACKAGE} v${versionCode} published to ${TRACK} track.`);
  } catch (err) {
    console.error('Error:', err.message);
    await androidpublisher.edits.delete({
      packageName: PACKAGE,
      editId,
    }).catch(() => {});
    process.exit(1);
  }
}

main();
