import { bridgeRequest, LinkError } from './minecraft-link.js';

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const reads = new Map();
export function invalidateMinecraftReads() {
  reads.clear();
}
const text = (value, maximum) => (typeof value === 'string' ? value.slice(0, maximum) : '');
const counter = (value) => (Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null);

export function minecraftServerId(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new LinkError(400, 'Выбери Minecraft-сервер.');
  return value.toLowerCase();
}

// On-demand only. Bounded, short-lived and single-flight; no background polling.
function cached(key, load) {
  const existing = reads.get(key);
  if (existing && existing.until > Date.now()) return existing.promise;
  reads.delete(key);
  if (reads.size >= 128) reads.delete(reads.keys().next().value);
  const promise = load();
  reads.set(key, { until: Date.now() + 20_000, promise });
  return promise;
}

export async function minecraftProfileData(db, config, userId, server, fetchImpl = fetch) {
  const serverId = minecraftServerId(server);
  // The UUID is ONLY taken from the current session's saved proof of ownership.
  const { rows } = await db.query(
    `SELECT player_uuid AS "playerUuid" FROM site_minecraft_profile
    WHERE user_id=$1 AND server_id=$2`,
    [userId, serverId],
  );
  if (!rows[0]) throw new LinkError(404, 'Сначала привяжи профиль этого сервера.');
  const playerUuid = rows[0].playerUuid;
  if (typeof playerUuid !== 'string' || !uuidPattern.test(playerUuid))
    throw new LinkError(503, 'Игровой профиль недоступен.');
  return cached(`profile:${serverId}:${playerUuid}`, async () => {
    const data = await bridgeRequest(config, 'profile', { serverId, playerUuid }, fetchImpl);
    const member = data.guild?.membership;
    const membership =
      member && Number.isSafeInteger(member.guildId) && member.guildId > 0
        ? {
            guildId: member.guildId,
            guildName: text(member.guildName, 80),
            guildTag: text(member.guildTag, 24),
            rank: text(member.rank, 24),
          }
        : null;
    return {
      checkedAt: new Date().toISOString(),
      player:
        data.player && typeof data.player.online === 'boolean'
          ? {
              online: data.player.online,
              playTimeTicks: counter(data.player.playTimeTicks),
              deaths: counter(data.player.deaths),
              playerKills: counter(data.player.playerKills),
            }
          : null,
      balance:
        data.balance && typeof data.balance.amount === 'number' && Number.isFinite(data.balance.amount)
          ? {
              amount: data.balance.amount,
              formatted: text(data.balance.formatted, 120),
              currency: text(data.balance.currency, 80),
            }
          : null,
      guild: { available: data.guild?.available === true, membership },
    };
  });
}

export async function minecraftGuildDirectory(config, server, query = '', fetchImpl = fetch) {
  const serverId = minecraftServerId(server);
  if (typeof query !== 'string' || query.length > 80)
    throw new LinkError(400, 'Поиск: не больше 80 символов.');
  const search = query.trim();
  return cached(`guilds:${serverId}:${search}`, async () => {
    const data = await bridgeRequest(config, 'guilds', { serverId, query: search }, fetchImpl);
    if (!Array.isArray(data.guilds)) throw new LinkError(503, 'Список гильдий недоступен.');
    return {
      available: data.available === true,
      limit: 50,
      guilds: data.guilds
        .slice(0, 50)
        .filter((guild) => Number.isSafeInteger(guild?.id) && guild.id > 0)
        .map((guild) => ({
          id: guild.id,
          name: text(guild.name, 80),
          tag: text(guild.tag, 24),
          leaderName: text(guild.leaderName, 32),
          memberCount: counter(guild.memberCount),
        })),
    };
  });
}
