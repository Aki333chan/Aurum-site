const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export class LinkError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function normalizeLinkInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['serverId', 'code'].includes(key))
    || typeof body.serverId !== 'string' || !uuidPattern.test(body.serverId)
    || typeof body.code !== 'string' || body.code.length > 24) {
    throw new LinkError(400, 'Выбери сервер и введи код из игры.');
  }
  const code = body.code.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code)) throw new LinkError(400, 'Код должен содержать 8 символов. Получи его через /aurumlink.');
  return { serverId: body.serverId.toLowerCase(), code };
}

export async function bridgeRequest(config, path, body, fetchImpl = fetch) {
  if (!config.bridgeUrl || !config.bridgeToken) throw new LinkError(503, 'Связь с игрой пока не настроена.');
  let response;
  try {
    response = await fetchImpl(`${config.bridgeUrl}/api/internal/site/minecraft/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${config.bridgeToken}`, accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new LinkError(503, 'Сервер не отвечает. Попробуй позже.'); }
  if (body && response.status === 404) throw new LinkError(400, 'Код истёк или уже использован. Получи новый через /aurumlink.');
  if (!response.ok) throw new LinkError(503, 'Связь с игрой временно недоступна.');
  try {
    const text = await response.text();
    if (text.length > 32768) throw new Error('Oversized bridge response');
    return JSON.parse(text);
  } catch { throw new LinkError(503, 'Не удалось получить ответ сервера.'); }
}

export async function minecraftProfiles(db, userId, own = true) {
  const { rows } = await db.query(`SELECT server_id AS "serverId", server_name AS "serverName",
    player_name AS "playerName", ${own ? 'player_uuid AS "playerUuid",' : ''} linked_at AS "linkedAt"
    FROM site_minecraft_profile WHERE user_id=$1 ORDER BY linked_at`, [userId]);
  return rows;
}

export async function linkMinecraftProfile(db, config, userId, body, fetchImpl = fetch) {
  const input = normalizeLinkInput(body);
  const attempts = await db.query(`INSERT INTO site_link_attempt (user_id) VALUES ($1)
    ON CONFLICT (user_id) DO UPDATE SET
      attempts = CASE WHEN site_link_attempt.window_start <= now() - interval '5 minutes' THEN 1 ELSE site_link_attempt.attempts + 1 END,
      window_start = CASE WHEN site_link_attempt.window_start <= now() - interval '5 minutes' THEN now() ELSE site_link_attempt.window_start END
    WHERE site_link_attempt.attempts < 5 OR site_link_attempt.window_start <= now() - interval '5 minutes'
    RETURNING attempts`, [userId]);
  if (!attempts.rowCount) throw new LinkError(429, 'Слишком много попыток. Подожди пять минут.');
  const existing = await minecraftProfiles(db, userId);
  if (existing.some(profile => profile.serverId === input.serverId)) throw new LinkError(409, 'Профиль этого сервера уже привязан.');
  const identity = await bridgeRequest(config, 'consume', input, fetchImpl);
  if (identity.serverId !== input.serverId || typeof identity.playerUuid !== 'string' || !uuidPattern.test(identity.playerUuid)
    || typeof identity.playerName !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(identity.playerName)
    || typeof identity.serverName !== 'string' || !identity.serverName || identity.serverName.length > 120) {
    throw new LinkError(503, 'Сервер вернул некорректный профиль. Получи новый код.');
  }
  try {
    const { rows } = await db.query(`INSERT INTO site_minecraft_profile
      (user_id, server_id, server_name, player_uuid, player_name) VALUES ($1,$2,$3,$4,$5)
      RETURNING server_id AS "serverId", server_name AS "serverName", player_uuid AS "playerUuid",
        player_name AS "playerName", linked_at AS "linkedAt"`,
    [userId, input.serverId, identity.serverName, identity.playerUuid.toLowerCase(), identity.playerName]);
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new LinkError(409, 'Этот игровой профиль уже привязан.');
    // Consumed tokens are never replayed blindly after an unknown result.
    throw new LinkError(503, 'Не удалось сохранить привязку. Обнови страницу; если профиля нет, получи новый код.');
  }
}
