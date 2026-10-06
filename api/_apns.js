// Sends push notifications to the native iOS app through APNs.
//
// APNs speaks HTTP/2 only and authenticates with a short-lived JWT signed by the
// .p8 key from the Apple developer account. Node ships both, so this needs no
// dependency. The file starts with an underscore so Vercel does not expose it as
// a route.
//
// Where a token comes from decides which Apple host accepts it. TestFlight and
// App Store builds use production. Builds run from Xcode use the sandbox. The
// token does not say which, so every token is tried on production first and
// retried on sandbox when production says it does not know the device.

import http2 from 'node:http2';
import crypto from 'node:crypto';

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

/** Reads the three APNs settings from the environment, or returns null. */
export function apnsConfigFromEnv(env = process.env) {
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID;
  // Vercel stores a multi-line value with literal \n when pasted on one line.
  const privateKey = env.APNS_KEY_P8?.replace(/\\n/g, '\n');
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey, topic: env.APNS_TOPIC || 'com.bentodining.app' };
}

/** ES256 provider token. Apple accepts one for up to an hour. */
export function apnsJwt({ keyId, teamId, privateKey }, nowMs = Date.now()) {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const head = part({ alg: 'ES256', kid: keyId });
  const body = part({ iss: teamId, iat: Math.floor(nowMs / 1000) });
  // ieee-p1363 is the raw r||s form JWT requires. Node's default is DER.
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

function post(client, { token, jwt, topic, body, collapseId }) {
  return new Promise((resolve) => {
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      // A reminder an hour late is noise, so let Apple drop it instead.
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      ...(collapseId ? { 'apns-collapse-id': collapseId } : {}),
    });
    let status = 0;
    let data = '';
    req.on('response', (h) => { status = h[':status']; });
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      let reason;
      try { reason = JSON.parse(data).reason; } catch { /* 200 has no body */ }
      resolve({ status, reason });
    });
    req.on('error', (e) => resolve({ status: 0, reason: e.code || e.message }));
    req.setTimeout(10000, () => { req.close(); resolve({ status: 0, reason: 'timeout' }); });
    req.end(body);
  });
}

/**
 * Sends one alert to many tokens.
 *
 * Returns { fatal, results }. Each result is { token, ok, prune, env, status,
 * reason }. `prune` means Apple says the token is dead and the row can go.
 * `fatal` is set when Apple rejects the provider token itself, which means the
 * key or team id is wrong and every send would fail, so the run stops there.
 */
export async function sendApns({ tokens, title, collapseId, config, hosts = HOSTS }) {
  const jwt = apnsJwt(config);
  const body = JSON.stringify({ aps: { alert: { title }, sound: 'default' } });
  const clients = {};
  // Opened on first use, so the sandbox connection only exists if a token needs
  // it. The error handler matters: a connection error with no request in flight
  // is otherwise an unhandled 'error' event and takes the whole function down.
  const open = (env) => {
    if (!clients[env]) {
      clients[env] = http2.connect(hosts[env]);
      clients[env].on('error', () => {});
    }
    return clients[env];
  };

  const send = (env, token) =>
    post(open(env), { token, jwt, topic: config.topic, body, collapseId });

  const results = [];
  let fatal = null;

  try {
    // Batches keep one run from opening thousands of streams at once.
    for (let i = 0; i < tokens.length && !fatal; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const out = await Promise.all(batch.map(async (token) => {
        let env = 'production';
        let r = await send(env, token);
        if (r.status === 400 && r.reason === 'BadDeviceToken') {
          env = 'sandbox';
          r = await send(env, token);
        }
        const ok = r.status === 200;
        // Only what Apple says is a dead device. DeviceTokenNotForTopic and
        // TopicDisallowed point at our own configuration, and pruning on them
        // would delete every token because of one wrong setting.
        const dead = r.status === 410
          || (r.status === 400 && r.reason === 'BadDeviceToken');
        return { token, ok, prune: dead, env, status: r.status, reason: r.reason };
      }));
      results.push(...out);
      fatal = out.find((o) => o.status === 403)?.reason ?? null;
    }
  } finally {
    Object.values(clients).forEach((c) => c.close());
  }
  return { fatal, results };
}
