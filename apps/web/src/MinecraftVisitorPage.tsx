import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, RefreshCw } from 'lucide-react';
import { api, errorText } from './site-api';
import { Feed } from './Feed';

type Snapshot = {
  checkedAt: string;
  statisticsVisible: boolean;
  profile: { playerName: string; serverName: string };
  player: {
    online: boolean;
    playTimeTicks: number | null;
    deaths: number | null;
    playerKills: number | null;
  } | null;
  balance: { formatted: string } | null;
  guild: {
    available: boolean;
    membership: {
      guildId: number;
      guildName: string;
      guildTag: string;
      rank: string;
      description?: string;
      avatarUpdatedAt?: string | null;
    } | null;
  };
};
export function MinecraftVisitorPage({
  username,
  serverId,
  onUser,
  onGuild,
}: {
  username: string;
  serverId: string;
  onUser: (name: string) => void;
  onGuild: (server: string, id: number) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tab, setTab] = useState<'posts' | 'comments'>('posts');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setData(
        await api<Snapshot>(
          `/api/site/minecraft/profile?${new URLSearchParams({ server: serverId, user: username })}`,
        ),
      );
    } catch (error) {
      setData(null);
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }, [username, serverId]);
  useEffect(() => {
    void load();
  }, [load]);
  const member = data?.guild.membership;
  return (
    <div className="profile-page">
      <div className="minecraft-directory-heading">
        <button className="back-link" onClick={() => onUser(username)}>
          <ArrowLeft size={17} />
          {username}
        </button>
        <button className="button button-quiet" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Загружаем профиль…</p>}
      {data && (
        <>
          <header className="profile-hero minecraft-profile-hero">
            <div className="profile-cover">
              <strong aria-hidden="true">{data.profile.playerName}</strong>
            </div>
            <div className="profile-identity">
              <span className="profile-portrait">{data.profile.playerName.charAt(0).toUpperCase()}</span>
              <div className="profile-identity-copy">
                <h1>{data.profile.playerName}</h1>
                <p>{data.profile.serverName}</p>
              </div>
            </div>
          </header>
          <div className="minecraft-profile-columns">
            <section className="profile-section">
              <h2>Статистика</h2>
              {data.statisticsVisible ? (
                <dl className="minecraft-counters">
                  <div>
                    <dt>Баланс</dt>
                    <dd>{data.balance?.formatted || 'Недоступно'}</dd>
                  </div>
                  <div>
                    <dt>Время в игре</dt>
                    <dd>
                      {data.player?.playTimeTicks != null
                        ? `${Math.floor(data.player.playTimeTicks / 72000)} ч`
                        : 'Недоступно'}
                    </dd>
                  </div>
                  <div>
                    <dt>Убийства игроков</dt>
                    <dd>{data.player?.playerKills ?? 'Недоступно'}</dd>
                  </div>
                  <div>
                    <dt>Смерти</dt>
                    <dd>{data.player?.deaths ?? 'Недоступно'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="profile-empty">
                  <LockKeyhole size={16} /> Баланс и статистика закрыты.
                </p>
              )}
            </section>
            <section className="profile-section minecraft-membership">
              <h2>Гильдия</h2>
              {member ? (
                <>
                  <div className="minecraft-guild-identity">
                    <span className="minecraft-guild-crest">
                      {member.avatarUpdatedAt ? (
                        <img
                          src={`/api/site/minecraft/guild/${member.guildId}/avatar?server=${encodeURIComponent(serverId)}&v=${encodeURIComponent(member.avatarUpdatedAt)}`}
                          alt=""
                        />
                      ) : (
                        (member.guildTag || member.guildName).slice(0, 2)
                      )}
                    </span>
                    <div>
                      <h3>{member.guildName}</h3>
                      <p>{member.guildTag && `[${member.guildTag}]`}</p>
                    </div>
                  </div>
                  {member.description && <p className="minecraft-empty-text">{member.description}</p>}
                  <button className="panel-link" onClick={() => onGuild(serverId, member.guildId)}>
                    Открыть гильдию <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <p className="profile-empty">
                  {data.guild.available ? 'Не состоит в гильдии.' : 'Данные недоступны.'}
                </p>
              )}
            </section>
          </div>
          <nav className="profile-tabs" aria-label="Minecraft — публикации">
            <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
              Записи Minecraft
            </button>
            <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
              Комментарии
            </button>
          </nav>
          <section className="profile-section">
            <Feed key={tab} scope={`game-profile:${serverId}:${username}`} kind={tab} onUser={onUser} />
          </section>
        </>
      )}
    </div>
  );
}
