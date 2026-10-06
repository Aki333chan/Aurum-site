import { SiteError, canSee, privacy, relationship, siteUser, writeLimit } from './site-access.js';
import { guildState } from './guild-community.js';
import { minecraftServerId } from './minecraft-data.js';
import { bridgeRequest } from './minecraft-link.js';

export async function initSocialData(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS site_content (
    id bigserial PRIMARY KEY, scope varchar(120) NOT NULL,
    kind varchar(10) NOT NULL CHECK(kind IN ('posts','comments')),
    parent_id bigint REFERENCES site_content(id) ON DELETE CASCADE,
    author_id text REFERENCES "user"(id) ON DELETE SET NULL,
    body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS site_content_page ON site_content(scope,kind,id DESC);
  CREATE INDEX IF NOT EXISTS site_content_replies ON site_content(parent_id,id);
  CREATE TABLE IF NOT EXISTS site_message (
    id bigserial PRIMARY KEY, sender_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    recipient_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now(),
    CHECK(sender_id<>recipient_id)
  );
  CREATE INDEX IF NOT EXISTS site_message_inbox ON site_message(recipient_id,sender_id,id DESC);
  CREATE INDEX IF NOT EXISTS site_message_sent ON site_message(sender_id,recipient_id,id DESC);
  CREATE TABLE IF NOT EXISTS site_report (
    id bigserial PRIMARY KEY, content_id bigint REFERENCES site_content(id) ON DELETE SET NULL,
    reporter_id text REFERENCES "user"(id) ON DELETE SET NULL,
    reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
    status varchar(10) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(content_id,reporter_id)
  );
  CREATE INDEX IF NOT EXISTS site_report_queue ON site_report(status,id DESC)`);
}

export function plainText(value, maximum = 3000) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\p{Cf}\x00-\x09\x0B-\x1F\x7F]/u.test(value)
  )
    throw new SiteError(400, `Текст: от 1 до ${maximum} символов.`);
  return value.trim();
}

export function pageCursor(value) {
  if (value === null || value === undefined || value === '') return '9223372036854775807';
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new SiteError(400, 'Некорректная страница.');
  return value;
}

export async function profileAccess(db, actor, username, scope = 'global') {
  const target = await siteUser(db, username),
    relation = await relationship(db, actor, target.id);
  const settings = await privacy(db, target.id, scope);
  if (!canSee(settings.profile, relation)) throw new SiteError(403, 'Профиль закрыт.');
  return { target, relation, settings };
}

export async function savePrivacy(db, actor, scope, body) {
  if (scope !== 'global') {
    const server = minecraftServerId(
      typeof scope === 'string' && scope.startsWith('minecraft:') ? scope.slice(10) : '',
    );
    if (
      !(
        await db.query('SELECT 1 FROM site_minecraft_profile WHERE user_id=$1 AND server_id=$2', [
          actor,
          server,
        ])
      ).rowCount
    )
      throw new SiteError(403, 'Сначала привяжи этот игровой профиль.');
  }
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).length !== 4 ||
    Object.keys(body).some((key) => !['profile', 'comments', 'messages', 'statistics'].includes(key)) ||
    !['ALL', 'FRIENDS', 'PRIVATE'].includes(body.profile) ||
    !['ALL', 'FRIENDS', 'OFF'].includes(body.comments) ||
    !['ALL', 'FRIENDS', 'OFF'].includes(body.messages) ||
    !['ALL', 'FRIENDS', 'PRIVATE'].includes(body.statistics)
  )
    throw new SiteError(400, 'Проверь настройки приватности.');
  await writeLimit(db, actor, 'privacy');
  await db.query(
    `INSERT INTO site_privacy(user_id,scope,profile,comments,messages,statistics) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,scope) DO UPDATE SET profile=EXCLUDED.profile,comments=EXCLUDED.comments,messages=EXCLUDED.messages,statistics=EXCLUDED.statistics`,
    [actor, scope, body.profile, body.comments, body.messages, body.statistics],
  );
  return body;
}

export async function searchPeople(db, actor, query = '') {
  if (typeof query !== 'string' || !/^[A-Za-z0-9_]{0,20}$/.test(query))
    throw new SiteError(400, 'Проверь ник.');
  return {
    users: (
      await db.query(
        `SELECT u.username FROM "user" u WHERE u.id<>$1 AND u."emailVerified"=true
    AND strpos(lower(u.username),lower($2))>0 AND NOT EXISTS(SELECT 1 FROM site_block b
      WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
    ORDER BY u.username LIMIT 25`,
        [actor, query],
      )
    ).rows,
  };
}

export async function friends(db, actor) {
  const rows = (
    await db.query(
      `SELECT u.username,f.accepted,f.requester_id=$1 AS outgoing
    FROM site_friendship f JOIN "user" u ON u.id=CASE WHEN f.first_id=$1 THEN f.second_id ELSE f.first_id END
    WHERE f.first_id=$1 OR f.second_id=$1 ORDER BY f.accepted DESC,f.created_at DESC LIMIT 101`,
      [actor],
    )
  ).rows;
  const blocked = (
    await db.query(
      'SELECT u.username FROM site_block b JOIN "user" u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY u.username LIMIT 100',
      [actor],
    )
  ).rows;
  return {
    friends: rows
      .slice(0, 100)
      .filter((row) => row.accepted)
      .map(({ username }) => ({ username })),
    incoming: rows
      .slice(0, 100)
      .filter((row) => !row.accepted && !row.outgoing)
      .map(({ username }) => ({ username })),
    outgoing: rows
      .slice(0, 100)
      .filter((row) => !row.accepted && row.outgoing)
      .map(({ username }) => ({ username })),
    blocked,
    more: rows.length > 100,
  };
}

export async function friendAction(db, actor, body) {
  if (
    !body ||
    Object.keys(body).some((key) => !['action', 'username'].includes(key)) ||
    !['request', 'accept', 'remove', 'block', 'unblock'].includes(body.action)
  )
    throw new SiteError(400, 'Действие недоступно.');
  const target = await siteUser(db, body.username);
  if (target.id === actor) throw new SiteError(400, 'Выбери другого игрока.');
  await writeLimit(db, actor, 'friends', 15);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Every pair-changing operation uses the same short lock: block and accept cannot race.
    const pairIds = (
      await client.query('SELECT LEAST($1::text,$2::text) AS first,GREATEST($1::text,$2::text) AS second', [
        actor,
        target.id,
      ])
    ).rows[0];
    const pair = [pairIds.first, pairIds.second];
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify([actor, target.id].sort()),
    ]);
    if (body.action === 'block') {
      await client.query(
        'INSERT INTO site_block(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [actor, target.id],
      );
      await client.query('DELETE FROM site_friendship WHERE first_id=$1 AND second_id=$2', pair);
    } else if (body.action === 'unblock')
      await client.query('DELETE FROM site_block WHERE blocker_id=$1 AND blocked_id=$2', [actor, target.id]);
    else if (body.action === 'remove')
      await client.query('DELETE FROM site_friendship WHERE first_id=$1 AND second_id=$2', pair);
    else {
      if ((await relationship(client, actor, target.id)).blocked)
        throw new SiteError(403, 'Взаимодействие недоступно.');
      if (body.action === 'request')
        await client.query(
          'INSERT INTO site_friendship(first_id,second_id,requester_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [...pair, actor],
        );
      else if (
        !(
          await client.query(
            'UPDATE site_friendship SET accepted=true WHERE first_id=$1 AND second_id=$2 AND requester_id=$3 AND NOT accepted',
            [...pair, target.id],
          )
        ).rowCount
      )
        throw new SiteError(409, 'Заявка больше не актуальна.');
    }
    await client.query('COMMIT');
    return { saved: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function messageInbox(db, actor) {
  return {
    conversations: (
      await db.query(
        `SELECT username,body,"createdAt" FROM (SELECT DISTINCT ON (u.username) u.username,m.body,m.created_at AS "createdAt",m.id
    FROM site_message m JOIN "user" u ON u.id=CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END
    WHERE (m.sender_id=$1 OR m.recipient_id=$1) AND NOT EXISTS(SELECT 1 FROM site_block b WHERE
      (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
    ORDER BY u.username,m.id DESC) latest ORDER BY id DESC LIMIT 25`,
        [actor],
      )
    ).rows,
  };
}

export async function messages(db, actor, username, before) {
  const target = await siteUser(db, username),
    relation = await relationship(db, actor, target.id);
  if (relation.own || relation.blocked) throw new SiteError(403, 'Переписка недоступна.');
  const settings = await privacy(db, target.id);
  const rows = (
    await db.query(
      `SELECT id::text,body,sender_id=$1 AS own,created_at AS "createdAt" FROM site_message
    WHERE ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)) AND id<$3
    ORDER BY id DESC LIMIT 26`,
      [actor, target.id, pageCursor(before)],
    )
  ).rows;
  return {
    username: target.username,
    canWrite: canSee(settings.messages, relation),
    messages: rows.slice(0, 25).reverse(),
    more: rows.length > 25,
    next: rows.length > 25 ? String(rows[24].id) : null,
  };
}

export async function sendMessage(db, actor, body) {
  if (!body || Object.keys(body).some((key) => !['username', 'text'].includes(key)))
    throw new SiteError(400, 'Проверь сообщение.');
  const text = plainText(body.text, 2000),
    target = await siteUser(db, body.username);
  await writeLimit(db, actor, 'messages', 30);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify([actor, target.id].sort()),
    ]);
    const relation = await relationship(client, actor, target.id),
      settings = await privacy(client, target.id);
    if (relation.own || !canSee(settings.messages, relation))
      throw new SiteError(403, 'Игрок не принимает сообщения.');
    await client.query('INSERT INTO site_message(sender_id,recipient_id,body) VALUES($1,$2,$3)', [
      actor,
      target.id,
      text,
    ]);
    await client.query('COMMIT');
    return { sent: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function contentScope(db, config, actor, scope, kind, admin) {
  if (!['posts', 'comments'].includes(kind) || typeof scope !== 'string' || scope.length > 120)
    throw new SiteError(400, 'Раздел не найден.');
  if (scope === 'community') return { scope, canWrite: kind === 'comments' || admin, canManage: admin };
  if (scope.startsWith('game-profile:')) {
    const [server, name, ...extra] = scope.slice(13).split(':');
    if (extra.length) throw new SiteError(400, 'Раздел не найден.');
    const id = minecraftServerId(server);
    await profileAccess(db, actor, name);
    const access = await profileAccess(db, actor, name, `minecraft:${id}`);
    if (
      !(
        await db.query('SELECT 1 FROM site_minecraft_profile WHERE user_id=$1 AND server_id=$2', [
          access.target.id,
          id,
        ])
      ).rowCount
    )
      throw new SiteError(404, 'Профиль не найден.');
    return {
      scope: `game-profile:${id}:${access.target.username.toLowerCase()}`,
      canWrite: kind === 'posts' ? access.relation.own : canSee(access.settings.comments, access.relation),
      canManage: access.relation.own || admin,
    };
  }
  if (scope.startsWith('profile:')) {
    const access = await profileAccess(db, actor, scope.slice(8));
    return {
      scope: `profile:${access.target.username.toLowerCase()}`,
      canWrite: kind === 'posts' ? access.relation.own : canSee(access.settings.comments, access.relation),
      canManage: access.relation.own || admin,
    };
  }
  if (scope.startsWith('guild:')) {
    const [server, guild, ...extra] = scope.slice(6).split(':');
    if (extra.length) throw new SiteError(400, 'Раздел не найден.');
    const state = await guildState(db, config, actor, server, guild);
    if (state.settings.feed !== 'PUBLIC' && !state.member)
      throw new SiteError(403, 'Лента только для участников.');
    return {
      scope: `guild:${state.serverId}:${state.guildId}`,
      canWrite:
        state.member && (kind === 'comments' || state.settings.writers.includes(state.membership.rank)),
      canManage: state.leader || admin,
    };
  }
  if (scope.startsWith('game:')) {
    const server = minecraftServerId(scope.slice(5)),
      data = await bridgeRequest(config, 'servers');
    if (!Array.isArray(data.servers) || !data.servers.some((item) => item.id === server))
      throw new SiteError(404, 'Сервер не найден.');
    return { scope: `game:${server}`, canWrite: kind === 'comments' || admin, canManage: admin };
  }
  throw new SiteError(400, 'Раздел не найден.');
}

export async function feed(db, config, actor, scope, kind, before, parent, admin) {
  const access = await contentScope(db, config, actor, scope, kind, admin);
  const parentId = parent ? pageCursor(parent) : null;
  if (parentId) {
    if (
      kind !== 'comments' ||
      !(
        await db.query("SELECT 1 FROM site_content WHERE id=$1 AND scope=$2 AND kind='posts'", [
          parentId,
          access.scope,
        ])
      ).rowCount
    )
      throw new SiteError(404, 'Запись не найдена.');
  }
  const rows = (
    await db.query(
      `SELECT c.id::text,c.body,c.created_at AS "createdAt",u.username,c.author_id=$1 AS own,
    (SELECT count(*)::integer FROM site_content r WHERE r.parent_id=c.id) AS replies
    FROM site_content c LEFT JOIN "user" u ON u.id=c.author_id
    WHERE c.scope=$2 AND c.kind=$3 AND c.id<$4 AND c.parent_id IS NOT DISTINCT FROM $5::bigint
    AND NOT EXISTS(SELECT 1 FROM site_block b WHERE (b.blocker_id=$1 AND b.blocked_id=c.author_id) OR (b.blocker_id=c.author_id AND b.blocked_id=$1))
    ORDER BY c.id DESC LIMIT 26`,
      [actor, access.scope, kind, pageCursor(before), parentId],
    )
  ).rows;
  return {
    canWrite: access.canWrite,
    canManage: access.canManage,
    items: rows.slice(0, 25),
    more: rows.length > 25,
    next: rows.length > 25 ? rows[24].id : null,
  };
}

export async function publish(db, config, actor, body, admin) {
  if (!body || Object.keys(body).some((key) => !['scope', 'kind', 'text', 'parent'].includes(key)))
    throw new SiteError(400, 'Проверь запись.');
  const access = await contentScope(db, config, actor, body.scope, body.kind, admin);
  if (!access.canWrite) throw new SiteError(403, 'Публикация в этом разделе закрыта.');
  const text = plainText(body.text, body.kind === 'comments' ? 1000 : 3000);
  await writeLimit(db, actor, 'publications', 10);
  const parent = body.parent ? pageCursor(body.parent) : null;
  if (
    parent &&
    (body.kind !== 'comments' ||
      !(
        await db.query("SELECT 1 FROM site_content WHERE id=$1 AND scope=$2 AND kind='posts'", [
          parent,
          access.scope,
        ])
      ).rowCount)
  )
    throw new SiteError(404, 'Запись не найдена.');
  const result = await db.query(
    'INSERT INTO site_content(scope,kind,author_id,body,parent_id) VALUES($1,$2,$3,$4,$5) RETURNING id::text',
    [access.scope, body.kind, actor, text, parent],
  );
  return { id: result.rows[0].id };
}

export async function removeContent(db, config, actor, id, admin) {
  const content = (
    await db.query('SELECT scope,kind,author_id FROM site_content WHERE id=$1', [pageCursor(id)])
  ).rows[0];
  if (!content) throw new SiteError(404, 'Запись не найдена.');
  const access = admin
    ? { canManage: true }
    : await contentScope(db, config, actor, content.scope, content.kind, admin);
  if (content.author_id !== actor && !access.canManage) throw new SiteError(403, 'Удаление недоступно.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO site_audit(actor_id,action,target,details) VALUES($1,$2,$3,$4)', [
      actor,
      'content.delete',
      id,
      { scope: content.scope },
    ]);
    await client.query('DELETE FROM site_content WHERE id=$1', [id]);
    await client.query('COMMIT');
    return { deleted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reportContent(db, config, actor, body, admin) {
  if (!body || Object.keys(body).some((key) => !['id', 'reason'].includes(key)))
    throw new SiteError(400, 'Проверь жалобу.');
  const id = pageCursor(body.id),
    reason = plainText(body.reason, 500);
  const content = (await db.query('SELECT scope,kind FROM site_content WHERE id=$1', [id])).rows[0];
  if (!content) throw new SiteError(404, 'Запись не найдена.');
  await contentScope(db, config, actor, content.scope, content.kind, admin);
  await writeLimit(db, actor, 'reports', 5);
  await db.query(
    'INSERT INTO site_report(content_id,reporter_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [id, actor, reason],
  );
  return { sent: true };
}

export async function reports(db, admin) {
  if (!admin) throw new SiteError(403, 'Нужна роль администратора.');
  return {
    reports: (
      await db.query(`SELECT r.id::text,r.content_id::text AS "contentId",r.reason,r.created_at AS "createdAt",c.body,c.scope,
    u.username AS reporter,a.username AS author FROM site_report r LEFT JOIN site_content c ON c.id=r.content_id
    LEFT JOIN "user" u ON u.id=r.reporter_id LEFT JOIN "user" a ON a.id=c.author_id WHERE r.status='open' ORDER BY r.id LIMIT 25`)
    ).rows,
  };
}

export async function closeReport(db, actor, id, admin) {
  if (!admin) throw new SiteError(403, 'Нужна роль администратора.');
  await db.query("UPDATE site_report SET status='closed' WHERE id=$1", [pageCursor(id)]);
  await db.query('INSERT INTO site_audit(actor_id,action,target) VALUES($1,$2,$3)', [
    actor,
    'report.close',
    id,
  ]);
  return { closed: true };
}
