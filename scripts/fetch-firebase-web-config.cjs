const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const cred = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../hiconnect-firebase-services-key.json'),
    'utf8',
  ),
);

async function main() {
  const auth = new GoogleAuth({
    credentials: cred,
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const project = 'hiconnect-3caf8';

  const list = await client.request({
    url: `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`,
  });

  let appId = list.data.apps?.[0]?.appId;
  if (!appId) {
    const created = await client.request({
      url: `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps`,
      method: 'POST',
      data: { displayName: 'HiGo Web' },
    });

    let operation = created.data;
    while (operation && !operation.done) {
      await new Promise((r) => setTimeout(r, 2000));
      operation = (
        await client.request({
          url: `https://firebase.googleapis.com/v1/${operation.name}`,
        })
      ).data;
    }

    appId = operation?.response?.appId;
    if (!appId) {
      throw new Error(
        `Failed to create web app: ${JSON.stringify(operation ?? created.data)}`,
      );
    }
    console.log('Created web app:', appId);
  } else {
    console.log('Using existing web app:', appId);
  }

  const config = await client.request({
    url: `https://firebase.googleapis.com/v1beta1/projects/${project}/webApps/${appId}/config`,
  });

  console.log(JSON.stringify(config.data, null, 2));
}

main().catch((err) => {
  console.error(err.response?.data ?? err.message ?? err);
  process.exit(1);
});