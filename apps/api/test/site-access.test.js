import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSee, changeSiteAdmin, listSiteUsers, initializeOwner, writeLimit } from '../src/site-access.js';
import { plainText, pageCursor, savePrivacy, profileAccess, sendMessage } from '../src/social-data.js';

test('privacy defaults never override blocking; owner and explicit friend modes are distinct', () => {
  const relation = { own: false, blocked: false, friend: false };
  assert.equal(canSee('ALL', relation), true);
  assert.equal(canSee('PRIVATE', relation), false);
  assert.equal(canSee('FRIENDS', relation), false);
  assert.equal(canSee('FRIENDS', { ...relation, friend: true }), true);
  assert.equal(canSee('ALL', { ...relation, blocked: true }), false);
  assert.equal(canSee('OFF', { ...relation, own: true }), true);
});
test('plain text and pagination are bounded; HTML remains text rather than interpreted markup', () => {
  assert.equal(plainText(' <script>alert(1)</script> '), '<script>alert(1)</script>');
  for (const value of ['', null, '\u202Espoof', 'x'.repeat(3001)]) assert.throws(() => plainText(value));
  assert.equal(pageCursor(null), '9223372036854775807');
  assert.equal(pageCursor('25'), '25');
  for (const value of ['0', '-1', 'NaN', '9223372036854775808', '1 OR 1=1'])
    assert.throws(() => pageCursor(value));
});
test('role changes require the pinned owner inside the same transaction; owner cannot be demoted', async () => {
  const queries = [];
  const client = {
    query: async (sql, args) => {
      queries.push({ sql, args });
      if (sql.startsWith('SELECT user_id')) return { rows: [{ user_id: 'owner' }] };
      return { rows: [] };
    },
    release() {},
  };
  const db = { connect: async () => client };
  await assert.rejects(
    changeSiteAdmin(db, 'admin', { userId: 'target', admin: true }),
    (error) => error.status === 403,
  );
  assert.equal(
    queries.some(({ sql }) => sql.startsWith('INSERT')),
    false,
  );
  assert.ok(queries.some(({ sql }) => sql === 'ROLLBACK'));
  await assert.rejects(
    changeSiteAdmin(db, 'owner', { userId: 'owner', admin: false }),
    (error) => error.status === 409,
  );
});
test('unverified users cannot receive administration; role grant and audit commit together', async () => {
  let verified = false;
  const queries = [];
  const client = {
    query: async (sql, args) => {
      queries.push({ sql, args });
      if (sql.startsWith('SELECT user_id')) return { rows: [{ user_id: 'owner' }] };
      if (sql.startsWith('SELECT u.id'))
        return { rows: [{ id: 'target', username: 'Target', verified, admin: false }] };
      return { rows: [] };
    },
    release() {},
  };
  const db = { connect: async () => client };
  await assert.rejects(
    changeSiteAdmin(db, 'owner', { userId: 'target', admin: true }),
    (error) => error.status === 409,
  );
  verified = true;
  queries.length = 0;
  assert.deepEqual(await changeSiteAdmin(db, 'owner', { userId: 'target', admin: true }), { role: 'admin' });
  assert.equal(queries[queries.length - 1].sql, 'COMMIT');
  assert.ok(queries.some(({ sql, args }) => sql.includes('site_audit') && args[1] === 'admin.grant'));
});
test('owner cannot be reassigned by a changed environment and ordinary users cannot list roles', async () => {
  await assert.rejects(
    initializeOwner({ query: async () => ({ rows: [{ user_id: 'owner' }] }) }, 'different'),
  );
  await assert.rejects(
    listSiteUsers({ query: async () => ({ rowCount: 0 }) }, 'player'),
    (error) => error.status === 403,
  );
  await assert.rejects(
    writeLimit({ query: async () => ({ rowCount: 0 }) }, 'player', 'test'),
    (error) => error.status === 429,
  );
});
test('hidden profile is rejected before its content or images are queried', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('SELECT id,username')) return { rows: [{ id: 'target', username: 'Player' }] };
      if (sql.includes('AS blocked'))
        return { rows: [{ blocked: false, friend: false, pending: false, incoming: false }] };
      if (sql.includes('FROM site_privacy')) return { rows: [{ profile: 'PRIVATE' }] };
      throw new Error('Unexpected private data query');
    },
  };
  await assert.rejects(profileAccess(db, 'visitor', 'Player'), (error) => error.status === 403);
});
test('game privacy requires ownership and forged optional fields are rejected', async () => {
  await assert.rejects(
    savePrivacy(
      { query: async () => ({ rowCount: 0 }) },
      'visitor',
      'minecraft:168cf9cf-dd90-4a6e-bd9b-3e51a50653f1',
      {},
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    savePrivacy({}, 'player', 'global', {
      profile: 'ALL',
      comments: 'ALL',
      messages: 'ALL',
      statistics: 'PRIVATE',
      admin: true,
    }),
    (error) => error.status === 400,
  );
});
test('blocked or friends-only DM does not insert a message, even with a forged browser request', async () => {
  const queries = [];
  const client = {
    query: async (sql) => {
      queries.push(sql);
      if (sql.includes('AS blocked')) return { rows: [{ blocked: true, friend: true }] };
      if (sql.includes('FROM site_privacy')) return { rows: [{ messages: 'ALL' }] };
      return { rows: [] };
    },
    release() {},
  };
  const db = {
    query: async (sql) =>
      sql.includes('SELECT id,username')
        ? { rows: [{ id: 'recipient', username: 'Player' }] }
        : { rowCount: 1 },
    connect: async () => client,
  };
  await assert.rejects(
    sendMessage(db, 'sender', { username: 'Player', text: 'hello' }),
    (error) => error.status === 403,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith('INSERT INTO site_message')),
    false,
  );
  assert.equal(queries[queries.length - 1], 'ROLLBACK');
});
