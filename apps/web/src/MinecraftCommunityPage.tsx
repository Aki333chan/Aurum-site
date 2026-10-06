import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, LockKeyhole, RefreshCw, Search, UsersRound } from 'lucide-react';
import type { MinecraftProfile, MinecraftState } from './MinecraftLinkPage';

type Guild = { id: number; name: string; tag: string; leaderName: string; memberCount: number | null };
type Snapshot = {
  checkedAt: string;
  player: { online: boolean; playTimeTicks: number | null; deaths: number | null; playerKills: number | null } | null;
  balance: { amount: number; formatted: string; currency: string } | null;
  guild: { available: boolean; membership: { guildId: number; guildName: string; guildTag: string; rank: string } | null };
};
const ranks: Record<string, string> = { leader: 'Лидер', officer: 'Офицер', member: 'Участник', recruit: 'Новичок' };
const count = (value: number | null | undefined) => value == null ? 'Недоступно' : value.toLocaleString('ru-RU');
function playTime(ticks: number | null | undefined) {
  if (ticks == null) return 'Недоступно';
  const minutes = Math.floor(ticks / 1200);
  return minutes >= 60 ? `${Math.floor(minutes / 60).toLocaleString('ru-RU')} ч ${minutes % 60} мин` : minutes ? `${minutes} мин` : 'Меньше минуты';
}

export function MinecraftCommunityPage({ minecraft, guilds = false, avatarVersion, onServers, onLink, onGuilds, onOverview }: {
  minecraft: MinecraftState | null; guilds?: boolean; avatarVersion?: string | null;
  onServers: () => void; onLink: () => void; onGuilds: () => void; onOverview: () => void;
}) {
  const [serverId, setServerId] = useState('');
  const servers = guilds ? minecraft?.servers.length ? minecraft.servers : minecraft?.profiles.map(profile => ({ id: profile.serverId, name: profile.serverName })) || []
    : minecraft?.profiles.map(profile => ({ id: profile.serverId, name: profile.serverName })) || [];
  const selected = servers.some(server => server.id === serverId) ? serverId : servers[0]?.id || '';
  const profile = minecraft?.profiles.find(item => item.serverId === selected);
  return <div className="profile-page minecraft-community">
    <button className="back-link" onClick={onServers}><ArrowLeft size={18} /> К игровым мирам</button>
    <div className="minecraft-page-heading"><h1>{guilds ? 'Гильдии Minecraft' : 'Мой Minecraft'}</h1>
      {servers.length > 1 && <label className="minecraft-server-select">Сервер<select value={selected} onChange={event => setServerId(event.target.value)}>{servers.map(server => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>}
    </div>
    <nav className="game-tabs" aria-label="Разделы Minecraft">
      <button className={!guilds ? 'active' : ''} aria-current={!guilds ? 'page' : undefined} onClick={onOverview}>Обзор</button>
      <button className={guilds ? 'active' : ''} aria-current={guilds ? 'page' : undefined} onClick={onGuilds}>Гильдии</button>
    </nav>
    {!minecraft ? <p className="profile-state" role="status">Загружаем Minecraft…</p> : guilds ? selected
      ? <GuildDirectory key={selected} serverId={selected} serverName={servers.find(server => server.id === selected)?.name || 'Minecraft'} />
      : <p className="profile-state" role="status">{minecraft.error || 'Список серверов пока недоступен.'}</p>
      : profile ? <LiveMinecraftProfile key={profile.serverId} profile={profile} avatarVersion={avatarVersion} onGuilds={onGuilds} />
      : <section className="profile-section minecraft-link-empty"><Gamepad2 size={30} /><h2>Привяжи игровой профиль</h2><p>{minecraft.error || 'Получи код в игре: /aurumlink'}</p><button className="button button-primary" onClick={onLink}>Привязать профиль <ArrowRight size={16} /></button></section>}
  </div>;
}

function LiveMinecraftProfile({ profile, avatarVersion, onGuilds }: { profile: MinecraftProfile; avatarVersion?: string | null; onGuilds: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    fetch(`/api/site/minecraft/profile?server=${encodeURIComponent(profile.serverId)}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Сервер не отвечает. Попробуй позже.');
      if (!controller.signal.aborted) setSnapshot(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [profile.serverId, revision]);
  const member = snapshot?.guild.membership;
  return <>
    <header className="profile-hero minecraft-profile-hero">
      <div className="profile-cover"><strong aria-hidden="true">{profile.playerName}</strong></div>
      <div className="profile-identity">
        <span className="profile-portrait">{avatarVersion ? <img src={`/api/site/me/avatar?v=${encodeURIComponent(avatarVersion)}`} alt="" /> : profile.playerName.charAt(0).toUpperCase()}</span>
        <div className="profile-identity-copy"><h2>{profile.playerName}</h2><p>{profile.serverName}</p></div>
        <span className={`minecraft-presence ${snapshot?.player?.online ? 'online' : ''}`}>{snapshot?.player ? snapshot.player.online ? 'В игре' : 'Не в сети' : 'Статус недоступен'}</span>
      </div>
    </header>
    <div className="minecraft-data-toolbar"><span role="status">{busy ? 'Загружаем данные…' : error ? 'Данные не обновлены' : snapshot ? `Обновлено ${new Date(snapshot.checkedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      <button className="button button-quiet" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /> Обновить</button>
    </div>
    {error && <p className="minecraft-read-error" role="alert">{error}{snapshot && ' Показаны ранее полученные данные.'}</p>}
    <div className="minecraft-profile-columns" aria-busy={busy}>
      <section className="profile-section"><div className="profile-section-heading"><h2>Моя статистика</h2><span className="minecraft-private"><LockKeyhole size={14} /> Только тебе</span></div>
        <dl className="minecraft-counters">
          <div><dt>Баланс</dt><dd>{busy && !snapshot ? 'Загружаем…' : snapshot?.balance ? snapshot.balance.formatted || `${count(snapshot.balance.amount)} ${snapshot.balance.currency}` : 'Недоступно'}</dd></div>
          <div><dt>Время в игре</dt><dd>{busy && !snapshot ? 'Загружаем…' : playTime(snapshot?.player?.playTimeTicks)}</dd></div>
          <div><dt>Убийства игроков</dt><dd>{busy && !snapshot ? 'Загружаем…' : count(snapshot?.player?.playerKills)}</dd></div>
          <div><dt>Смерти</dt><dd>{busy && !snapshot ? 'Загружаем…' : count(snapshot?.player?.deaths)}</dd></div>
        </dl>
      </section>
      <section className="profile-section minecraft-membership"><h2>Моя гильдия</h2>
        {member ? <><div className="minecraft-guild-identity"><span className="minecraft-guild-crest" aria-hidden="true">{(member.guildTag || member.guildName).slice(0, 2).toUpperCase()}</span><div><h3>{member.guildName}</h3><p>{member.guildTag && `[${member.guildTag}] · `}{ranks[member.rank] || member.rank}</p></div></div>
          <button className="panel-link" onClick={onGuilds}>Каталог гильдий <ArrowRight size={16} /></button></>
          : <><p className="minecraft-empty-text">{busy && !snapshot ? 'Загружаем…' : !snapshot?.guild.available ? 'Данные гильдии недоступны.' : 'Ты пока не состоишь в гильдии.'}</p><button className="panel-link" onClick={onGuilds}>Найти гильдию <ArrowRight size={16} /></button></>}
      </section>
    </div>
    <section className="profile-section minecraft-account-details"><h2>Игровой аккаунт</h2><dl className="minecraft-identity"><div><dt>UUID</dt><dd>{profile.playerUuid}</dd></div><div><dt>Привязан</dt><dd>{new Date(profile.linkedAt).toLocaleDateString('ru-RU')}</dd></div></dl></section>
  </>;
}

function GuildDirectory({ serverId, serverName }: { serverId: string; serverName: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ available: boolean; guilds: Guild[]; limit: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [request, setRequest] = useState({ query: '', revision: 0 });
  const search = useCallback((event: FormEvent) => { event.preventDefault(); setRequest(value => ({ query: query.trim(), revision: value.revision + 1 })); }, [query]);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError('');
    fetch(`/api/site/minecraft/guilds?server=${encodeURIComponent(serverId)}&q=${encodeURIComponent(request.query)}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Список гильдий недоступен.');
      if (!controller.signal.aborted) setResult(body);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить гильдии.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [serverId, request]);
  return <section className="profile-section minecraft-guild-directory" aria-busy={busy}>
    <div className="minecraft-directory-heading"><h2>{serverName}</h2><button className="button button-quiet" disabled={busy} onClick={() => setRequest(value => ({ ...value, revision: value.revision + 1 }))}><RefreshCw size={15} /> Обновить</button></div>
    <form className="minecraft-guild-search" onSubmit={search}><label htmlFor="guild-query">Название или тег<input id="guild-query" type="search" maxLength={80} placeholder="Найти гильдию" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="button button-primary" disabled={busy} type="submit"><Search size={16} /> Найти</button></form>
    {busy ? <p className="profile-state" role="status">Загружаем гильдии…</p> : error ? <p className="minecraft-read-error" role="alert">{error} Нажми «Обновить», чтобы повторить.</p> : !result?.available ? <p className="profile-state" role="status">Гильдии сейчас недоступны. Попробуй обновить позже.</p> : !result.guilds.length ? <p className="profile-state" role="status">{request.query ? 'Гильдии не найдены. Попробуй другое название или тег.' : 'На этом сервере пока нет гильдий.'}</p> : <>
      <ul className="minecraft-guild-list">{result.guilds.map(guild => <li key={guild.id}>
        <span className="minecraft-guild-crest" aria-hidden="true">{(guild.tag || guild.name).slice(0, 2).toUpperCase()}</span>
        <div className="minecraft-directory-name"><h3>{guild.name}</h3><p>{guild.tag && `[${guild.tag}] · `}Лидер: {guild.leaderName || 'Неизвестен'}</p></div>
        <span className="minecraft-guild-count"><UsersRound size={16} /><span>Участников: {count(guild.memberCount)}</span></span>
      </li>)}</ul>
      {result.guilds.length >= result.limit && <p className="minecraft-empty-text">Первые {result.limit} гильдий. Уточни название или тег для поиска.</p>}
    </>}
  </section>;
}
