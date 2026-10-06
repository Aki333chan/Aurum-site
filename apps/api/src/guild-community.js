import { bridgeRequest } from './minecraft-link.js';
import { minecraftServerId, invalidateMinecraftReads } from './minecraft-data.js';
import { SiteError, siteUser, writeLimit } from './site-access.js';

export async function initGuildCommunity(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS site_guild (
    server_id uuid, guild_id bigint CHECK(guild_id>0), description text NOT NULL DEFAULT '',
    roster varchar(10) NOT NULL DEFAULT 'PUBLIC' CHECK(roster IN ('PUBLIC','MEMBERS')),
    feed varchar(10) NOT NULL DEFAULT 'PUBLIC' CHECK(feed IN ('PUBLIC','MEMBERS')),
    writers jsonb NOT NULL DEFAULT '["leader"]', avatar bytea, banner bytea,
    avatar_updated_at timestamptz, banner_updated_at timestamptz,
    PRIMARY KEY(server_id,guild_id)
  );
  CREATE TABLE IF NOT EXISTS site_guild_application (
    id bigserial PRIMARY KEY, user_id text REFERENCES "user"(id) ON DELETE CASCADE,
    server_id uuid NOT NULL, guild_id bigint NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','invited','declined')),
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,server_id,guild_id)
  );
  CREATE TABLE IF NOT EXISTS site_game_action (
    id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    operation jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now()
  )`);
}

export function guildIdentity(server, guild) {
  const serverId = minecraftServerId(server),
    guildId = Number(guild);
  if (!Number.isSafeInteger(guildId) || guildId < 1) throw new SiteError(400, 'Гильдия не выбрана.');
  return { serverId, guildId };
}

async function player(db, userId, serverId) {
  return (
    await db.query(
      'SELECT player_uuid AS uuid FROM site_minecraft_profile WHERE user_id=$1 AND server_id=$2',
      [userId, serverId],
    )
  ).rows[0]?.uuid;
}

export async function guildState(db, config, actor, server, guild) {
  const identity = guildIdentity(server, guild);
  const uuid = await player(db, actor, identity.serverId);
  const data = await bridgeRequest(config, 'guild', { ...identity, ...(uuid ? { playerUuid: uuid } : {}) });
  if (data.guild?.id !== identity.guildId || !Array.isArray(data.guild.members))
    throw new SiteError(503, 'Гильдия недоступна.');
  const settings = (
    await db.query(
      `SELECT description,roster,feed,writers,avatar_updated_at AS "avatarUpdatedAt",banner_updated_at AS "bannerUpdatedAt"
    FROM site_guild WHERE server_id=$1 AND guild_id=$2`,
      [identity.serverId, identity.guildId],
    )
  ).rows[0] || {
    description: '',
    roster: 'PUBLIC',
    feed: 'PUBLIC',
    writers: ['leader'],
    avatarUpdatedAt: null,
    bannerUpdatedAt: null,
  };
  const membership = data.membership?.guildId === identity.guildId ? data.membership : null;
  return {
    ...identity,
    uuid,
    data,
    settings,
    membership,
    member: !!membership,
    leader: membership?.rank === 'leader',
    manager: ['leader', 'officer'].includes(membership?.rank),
  };
}

export async function guildPage(db, config, actor, server, guild) {
  const state = await guildState(db, config, actor, server, guild);
  const visible = state.settings.roster === 'PUBLIC' || state.member;
  const currentApplication =
    (
      await db.query(
        'SELECT status FROM site_guild_application WHERE user_id=$1 AND server_id=$2 AND guild_id=$3',
        [actor, state.serverId, state.guildId],
      )
    ).rows[0]?.status || null;
  const members = visible
    ? state.data.guild.members.slice(0, 500).map(({ name, rank, joinedAt }) => ({ name, rank, joinedAt }))
    : [];
  // Resolve site usernames in one bounded query. Never expose members' UUIDs.
  if (visible && members.length) {
    const linked = (
      await db.query(
        `SELECT p.player_uuid AS uuid,u.username FROM site_minecraft_profile p JOIN "user" u ON u.id=p.user_id
      WHERE p.server_id=$1 AND p.player_uuid=ANY($2::uuid[])`,
        [state.serverId, state.data.guild.members.slice(0, 500).map((member) => member.uuid)],
      )
    ).rows;
    const usernames = new Map(linked.map((item) => [item.uuid, item.username]));
    for (let index = 0; index < members.length; index++)
      members[index].siteUsername = usernames.get(state.data.guild.members[index].uuid) || null;
  }
  const applications = state.manager
    ? (
        await db.query(
          `SELECT a.id,u.username,p.player_name AS "playerName",a.created_at AS "createdAt"
    FROM site_guild_application a JOIN "user" u ON u.id=a.user_id JOIN site_minecraft_profile p ON p.user_id=a.user_id AND p.server_id=a.server_id
    WHERE a.server_id=$1 AND a.guild_id=$2 AND a.status='pending' ORDER BY a.id LIMIT 25`,
          [state.serverId, state.guildId],
        )
      ).rows
    : [];
  return {
    serverId: state.serverId,
    guildId: state.guildId,
    name: state.data.guild.name,
    tag: state.data.guild.tag,
    leaderName: state.data.guild.leaderName,
    memberCount: state.data.guild.memberCount,
    createdAt: visible ? state.data.guild.createdAt : null,
    bankBalance: state.member ? state.data.guild.bankBalance : null,
    settings: state.settings,
    members,
    rosterVisible: visible,
    feedVisible: state.settings.feed === 'PUBLIC' || state.member,
    member: state.member,
    rank: state.membership?.rank || null,
    linked: !!state.uuid,
    invited: state.data.invited === true,
    actionsAvailable: state.data.actionsAvailable === true,
    currentApplication,
    applications,
  };
}

export async function saveGuildSettings(db, config, actor, server, guild, body) {
  const state = await guildState(db, config, actor, server, guild);
  if (!state.leader) throw new SiteError(403, 'Настройки меняет лидер гильдии.');
  if (
    !body ||
    Object.keys(body).some((key) => !['description', 'roster', 'feed', 'writers'].includes(key)) ||
    typeof body.description !== 'string' ||
    body.description.length > 600 ||
    /[\p{Cf}\x00-\x09\x0B-\x1F\x7F]/u.test(body.description) ||
    !['PUBLIC', 'MEMBERS'].includes(body.roster) ||
    !['PUBLIC', 'MEMBERS'].includes(body.feed) ||
    !Array.isArray(body.writers) ||
    body.writers.length > 3 ||
    body.writers.some((rank) => !['leader', 'officer', 'member'].includes(rank))
  )
    throw new SiteError(400, 'Проверь настройки гильдии.');
  const writers = [...new Set(['leader', ...body.writers])];
  await writeLimit(db, actor, 'guild-settings');
  await db.query(
    `INSERT INTO site_guild(server_id,guild_id,description,roster,feed,writers) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(server_id,guild_id) DO UPDATE SET description=EXCLUDED.description,roster=EXCLUDED.roster,feed=EXCLUDED.feed,writers=EXCLUDED.writers`,
    [state.serverId, state.guildId, body.description.trim(), body.roster, body.feed, JSON.stringify(writers)],
  );
  await db.query('INSERT INTO site_audit(actor_id,action,target) VALUES($1,$2,$3)', [
    actor,
    'guild.settings',
    `${state.serverId}:${state.guildId}`,
  ]);
  return { saved: true };
}

export async function guildAction(db, config, actor, server, guild, body) {
  const state = await guildState(db, config, actor, server, guild);
  if (!state.uuid) throw new SiteError(403, 'Сначала привяжи Minecraft-профиль.');
  if (
    !body ||
    Object.keys(body).some((key) => !['action', 'target', 'requestId'].includes(key)) ||
    !['apply', 'decline', 'invite', 'join', 'kick', 'promote', 'demote'].includes(body.action)
  )
    throw new SiteError(400, 'Действие недоступно.');
  await writeLimit(db, actor, 'guild-actions', 10);
  if (body.action === 'apply') {
    if (state.member) throw new SiteError(409, 'Ты уже в этой гильдии.');
    await db.query(
      `INSERT INTO site_guild_application(user_id,server_id,guild_id) VALUES($1,$2,$3)
      ON CONFLICT(user_id,server_id,guild_id) DO UPDATE SET status='pending',created_at=now() WHERE site_guild_application.status='declined'`,
      [actor, state.serverId, state.guildId],
    );
    return { ok: true, message: 'Заявка отправлена.' };
  }
  if (body.action === 'decline') {
    if (!state.manager) throw new SiteError(403, 'Недостаточно прав в гильдии.');
    const target = await siteUser(db, body.target);
    await db.query(
      'UPDATE site_guild_application SET status=$1 WHERE user_id=$2 AND server_id=$3 AND guild_id=$4',
      ['declined', target.id, state.serverId, state.guildId],
    );
    return { ok: true, message: 'Заявка отклонена.' };
  }
  if (!state.data.actionsAvailable) throw new SiteError(503, 'Нужно обновить Companion и Guilds на сервере.');
  if (body.action !== 'join' && !state.manager) throw new SiteError(403, 'Недостаточно прав в гильдии.');
  if (['promote', 'demote'].includes(body.action) && !state.leader)
    throw new SiteError(403, 'Ранги меняет лидер.');
  if (
    typeof body.requestId !== 'string' ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.requestId)
  )
    throw new SiteError(400, 'Проверь запрос.');
  let targetUuid;
  if (body.action === 'invite') {
    const target = await siteUser(db, body.target);
    targetUuid = await player(db, target.id, state.serverId);
    if (!targetUuid) throw new SiteError(409, 'У игрока нет привязки к этому серверу.');
  } else if (body.action !== 'join') {
    if (typeof body.target !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(body.target))
      throw new SiteError(400, 'Выбери участника.');
    targetUuid = state.data.guild.members.find(
      (member) => member.name.toLowerCase() === body.target.toLowerCase(),
    )?.uuid;
    if (!targetUuid) throw new SiteError(404, 'Участник не найден.');
  }
  const operation = {
    serverId: state.serverId,
    guildId: state.guildId,
    action: body.action,
    playerUuid: state.uuid,
    ...(targetUuid ? { targetUuid } : {}),
  };
  const reserved = await db.query(
    'INSERT INTO site_game_action(id,user_id,operation) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
    [body.requestId, actor, operation],
  );
  if (!reserved.rowCount) {
    const existing = (
      await db.query('SELECT user_id,operation,result FROM site_game_action WHERE id=$1', [body.requestId])
    ).rows[0];
    // JSONB order is not stable; compare field values, not its serialization.
    if (
      existing?.user_id !== actor ||
      Object.keys(operation).some((key) => existing.operation[key] !== operation[key]) ||
      Object.keys(existing.operation).length !== Object.keys(operation).length
    )
      throw new SiteError(409, 'Этот запрос уже использован для другого действия.');
    if (existing.result) return existing.result;
    throw new SiteError(409, 'Результат ещё неизвестен. Обнови состав; не повторяй действие автоматически.');
  }
  // Deliberately no blind retries: a timeout may follow a successful game write.
  const result = await bridgeRequest(config, 'guild-action', operation);
  if (typeof result.ok !== 'boolean') throw new SiteError(503, 'Ответ игры недоступен. Обнови состав.');
  await db.query('UPDATE site_game_action SET result=$2 WHERE id=$1', [body.requestId, result]);
  if (result.ok && body.action === 'invite') {
    const target = await siteUser(db, body.target);
    await db.query(
      'UPDATE site_guild_application SET status=$1 WHERE user_id=$2 AND server_id=$3 AND guild_id=$4',
      ['invited', target.id, state.serverId, state.guildId],
    );
  }
  if (result.ok && body.action === 'join')
    await db.query('DELETE FROM site_guild_application WHERE user_id=$1 AND server_id=$2', [
      actor,
      state.serverId,
    ]);
  await db.query('INSERT INTO site_audit(actor_id,action,target,details) VALUES($1,$2,$3,$4)', [
    actor,
    `guild.${body.action}`,
    `${state.serverId}:${state.guildId}`,
    { ok: result.ok, requestId: body.requestId },
  ]);
  invalidateMinecraftReads();
  return result;
}

export async function guildCandidates(db, config, actor, server, guild, query = '') {
  const state = await guildState(db, config, actor, server, guild);
  if (!state.manager) throw new SiteError(403, 'Недостаточно прав в гильдии.');
  if (typeof query !== 'string' || !/^[A-Za-z0-9_]{0,20}$/.test(query))
    throw new SiteError(400, 'Проверь ник.');
  return {
    users: (
      await db.query(
        `SELECT u.username,p.player_name AS "playerName" FROM site_minecraft_profile p JOIN "user" u ON u.id=p.user_id
    WHERE p.server_id=$1 AND p.user_id<>$2 AND (strpos(lower(u.username),lower($3))>0 OR strpos(lower(p.player_name),lower($3))>0)
    ORDER BY u.username LIMIT 25`,
        [state.serverId, actor, query],
      )
    ).rows,
  };
}
