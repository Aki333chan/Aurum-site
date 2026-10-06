import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeRequest, linkMinecraftProfile, minecraftProfiles, normalizeLinkInput } from '../src/minecraft-link.js';

const serverId = '168cf9cf-dd90-4a6e-bd9b-3e51a50653f1';
const playerUuid = 'ab2e2d9e-5de7-3324-8f6d-e37930114d88';
const config = { bridgeUrl: 'http://10.0.0.1:3001', bridgeToken: 'synthetic-private-bridge-token-for-tests' };
const identity = { serverId, serverName: 'Minecraft', playerUuid, playerName: 'Steve' };

test('link input normalizes hand-entered codes, rejects supplied identities and URLs', () => {
  assert.deepEqual(normalizeLinkInput({ serverId, code: 'abcd-2345' }), { serverId, code: 'ABCD2345' });
  for (const body of [null, { serverId, code: 'ABCD2345', playerUuid }, { serverId: 'http://evil', code: 'ABCD2345' }, { serverId, code: '1234' }, { serverId, code: 'OOII0000' }]) assert.throws(() => normalizeLinkInput(body));
});

test('bridge uses a fixed private path, no redirects, and never includes code in URL', async () => {
  const result = await bridgeRequest(config, 'consume', { serverId, code: 'ABCD2345' }, async (url, init) => {
    assert.equal(url, 'http://10.0.0.1:3001/api/internal/site/minecraft/consume');
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).code, 'ABCD2345');
    return new Response(JSON.stringify(identity));
  });
  assert.deepEqual(result, identity);
  await assert.rejects(bridgeRequest({}, 'consume', {}), error => error.status === 503);
  await assert.rejects(bridgeRequest(config, 'consume', {}, async () => new Response('', { status: 404 })), error => error.status === 400);
  await assert.rejects(bridgeRequest(config, 'servers', null, async () => new Response('', { status: 403 })), error => error.status === 503);
});

test('existing links and per-user attempt cap prevent remote consumption', async () => {
  let calls = 0;
  const bridge = async () => { calls++; return new Response(JSON.stringify(identity)); };
  const limited = { query: async () => ({ rowCount: 0, rows: [] }) };
  await assert.rejects(linkMinecraftProfile(limited, config, 'owner', { serverId, code: 'ABCD2345' }, bridge), error => error.status === 429);
  const linked = { query: async sql => sql.includes('INSERT') ? { rowCount: 1, rows: [] } : { rows: [{ serverId }] } };
  await assert.rejects(linkMinecraftProfile(linked, config, 'owner', { serverId, code: 'ABCD2345' }, bridge), error => error.status === 409);
  assert.equal(calls, 0);
});

test('trusted identity is stored for session owner only, and unique conflict never steals it', async () => {
  const stored = [];
  const db = { query: async (sql, args) => {
    if (sql.includes('INSERT INTO site_link_attempt')) return { rowCount: 1 };
    if (sql.includes('SELECT')) return { rows: [] };
    stored.push(args);
    return { rows: [identity] };
  } };
  const bridge = async () => new Response(JSON.stringify(identity));
  assert.deepEqual(await linkMinecraftProfile(db, config, 'session-owner', { serverId, code: 'ABCD2345' }, bridge), identity);
  assert.deepEqual(stored, [['session-owner', serverId, 'Minecraft', playerUuid, 'Steve']]);
  const conflict = { query: async (sql, args) => {
    if (sql.includes('INSERT INTO site_minecraft_profile')) throw Object.assign(new Error('duplicate'), { code: '23505' });
    return db.query(sql, args);
  } };
  await assert.rejects(linkMinecraftProfile(conflict, config, 'other', { serverId, code: 'ABCD2345' }, bridge), error => error.status === 409);
});

test('wrong server identity is not stored and visitor projection omits player UUID', async () => {
  const db = { query: async (sql) => {
    assert.ok(!sql.includes('INSERT INTO site_minecraft_profile'));
    return { rowCount: 1, rows: [] };
  } };
  await assert.rejects(linkMinecraftProfile(db, config, 'owner', { serverId, code: 'ABCD2345' }, async () => new Response(JSON.stringify({ ...identity, serverId: playerUuid }))), error => error.status === 503);
  await minecraftProfiles({ query: async (sql, args) => {
    assert.ok(!sql.includes('player_uuid'));
    assert.deepEqual(args, ['owner']);
    return { rows: [] };
  } }, 'owner', false);
});
