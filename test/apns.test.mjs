// Tests the APNs sender against a local HTTP/2 server that behaves like Apple's.
//
//   node --test test/apns.test.mjs
//
// It checks the provider token's signature, the request Apple would receive,
// and every outcome the sender has to act on: sent, dead token, sandbox-only
// token, a rejected key, and a server error.

import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import crypto from 'node:crypto';
import { apnsJwt, sendApns, apnsConfigFromEnv } from '../api/_apns.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const config = { keyId: 'KEY123', teamId: 'TEAM456', privateKey: pem, topic: 'com.bentodining.app' };

// A fake APNs host. `behave` decides the reply for each (token).
function fakeApple(behave) {
  const seen = [];
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    const token = headers[':path'].split('/').pop();
    seen.push({ token, headers });
    const { status, reason } = behave(token);
    stream.respond({ ':status': status, 'content-type': 'application/json' });
    stream.end(reason ? JSON.stringify({ reason }) : '');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() });
  }));
}

test('provider token is an ES256 JWT that verifies with the public key', () => {
  const jwt = apnsJwt(config, 1_700_000_000_000);
  const [h, b, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(b, 'base64url')), { iss: 'TEAM456', iat: 1_700_000_000 });
  assert.equal(Buffer.from(sig, 'base64url').length, 64, 'raw r||s, not DER');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('config reads the environment and turns \\n into newlines', () => {
  assert.equal(apnsConfigFromEnv({}), null);
  assert.equal(apnsConfigFromEnv({ APNS_KEY_ID: 'a', APNS_TEAM_ID: 'b' }), null);
  const c = apnsConfigFromEnv({ APNS_KEY_ID: 'a', APNS_TEAM_ID: 'b', APNS_KEY_P8: 'L1\\nL2' });
  assert.equal(c.privateKey, 'L1\nL2');
  assert.equal(c.topic, 'com.bentodining.app');
});

test('a delivered notification sends the request Apple expects', async () => {
  const prod = await fakeApple(() => ({ status: 200 }));
  const sand = await fakeApple(() => ({ status: 200 }));
  const { fatal, results } = await sendApns({
    tokens: ['aaa'], title: 'Lunch is picked', collapseId: 'bento-lunch', config,
    hosts: { production: prod.url, sandbox: sand.url },
  });
  prod.close(); sand.close();
  assert.equal(fatal, null);
  assert.deepEqual(results.map(({ token, ok, prune, env }) => ({ token, ok, prune, env })),
    [{ token: 'aaa', ok: true, prune: false, env: 'production' }]);
  const h = prod.seen[0].headers;
  assert.equal(h[':method'], 'POST');
  assert.equal(h[':path'], '/3/device/aaa');
  assert.equal(h['apns-topic'], 'com.bentodining.app');
  assert.equal(h['apns-push-type'], 'alert');
  assert.equal(h['apns-collapse-id'], 'bento-lunch');
  assert.match(h.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(sand.seen.length, 0, 'sandbox untouched when production accepts');
});

test('a token only the sandbox knows is retried there and kept', async () => {
  const prod = await fakeApple(() => ({ status: 400, reason: 'BadDeviceToken' }));
  const sand = await fakeApple(() => ({ status: 200 }));
  const { results } = await sendApns({
    tokens: ['dev'], title: 't', config, hosts: { production: prod.url, sandbox: sand.url },
  });
  prod.close(); sand.close();
  assert.equal(results[0].ok, true);
  assert.equal(results[0].env, 'sandbox');
  assert.equal(results[0].prune, false);
});

test('a token neither host knows is pruned', async () => {
  const prod = await fakeApple(() => ({ status: 400, reason: 'BadDeviceToken' }));
  const sand = await fakeApple(() => ({ status: 400, reason: 'BadDeviceToken' }));
  const { results } = await sendApns({
    tokens: ['gone'], title: 't', config, hosts: { production: prod.url, sandbox: sand.url },
  });
  prod.close(); sand.close();
  assert.equal(results[0].ok, false);
  assert.equal(results[0].prune, true);
});

test('Unregistered (410) is pruned', async () => {
  const prod = await fakeApple(() => ({ status: 410, reason: 'Unregistered' }));
  const sand = await fakeApple(() => ({ status: 200 }));
  const { results } = await sendApns({
    tokens: ['old'], title: 't', config, hosts: { production: prod.url, sandbox: sand.url },
  });
  prod.close(); sand.close();
  assert.equal(results[0].prune, true);
  assert.equal(sand.seen.length, 0, '410 is not retried on sandbox');
});

test('a rejected key stops the run and prunes nothing', async () => {
  const prod = await fakeApple(() => ({ status: 403, reason: 'InvalidProviderToken' }));
  const sand = await fakeApple(() => ({ status: 200 }));
  const { fatal, results } = await sendApns({
    tokens: ['a', 'b'], title: 't', config, hosts: { production: prod.url, sandbox: sand.url },
  });
  prod.close(); sand.close();
  assert.equal(fatal, 'InvalidProviderToken');
  assert.ok(results.every((r) => !r.prune && !r.ok));
});

test('a wrong topic never prunes, and a server error is only a failure', async () => {
  const topic = await fakeApple(() => ({ status: 400, reason: 'DeviceTokenNotForTopic' }));
  const boom = await fakeApple(() => ({ status: 500, reason: 'InternalServerError' }));
  const sand = await fakeApple(() => ({ status: 200 }));
  const a = await sendApns({ tokens: ['x'], title: 't', config, hosts: { production: topic.url, sandbox: sand.url } });
  const b = await sendApns({ tokens: ['y'], title: 't', config, hosts: { production: boom.url, sandbox: sand.url } });
  topic.close(); boom.close(); sand.close();
  assert.equal(a.results[0].prune, false);
  assert.equal(b.results[0].prune, false);
  assert.equal(b.results[0].ok, false);
});

test('a refused connection is a failure, not a crash', async () => {
  const { results } = await sendApns({
    tokens: ['z'], title: 't', config,
    hosts: { production: 'http://127.0.0.1:1', sandbox: 'http://127.0.0.1:1' },
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].prune, false);
});
