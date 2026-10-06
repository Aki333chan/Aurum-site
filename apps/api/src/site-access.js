export class SiteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function initAccessData(db, ownerId = '') {
  await db.query(`CREATE TABLE IF NOT EXISTS site_owner (
    id integer PRIMARY KEY CHECK (id=1),
    user_id text UNIQUE NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT
  );
  CREATE TABLE IF NOT EXISTS site_audit (
    id bigserial PRIMARY KEY, actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
    action varchar(40) NOT NULL, target varchar(180) NOT NULL, details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS site_write_limit (
    user_id text REFERENCES "user"(id) ON DELETE CASCADE, bucket varchar(40),
    window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1,
    PRIMARY KEY(user_id,bucket)
  );
  CREATE TABLE IF NOT EXISTS site_privacy (
    user_id text REFERENCES "user"(id) ON DELETE CASCADE, scope varchar(80) NOT NULL DEFAULT 'global',
    profile varchar(10) NOT NULL DEFAULT 'ALL' CHECK(profile IN ('ALL','FRIENDS','PRIVATE')),
    comments varchar(10) NOT NULL DEFAULT 'ALL' CHECK(comments IN ('ALL','FRIENDS','OFF')),
    messages varchar(10) NOT NULL DEFAULT 'ALL' CHECK(messages IN ('ALL','FRIENDS','OFF')),
    statistics varchar(10) NOT NULL DEFAULT 'PRIVATE' CHECK(statistics IN ('ALL','FRIENDS','PRIVATE')),
    PRIMARY KEY(user_id,scope)
  );
  CREATE TABLE IF NOT EXISTS site_friendship (
    first_id text REFERENCES "user"(id) ON DELETE CASCADE,
    second_id text REFERENCES "user"(id) ON DELETE CASCADE,
    requester_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accepted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(first_id,second_id), CHECK(first_id < second_id), CHECK(requester_id IN (first_id,second_id))
  );
  CREATE TABLE IF NOT EXISTS site_block (
    blocker_id text REFERENCES "user"(id) ON DELETE CASCADE,
    blocked_id text REFERENCES "user"(id) ON DELETE CASCADE,
    PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id <> blocked_id)
  )`);
  if (ownerId) await initializeOwner(db, ownerId);
}

export async function initializeOwner(db, userId) {
  const existing = await db.query('SELECT user_id FROM site_owner WHERE id=1');
  if (existing.rows[0]) {
    if (existing.rows[0].user_id !== userId)
      throw new Error('Configured owner differs from the existing owner');
    return;
  }
  const result = await db.query(
    `INSERT INTO site_owner(id,user_id)
    SELECT 1,u.id FROM "user" u JOIN site_admin a ON a.user_id=u.id
    WHERE u.id=$1 AND u."emailVerified"=true ON CONFLICT(id) DO NOTHING RETURNING user_id`,
    [userId],
  );
  if (!result.rowCount) throw new Error('Owner must be an existing verified administrator');
}

export async function isSiteOwner(db, userId) {
  return (await db.query('SELECT 1 FROM site_owner WHERE id=1 AND user_id=$1', [userId])).rowCount === 1;
}

export async function writeLimit(db, userId, bucket, maximum = 10) {
  const result = await db.query(
    `INSERT INTO site_write_limit(user_id,bucket) VALUES($1,$2)
    ON CONFLICT(user_id,bucket) DO UPDATE SET
      attempts=CASE WHEN site_write_limit.window_start <= now()-interval '1 minute' THEN 1 ELSE site_write_limit.attempts+1 END,
      window_start=CASE WHEN site_write_limit.window_start <= now()-interval '1 minute' THEN now() ELSE site_write_limit.window_start END
    WHERE site_write_limit.attempts < $3 OR site_write_limit.window_start <= now()-interval '1 minute'
    RETURNING attempts`,
    [userId, bucket, maximum],
  );
  if (!result.rowCount) throw new SiteError(429, 'Слишком часто. Подожди минуту.');
}

export async function listSiteUsers(db, actor, query = '', offset = 0) {
  if (!(await isSiteOwner(db, actor))) throw new SiteError(403, 'Только владелец может управлять ролями.');
  if (
    typeof query !== 'string' ||
    !/^[A-Za-z0-9_]{0,20}$/.test(query) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000
  )
    throw new SiteError(400, 'Проверь поиск.');
  const { rows } = await db.query(
    `SELECT u.id,u.username,u."displayUsername" AS "displayName",u."emailVerified" AS verified,
    CASE WHEN o.user_id IS NOT NULL THEN 'owner' WHEN a.user_id IS NOT NULL THEN 'admin' ELSE 'player' END AS role
    FROM "user" u LEFT JOIN site_admin a ON a.user_id=u.id LEFT JOIN site_owner o ON o.user_id=u.id
    WHERE strpos(lower(u.username),lower($1))>0
    ORDER BY CASE WHEN o.user_id IS NOT NULL THEN 0 WHEN a.user_id IS NOT NULL THEN 1 ELSE 2 END, u.username,u.id
    LIMIT 26 OFFSET $2`,
    [query, offset],
  );
  return { users: rows.slice(0, 25), more: rows.length > 25, offset };
}

export async function changeSiteAdmin(db, actor, body) {
  if (
    !body ||
    Object.keys(body).some((key) => !['userId', 'admin'].includes(key)) ||
    typeof body.userId !== 'string' ||
    body.userId.length > 128 ||
    typeof body.admin !== 'boolean'
  )
    throw new SiteError(400, 'Проверь выбранную роль.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const owner = (await client.query('SELECT user_id FROM site_owner WHERE id=1 FOR UPDATE')).rows[0];
    if (owner?.user_id !== actor) throw new SiteError(403, 'Только владелец может управлять ролями.');
    if (body.userId === owner.user_id) throw new SiteError(409, 'Роль владельца нельзя изменить.');
    const target = (
      await client.query(
        `SELECT u.id,u.username,u."emailVerified" AS verified,
      EXISTS(SELECT 1 FROM site_admin a WHERE a.user_id=u.id) AS admin FROM "user" u WHERE u.id=$1 FOR UPDATE`,
        [body.userId],
      )
    ).rows[0];
    if (!target) throw new SiteError(404, 'Пользователь не найден.');
    if (body.admin && !target.verified)
      throw new SiteError(409, 'Сначала пользователь должен подтвердить почту.');
    if (target.admin !== body.admin) {
      if (body.admin)
        await client.query('INSERT INTO site_admin(user_id) VALUES($1) ON CONFLICT DO NOTHING', [target.id]);
      else await client.query('DELETE FROM site_admin WHERE user_id=$1', [target.id]);
      await client.query('INSERT INTO site_audit(actor_id,action,target,details) VALUES($1,$2,$3,$4)', [
        actor,
        body.admin ? 'admin.grant' : 'admin.revoke',
        target.id,
        { username: target.username },
      ]);
    }
    await client.query('COMMIT');
    return { role: body.admin ? 'admin' : 'player' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function relationship(db, actor, target) {
  if (actor === target) return { own: true, blocked: false, friend: false, pending: false, incoming: false };
  const { rows } = await db.query(
    `SELECT
    EXISTS(SELECT 1 FROM site_block WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)) AS blocked,
    EXISTS(SELECT 1 FROM site_friendship WHERE first_id=LEAST($1::text,$2::text) AND second_id=GREATEST($1::text,$2::text) AND accepted) AS friend,
    EXISTS(SELECT 1 FROM site_friendship WHERE first_id=LEAST($1::text,$2::text) AND second_id=GREATEST($1::text,$2::text) AND NOT accepted) AS pending,
    EXISTS(SELECT 1 FROM site_friendship WHERE first_id=LEAST($1::text,$2::text) AND second_id=GREATEST($1::text,$2::text) AND NOT accepted AND requester_id=$2) AS incoming`,
    [actor, target],
  );
  return { own: false, ...rows[0] };
}

export function canSee(mode, relation) {
  return relation.own || (!relation.blocked && (mode === 'ALL' || (mode === 'FRIENDS' && relation.friend)));
}

export async function privacy(db, userId, scope = 'global') {
  return (
    (
      await db.query(
        'SELECT profile,comments,messages,statistics FROM site_privacy WHERE user_id=$1 AND scope=$2',
        [userId, scope],
      )
    ).rows[0] || { profile: 'ALL', comments: 'ALL', messages: 'ALL', statistics: 'PRIVATE' }
  );
}

export async function siteUser(db, username) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username))
    throw new SiteError(400, 'Проверь ник.');
  const user = (await db.query('SELECT id,username FROM "user" WHERE lower(username)=lower($1)', [username]))
    .rows[0];
  if (!user) throw new SiteError(404, 'Пользователь не найден.');
  return user;
}
