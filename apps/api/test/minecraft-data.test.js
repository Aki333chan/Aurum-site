import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minecraftGuildDirectory, minecraftProfileData, minecraftServerId } from '../src/minecraft-data.js';
import { bridgeRequest } from '../src/minecraft-link.js';

const serverId = '168cf9cf-dd90-4a6e-bd9b-3e51a50653f1';
const playerUuid = 'ab2e2d9e-5de7-3324-8f6d-e37930114d88';
const config = { bridgeUrl: 'http://10.0.0.1:3001', bridgeToken: 'synthetic-token-for-read-tests' };

test('owner UUID comes from session link; absent link never reaches the game', async () => {
  let calls = 0;
  await assert.rejects(minecraftProfileData({ query: async (sql, args) => {
    assert.ok(sql.includes('WHERE user_id=$1 AND server_id=$2'));
    assert.deepEqual(args, ['visitor', serverId]); return { rows: [] };
  } }, config, 'visitor', serverId, async () => { calls++; }), error => error.status === 404);
  assert.equal(calls, 0);
  assert.throws(() => minecraftServerId('../admin'), error => error.status === 400);
});

test('owner projection strips secrets and caches concurrent requests, zero is distinct from unavailable', async () => {
  let calls = 0;
  const db = { query: async () => ({ rows: [{ playerUuid }] }) };
  const fetchImpl = async (url, init) => {
    calls++; assert.ok(url.endsWith('/profile'));
    assert.deepEqual(JSON.parse(init.body), { serverId, playerUuid });
    return new Response(JSON.stringify({ ip: 'private', inventory: [],
      player: { online: false, playTimeTicks: 72000, deaths: 0, playerKills: -1, x: 500 },
      balance: { amount: 0, formatted: '0 coins', currency: 'coins', ledger: 'secret' },
      guild: { available: true, membership: { guildId: 1, guildName: 'Guild', guildTag: 'TAG', rank: 'leader', bankBalance: 999 } } }));
  };
  const [one, two] = await Promise.all([minecraftProfileData(db, config, 'owner', serverId, fetchImpl), minecraftProfileData(db, config, 'owner', serverId, fetchImpl)]);
  assert.equal(calls, 1); assert.deepEqual(one, two);
  assert.equal(one.balance.amount, 0); assert.equal(one.player.deaths, 0); assert.equal(one.player.playerKills, null);
  assert.equal(one.ip, undefined); assert.equal(one.player.x, undefined); assert.equal(one.guild.membership.bankBalance, undefined);
  // The ownership check is performed even when the snapshot is cached.
  await assert.rejects(minecraftProfileData({ query: async () => ({ rows: [] }) }, config, 'other', serverId, fetchImpl), error => error.status === 404);
});

test('guild directory has only public summary fields and bounded search/result size', async () => {
  const result = await minecraftGuildDirectory(config, serverId, ' test ', async (url, init) => {
    assert.ok(url.endsWith('/guilds')); assert.equal(JSON.parse(init.body).query, 'test');
    return new Response(JSON.stringify({ available: true, guilds: Array.from({ length: 70 }, (_, i) => ({
      id: i + 1, name: 'Guild', tag: 'TAG', leaderName: 'Steve', memberCount: 3, bankBalance: 100, leaderUuid: playerUuid, members: ['secret'],
    })) }));
  });
  assert.equal(result.guilds.length, 50);
  assert.deepEqual(Object.keys(result.guilds[0]), ['id', 'name', 'tag', 'leaderName', 'memberCount']);
  await assert.rejects(minecraftGuildDirectory(config, serverId, 'x'.repeat(81)), error => error.status === 400);
});

test('unavailable reads do not become invalid link-code errors; arbitrary bridge paths are forbidden', async () => {
  await assert.rejects(bridgeRequest(config, 'profile', { serverId, playerUuid }, async () => new Response('', { status: 404 })), error => error.status === 503);
  await assert.rejects(bridgeRequest(config, '../../staff/commands', {}), error => error.status === 400);
});
