// Run only against a disposable database, after the native Better Auth migration.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
if (!process.env.DATABASE_URL?.includes('aurum_site_qa_')) throw new Error('Disposable QA database required');
const nativeFetch = globalThis.fetch,
  serverId = '168cf9cf-dd90-4a6e-bd9b-3e51a50653f1';
const uuidA = '11111111-1111-1111-1111-111111111111',
  uuidB = '22222222-2222-2222-2222-222222222222';
let gameCalls = 0,
  rank = 'leader';
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(process.env.AURUM_PANEL_BRIDGE_URL)) {
    const path = String(url).split('/').pop(),
      body = options.body ? JSON.parse(options.body) : {};
    if (path === 'servers') return Response.json({ servers: [{ id: serverId, name: 'QA Minecraft' }] });
    if (path === 'guild-action') {
      gameCalls++;
      return Response.json({ ok: true, message: 'Done' });
    }
    if (path === 'profile')
      return Response.json({
        player: { online: false, playTimeTicks: 72000, deaths: 0, playerKills: 0 },
        balance: { amount: 10, formatted: '10 coins', currency: 'coins' },
        guild: {
          available: true,
          membership: { guildId: 1, guildName: 'QA Guild', guildTag: 'QA', rank: 'member' },
        },
      });
    if (path === 'guild')
      return Response.json({
        guild: {
          id: 1,
          name: 'QA Guild',
          tag: 'QA',
          leaderName: 'OwnerQA',
          memberCount: 2,
          bankBalance: 200,
          createdAt: Date.now(),
          members: [
            { uuid: uuidA, name: 'OwnerMC', rank: 'leader' },
            { uuid: uuidB, name: 'OtherMC', rank: 'member' },
          ],
        },
        membership:
          body.playerUuid === uuidA
            ? { guildId: 1, rank }
            : body.playerUuid === uuidB
              ? { guildId: 1, rank: 'member' }
              : null,
        actionsAvailable: true,
        invited: false,
      });
    throw new Error('Unexpected bridge operation');
  }
  return nativeFetch(url, options);
};
const { pool, initSiteData } = await import('../src/site-data.js');
const { initializeOwner } = await import('../src/site-access.js');
const { createAuth } = await import('../src/auth.js');
await initSiteData();
const bootstrap = createAuth({ bootstrap: true }),
  password = randomBytes(24).toString('base64url');
async function user(username, verified = true) {
  const result = await bootstrap.api.signUpEmail({
    body: { name: username, username, email: `${username.toLowerCase()}@test.invalid`, password },
  });
  if (verified) await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
  return result.user.id;
}
const owner = await user('OwnerQA'),
  other = await user('OtherQA'),
  third = await user('ThirdQA'),
  unverified = await user('UnverifiedQA', false);
await pool.query('INSERT INTO site_admin(user_id) VALUES($1)', [owner]);
await initializeOwner(pool, owner);
for (const [id, uuid, name] of [
  [owner, uuidA, 'OwnerMC'],
  [other, uuidB, 'OtherMC'],
])
  await pool.query(
    'INSERT INTO site_minecraft_profile(user_id,server_id,server_name,player_uuid,player_name) VALUES($1,$2,$3,$4,$5)',
    [id, serverId, 'QA Minecraft', uuid, name],
  );
const { server } = await import('../src/server.js');
if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
const base = process.env.BETTER_AUTH_URL;
let clientNumber = 10;
function client() {
  const cookies = new Map();
  const ip = `127.0.0.${++clientNumber}`;
  return async (path, body, method = body ? 'POST' : 'GET', origin = base) => {
    const response = await nativeFetch(base + path, {
      method,
      headers: {
        'x-real-ip': ip,
        ...(origin ? { origin } : {}),
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(';'),
        index = pair.indexOf('=');
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  };
}
const a = client(),
  b = client(),
  c = client();
let checks = 0;
const expect = async (promise, status) => {
  const result = await promise;
  assert.equal(result.status, status, JSON.stringify(result.data));
  checks++;
  return result.data;
};
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    bytes = [];
  let bits = 0,
    value = 0;
  for (const char of secret.replace(/=+$/, '')) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(),
    offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
try {
  await expect(a('/api/auth/sign-in/email', { email: 'ownerqa@test.invalid', password }), 200);
  await expect(b('/api/auth/sign-in/email', { email: 'otherqa@test.invalid', password }), 200);
  await expect(c('/api/auth/sign-in/email', { email: 'thirdqa@test.invalid', password }), 200);
  assert.equal((await expect(a('/api/site/me'), 200)).owner, true);
  await expect(b('/api/site/admin/users'), 403);
  await expect(a('/api/site/admin/users', { userId: owner, admin: false, password }, 'PUT'), 409);
  await expect(a('/api/site/admin/users', { userId: unverified, admin: true, password }, 'PUT'), 409);
  await expect(a('/api/site/admin/users', { userId: other, admin: true, password: 'incorrect' }, 'PUT'), 403);
  await expect(a('/api/site/admin/users', { userId: other, admin: true, password }, 'PUT'), 200);
  assert.equal((await expect(b('/api/site/me'), 200)).admin, true);
  await expect(b('/api/site/admin/users', { userId: third, admin: true, password }, 'PUT'), 403);
  await expect(a('/api/site/admin/users', { userId: other, admin: false, password }, 'PUT'), 200);
  await expect(b('/api/site/admin/settings'), 403);
  await expect(
    a(
      '/api/site/privacy',
      { profile: 'ALL', comments: 'ALL', messages: 'ALL', statistics: 'PRIVATE' },
      'PUT',
      'https://evil.invalid',
    ),
    403,
  );

  const profilePrivacy = {
    profile: 'FRIENDS',
    comments: 'FRIENDS',
    messages: 'FRIENDS',
    statistics: 'PRIVATE',
  };
  await expect(a('/api/site/privacy', profilePrivacy, 'PUT'), 200);
  await expect(b('/api/site/profile/ownerqa'), 403);
  await expect(b('/api/site/profile/ownerqa/avatar'), 403);
  await expect(b('/api/site/friends', { action: 'request', username: 'ownerqa' }), 200);
  await expect(b('/api/site/messages', { username: 'ownerqa', text: 'blocked before acceptance' }), 403);
  await expect(a('/api/site/friends', { action: 'accept', username: 'otherqa' }), 200);
  await expect(b('/api/site/profile/ownerqa'), 200);
  await expect(b('/api/site/messages', { username: 'ownerqa', text: 'Hello, friend' }), 201);
  assert.equal((await expect(a('/api/site/messages?user=otherqa'), 200)).messages[0].body, 'Hello, friend');
  assert.equal((await expect(c('/api/site/messages?user=ownerqa'), 200)).messages.length, 0);
  await expect(a('/api/site/friends', { action: 'block', username: 'otherqa' }), 200);
  await expect(b('/api/site/messages?user=ownerqa'), 403);
  await expect(b('/api/site/messages', { username: 'ownerqa', text: 'bypass' }), 403);
  await expect(a('/api/site/friends', { action: 'unblock', username: 'otherqa' }), 200);
  await expect(
    a(
      '/api/site/privacy',
      { profile: 'ALL', comments: 'ALL', messages: 'ALL', statistics: 'PRIVATE' },
      'PUT',
    ),
    200,
  );

  const post = await expect(
    a('/api/site/feed', { scope: 'community', kind: 'posts', text: '<b>Plain text</b>' }),
    201,
  );
  await expect(b('/api/site/feed', { scope: 'community', kind: 'posts', text: 'forged admin post' }), 403);
  await expect(
    b('/api/site/feed', { scope: 'community', kind: 'comments', parent: post.id, text: 'Comment' }),
    201,
  );
  assert.equal((await expect(b('/api/site/feed?scope=community'), 200)).items[0].body, '<b>Plain text</b>');
  await expect(b('/api/site/reports', { id: post.id, reason: 'QA report' }), 201);
  assert.equal((await expect(a('/api/site/admin/reports'), 200)).reports.length, 1);
  await expect(b('/api/site/content/' + post.id, undefined, 'DELETE'), 403);
  await expect(a('/api/site/content/' + post.id, undefined, 'DELETE'), 200);
  assert.equal(
    (await expect(a('/api/site/feed?scope=community&kind=comments&parent=' + post.id), 404)).error,
    'Запись не найдена.',
  );

  const gamePrivacy = { profile: 'PRIVATE', comments: 'OFF', messages: 'ALL', statistics: 'PRIVATE' };
  await expect(a('/api/site/privacy?scope=minecraft:' + serverId, gamePrivacy, 'PUT'), 200);
  await expect(b(`/api/site/minecraft/profile?server=${serverId.toUpperCase()}&user=ownerqa`), 403);
  assert.equal((await expect(b('/api/site/profile/ownerqa'), 200)).minecraftProfiles.length, 0);
  await expect(
    a('/api/site/privacy?scope=minecraft:' + serverId, { ...gamePrivacy, profile: 'ALL' }, 'PUT'),
    200,
  );
  const visit = await expect(b(`/api/site/minecraft/profile?server=${serverId}&user=ownerqa`), 200);
  assert.equal(visit.balance, null);
  assert.equal(visit.player, null);
  assert.equal(visit.profile.playerUuid, undefined);

  await expect(
    a(
      '/api/site/minecraft/guild/1?server=' + serverId,
      { description: 'Our guild', roster: 'MEMBERS', feed: 'MEMBERS', writers: ['leader'] },
      'PUT',
    ),
    200,
  );
  const outsider = await expect(c('/api/site/minecraft/guild/1?server=' + serverId), 200);
  assert.equal(outsider.rosterVisible, false);
  assert.equal(outsider.members.length, 0);
  assert.equal(outsider.bankBalance, null);
  await expect(c('/api/site/feed?scope=' + encodeURIComponent(`guild:${serverId}:1`)), 403);
  await expect(
    b(
      '/api/site/minecraft/guild/1?server=' + serverId,
      { description: 'forged', roster: 'PUBLIC', feed: 'PUBLIC', writers: ['member'] },
      'PUT',
    ),
    403,
  );
  const action = { action: 'promote', target: 'OtherMC', requestId: randomUUID() };
  await expect(a('/api/site/minecraft/guild/1/action?server=' + serverId, action), 200);
  await expect(a('/api/site/minecraft/guild/1/action?server=' + serverId, action), 200);
  assert.equal(gameCalls, 1);
  await expect(
    a('/api/site/minecraft/guild/1/action?server=' + serverId, { ...action, action: 'kick' }),
    409,
  );
  rank = 'member';
  await expect(
    a('/api/site/minecraft/guild/1/action?server=' + serverId, {
      action: 'promote',
      target: 'OtherMC',
      requestId: randomUUID(),
    }),
    403,
  );
  rank = 'leader';

  const setup = await expect(a('/api/auth/two-factor/enable', { password, method: 'totp' }), 200);
  assert.equal((await expect(a('/api/auth/get-session'), 200)).user.twoFactorEnabled, false);
  const secret = new URL(setup.totpURI).searchParams.get('secret');
  await expect(a('/api/auth/two-factor/verify-totp', { code: totp(secret), trustDevice: false }), 200);
  await expect(a('/api/auth/sign-out', {}), 200);
  const pending = await expect(
    a('/api/auth/sign-in/email', { email: 'ownerqa@test.invalid', password }),
    200,
  );
  assert.equal(pending.twoFactorRedirect, true);
  await expect(a('/api/site/me'), 401);
  await expect(a('/api/auth/two-factor/verify-totp', { code: 'not-a-code', trustDevice: false }), 401);
  await expect(
    a('/api/auth/two-factor/verify-backup-code', { code: setup.backupCodes[0], trustDevice: false }),
    200,
  );
  await expect(a('/api/site/me'), 200);
  await expect(a('/api/auth/two-factor/disable', { password }), 200);
  await expect(a('/api/auth/sign-out', {}), 200);
  await expect(a('/api/auth/sign-in/email', { email: 'ownerqa@test.invalid', password }), 200);
  await expect(a('/api/site/me'), 200);
  console.log(
    `PASS: ${checks} isolated HTTP/SQL checks, owner roles, revocation, privacy, social, game actions, native 2FA.`,
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
