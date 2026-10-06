import { SiteError, privacy, relationship, siteUser } from './site-access.js';
import { guildPage, saveGuildSettings, guildAction, guildCandidates, guildState } from './guild-community.js';
import {
  savePrivacy,
  searchPeople,
  friends,
  friendAction,
  messageInbox,
  messages,
  sendMessage,
  feed,
  publish,
  removeContent,
  reportContent,
  reports,
  closeReport,
} from './social-data.js';

// Custom site routes stay session-bound. The caller enforces session, Origin and maintenance.
export async function communityRoutes({
  req,
  res,
  url,
  db,
  config,
  actor,
  admin,
  json,
  readJson,
  readBody,
  imageFormat,
  resizeImage,
  cooldownHours,
}) {
  const path = url.pathname,
    method = req.method;
  if (path === '/api/site/privacy') {
    const scope = (url.searchParams.get('scope') || 'global').toLowerCase();
    if (typeof scope !== 'string' || !/^(global|minecraft:[0-9a-f-]{36})$/i.test(scope))
      throw new SiteError(400, 'Выбери раздел.');
    if (method === 'GET') {
      json(res, 200, await privacy(db, actor, scope));
      return true;
    }
    if (method === 'PUT') {
      json(res, 200, await savePrivacy(db, actor, scope, await readJson(req, 2048)));
      return true;
    }
  }
  if (path === '/api/site/people' && method === 'GET') {
    json(res, 200, await searchPeople(db, actor, url.searchParams.get('q') || ''));
    return true;
  }
  if (path === '/api/site/friends') {
    if (method === 'GET') {
      json(res, 200, await friends(db, actor));
      return true;
    }
    if (method === 'POST') {
      json(res, 200, await friendAction(db, actor, await readJson(req, 1024)));
      return true;
    }
  }
  if (path === '/api/site/relationship' && method === 'GET') {
    const target = await siteUser(db, url.searchParams.get('user'));
    const relation = await relationship(db, actor, target.id),
      settings = await privacy(db, target.id);
    json(res, 200, {
      ...relation,
      canMessage:
        !relation.own &&
        !relation.blocked &&
        (settings.messages === 'ALL' || (settings.messages === 'FRIENDS' && relation.friend)),
    });
    return true;
  }
  if (path === '/api/site/messages') {
    if (method === 'GET') {
      json(
        res,
        200,
        url.searchParams.has('user')
          ? await messages(db, actor, url.searchParams.get('user'), url.searchParams.get('before'))
          : await messageInbox(db, actor),
      );
      return true;
    }
    if (method === 'POST') {
      json(res, 201, await sendMessage(db, actor, await readJson(req, 9000)));
      return true;
    }
  }
  if (path === '/api/site/feed') {
    if (method === 'GET') {
      json(
        res,
        200,
        await feed(
          db,
          config,
          actor,
          url.searchParams.get('scope'),
          url.searchParams.get('kind') || 'posts',
          url.searchParams.get('before'),
          url.searchParams.get('parent'),
          admin,
        ),
      );
      return true;
    }
    if (method === 'POST') {
      json(res, 201, await publish(db, config, actor, await readJson(req, 16000), admin));
      return true;
    }
  }
  const contentPath = path.match(/^\/api\/site\/content\/([1-9][0-9]{0,18})$/);
  if (contentPath && method === 'DELETE') {
    json(res, 200, await removeContent(db, config, actor, contentPath[1], admin));
    return true;
  }
  if (path === '/api/site/reports' && method === 'POST') {
    json(res, 201, await reportContent(db, config, actor, await readJson(req, 4096), admin));
    return true;
  }
  if (path === '/api/site/admin/reports' && method === 'GET') {
    json(res, 200, await reports(db, admin));
    return true;
  }
  const reportPath = path.match(/^\/api\/site\/admin\/reports\/([1-9][0-9]{0,18})$/);
  if (reportPath && method === 'PUT') {
    json(res, 200, await closeReport(db, actor, reportPath[1], admin));
    return true;
  }

  const guildPath = path.match(
    /^\/api\/site\/minecraft\/guild\/([1-9][0-9]{0,15})(?:\/(action|candidates|avatar|banner))?$/,
  );
  if (!guildPath) return false;
  const server = url.searchParams.get('server'),
    guild = guildPath[1],
    part = guildPath[2];
  if (!part && method === 'GET') {
    json(res, 200, await guildPage(db, config, actor, server, guild));
    return true;
  }
  if (!part && method === 'PUT') {
    json(res, 200, await saveGuildSettings(db, config, actor, server, guild, await readJson(req, 8192)));
    return true;
  }
  if (part === 'action' && method === 'POST') {
    json(res, 200, await guildAction(db, config, actor, server, guild, await readJson(req, 2048)));
    return true;
  }
  if (part === 'candidates' && method === 'GET') {
    json(res, 200, await guildCandidates(db, config, actor, server, guild, url.searchParams.get('q') || ''));
    return true;
  }
  if (['avatar', 'banner'].includes(part) && ['GET', 'PUT'].includes(method)) {
    const state = await guildState(db, config, actor, server, guild);
    // Media are public to signed-in users even when the roster/feed is members-only.
    if (method === 'GET') {
      const row = (
        await db.query(`SELECT ${part} AS image FROM site_guild WHERE server_id=$1 AND guild_id=$2`, [
          state.serverId,
          state.guildId,
        ])
      ).rows[0];
      if (!row?.image) throw new SiteError(404, 'Нет изображения.');
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.writeHead(200).end(row.image);
      return true;
    }
    if (!state.leader) throw new SiteError(403, 'Изображение меняет лидер гильдии.');
    const previous = state.settings[part === 'avatar' ? 'avatarUpdatedAt' : 'bannerUpdatedAt'];
    if (previous && Date.parse(previous) + cooldownHours * 3_600_000 > Date.now())
      throw new SiteError(429, 'Смена изображения пока недоступна.');
    const type = String(req.headers['content-type'] || '').split(';')[0],
      maximum = part === 'avatar' ? 2_000_000 : 4_000_000;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type))
      throw new SiteError(415, 'Выбери JPG, PNG или WebP.');
    const input = await readBody(req, maximum);
    if (imageFormat(input) !== type) throw new SiteError(415, 'Изображение повреждено.');
    let image;
    try {
      image = await resizeImage(input, part);
    } catch {
      throw new SiteError(415, 'Изображение повреждено.');
    }
    const column = `${part}_updated_at`;
    const saved = await db.query(
      `INSERT INTO site_guild(server_id,guild_id,${part},${column}) VALUES($1,$2,$3,now())
      ON CONFLICT(server_id,guild_id) DO UPDATE SET ${part}=EXCLUDED.${part},${column}=now()
      WHERE site_guild.${column} IS NULL OR site_guild.${column} <= now()-($4::integer*interval '1 hour') RETURNING ${column} AS "updatedAt"`,
      [state.serverId, state.guildId, image, cooldownHours],
    );
    if (!saved.rowCount) throw new SiteError(429, 'Смена изображения пока недоступна.');
    json(res, 200, saved.rows[0]);
    return true;
  }
  return false;
}
