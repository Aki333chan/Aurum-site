import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, RefreshCw, UsersRound } from 'lucide-react';
import { api, Dialog, errorText, jsonBody, useNotice } from './site-api';
import { ImageCropper } from './ImageCropper';
import { Feed } from './Feed';

type Member = { name: string; rank: string; joinedAt: number; siteUsername: string | null };
type Settings = {
  description: string;
  roster: 'PUBLIC' | 'MEMBERS';
  feed: 'PUBLIC' | 'MEMBERS';
  writers: string[];
  avatarUpdatedAt: string | null;
  bannerUpdatedAt: string | null;
};
type Guild = {
  serverId: string;
  guildId: number;
  name: string;
  tag: string;
  leaderName: string;
  memberCount: number;
  bankBalance: number | null;
  settings: Settings;
  members: Member[];
  rosterVisible: boolean;
  feedVisible: boolean;
  member: boolean;
  rank: string | null;
  linked: boolean;
  invited: boolean;
  actionsAvailable: boolean;
  currentApplication: string | null;
  applications: { id: string; username: string; playerName: string; createdAt: string }[];
};
type Action = { action: string; target?: string };
type Result = { ok: boolean; message: string; requiresConfirmation?: boolean };
const ranks: Record<string, string> = { leader: 'Лидер', officer: 'Офицер', member: 'Участник' };

export function GuildPage({
  serverId,
  guildId,
  cooldownHours,
  onBack,
  onUser,
}: {
  serverId: string;
  guildId: number;
  cooldownHours: number;
  onBack: () => void;
  onUser: (username: string) => void;
}) {
  const [guild, setGuild] = useState<Guild | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [tab, setTab] = useState<'feed' | 'members' | 'manage'>('feed'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [candidates, setCandidates] = useState<{ username: string; playerName: string }[]>([]),
    [confirmation, setConfirmation] = useState<{ action: Action; text: string } | null>(null),
    [crop, setCrop] = useState<{ file: File; kind: 'avatar' | 'banner' } | null>(null);
  const notice = useNotice(),
    base = `/api/site/minecraft/guild/${guildId}?server=${encodeURIComponent(serverId)}`;
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<Guild>(base);
      setGuild(result);
      setSettings({ ...result.settings });
    } catch (error) {
      setError(errorText(error));
      setGuild(null);
    } finally {
      setBusy(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (action: Action) => {
    setBusy(true);
    try {
      const result = await api<Result>(
        `/api/site/minecraft/guild/${guildId}/action?server=${encodeURIComponent(serverId)}`,
        jsonBody({ ...action, requestId: crypto.randomUUID() }),
      );
      if (result.requiresConfirmation) {
        setConfirmation({ action, text: result.message || 'Ты уже в другой гильдии. Подтвердить переход?' });
        return;
      }
      if (!result.ok) throw new Error(result.message || 'Действие отклонено в игре.');
      setConfirmation(null);
      await load();
      notice.show(result.message || 'Готово.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      const { description, roster, feed, writers } = settings;
      await api(base, jsonBody({ description, roster, feed, writers }, 'PUT'));
      await load();
      notice.show('Настройки сохранены.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  const search = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setCandidates(
        (
          await api<{ users: { username: string; playerName: string }[] }>(
            `/api/site/minecraft/guild/${guildId}/candidates?server=${encodeURIComponent(serverId)}&q=${encodeURIComponent(query)}`,
          )
        ).users,
      );
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  const selectMedia = (kind: 'avatar' | 'banner', file?: File) => {
    if (!file) return;
    if (
      file.size > 20_000_000 ||
      file.type === 'image/svg+xml' ||
      (file.type && !file.type.startsWith('image/'))
    ) {
      notice.show('Выбери изображение до 20 МБ. SVG не поддерживается.', true);
      return;
    }
    setCrop({ file, kind });
  };
  const upload = async (kind: 'avatar' | 'banner', file: File) => {
    setBusy(true);
    try {
      await api(`/api/site/minecraft/guild/${guildId}/${kind}?server=${encodeURIComponent(serverId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      await load();
      notice.show('Изображение обновлено.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  const image = (kind: 'avatar' | 'banner') =>
    guild?.settings[kind === 'avatar' ? 'avatarUpdatedAt' : 'bannerUpdatedAt']
      ? `/api/site/minecraft/guild/${guildId}/${kind}?server=${encodeURIComponent(serverId)}&v=${encodeURIComponent(guild.settings[kind === 'avatar' ? 'avatarUpdatedAt' : 'bannerUpdatedAt']!)}`
      : null;
  const manager = ['leader', 'officer'].includes(guild?.rank || '');
  return (
    <div className="profile-page guild-page">
      <div className="minecraft-directory-heading">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Гильдии Minecraft
        </button>
        <button className="button button-quiet" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      {!confirmation && notice.element}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {!guild && !error && <p role="status">Загружаем гильдию…</p>}
      {guild && (
        <>
          <header className="profile-hero guild-hero">
            <div className={`profile-cover ${image('banner') ? 'custom' : ''}`}>
              {image('banner') && <img className="profile-cover-image" src={image('banner')!} alt="" />}
              <strong aria-hidden="true">{guild.tag || guild.name}</strong>
            </div>
            <div className="profile-identity">
              <span className="profile-portrait guild-portrait">
                {image('avatar') ? (
                  <img src={image('avatar')!} alt="" />
                ) : (
                  (guild.tag || guild.name).slice(0, 2)
                )}
              </span>
              <div className="profile-identity-copy">
                <h1>{guild.name}</h1>
                <p>
                  {guild.tag && `[${guild.tag}] · `}
                  <UsersRound size={14} /> {guild.memberCount} ·{' '}
                  {guild.member ? ranks[guild.rank || ''] : 'Гильдия Minecraft'}
                </p>
              </div>
              <div className="profile-actions">
                {!guild.member &&
                  guild.linked &&
                  (guild.invited ? (
                    <button
                      className="button button-primary"
                      disabled={busy || !guild.actionsAvailable}
                      onClick={() => void act({ action: 'join' })}
                    >
                      Принять приглашение
                    </button>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={busy || guild.currentApplication === 'pending'}
                      onClick={() => void act({ action: 'apply' })}
                    >
                      {guild.currentApplication === 'pending' ? 'Заявка отправлена' : 'Подать заявку'}
                    </button>
                  ))}
              </div>
            </div>
            {guild.settings.description && <p className="guild-description">{guild.settings.description}</p>}
          </header>
          <nav className="profile-tabs" aria-label="Разделы гильдии">
            <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
              Лента
            </button>
            <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
              Состав
            </button>
            {manager && (
              <button className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>
                Управление{guild.applications.length ? ` · ${guild.applications.length}` : ''}
              </button>
            )}
          </nav>
          {tab === 'feed' ? (
            <section className="profile-section">
              {guild.feedVisible ? (
                <Feed
                  key={`${serverId}:${guildId}`}
                  scope={`guild:${serverId}:${guildId}`}
                  title="Лента гильдии"
                  onUser={onUser}
                />
              ) : (
                <p className="profile-empty">Лента только для участников гильдии.</p>
              )}
            </section>
          ) : tab === 'members' ? (
            <section className="profile-section">
              <h2>Состав</h2>
              {guild.rosterVisible ? (
                <ul className="social-rows guild-roster">
                  {guild.members.map((member) => (
                    <li key={member.name}>
                      <div>
                        <button
                          className="text-link"
                          disabled={!member.siteUsername}
                          onClick={() => member.siteUsername && onUser(member.siteUsername)}
                        >
                          {member.name}
                        </button>
                        <small>{ranks[member.rank] || member.rank}</small>
                      </div>
                      {manager && member.rank !== 'leader' && guild.actionsAvailable && (
                        <div className="row-actions">
                          {guild.rank === 'leader' && (
                            <button
                              className="button button-quiet"
                              disabled={busy}
                              onClick={() =>
                                setConfirmation({
                                  action: {
                                    action: member.rank === 'officer' ? 'demote' : 'promote',
                                    target: member.name,
                                  },
                                  text: `Изменить ранг ${member.name}?`,
                                })
                              }
                            >
                              {member.rank === 'officer' ? 'Сделать участником' : 'Сделать офицером'}
                            </button>
                          )}
                          {(guild.rank === 'leader' || member.rank === 'member') && (
                            <button
                              className="button button-quiet"
                              disabled={busy}
                              onClick={() =>
                                setConfirmation({
                                  action: { action: 'kick', target: member.name },
                                  text: `Исключить ${member.name} из гильдии?`,
                                })
                              }
                            >
                              Исключить
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="profile-empty">Состав только для участников гильдии.</p>
              )}
              {guild.member && guild.bankBalance !== null && (
                <p className="guild-bank">Банк гильдии: {guild.bankBalance.toLocaleString('ru-RU')}</p>
              )}
            </section>
          ) : (
            manager && (
              <>
                <section className="profile-section">
                  <h2>Заявки и приглашения</h2>
                  {!guild.actionsAvailable && (
                    <p className="auth-error">Обнови Guilds и Companion, чтобы включить игровые действия.</p>
                  )}
                  {!guild.applications.length ? (
                    <p className="profile-empty">Нет новых заявок.</p>
                  ) : (
                    <ul className="social-rows">
                      {guild.applications.map((application) => (
                        <li key={application.id}>
                          <div>
                            <button className="text-link" onClick={() => onUser(application.username)}>
                              {application.username}
                            </button>
                            <small>Minecraft: {application.playerName}</small>
                          </div>
                          <div className="row-actions">
                            <button
                              className="button button-primary"
                              disabled={busy || !guild.actionsAvailable}
                              onClick={() => void act({ action: 'invite', target: application.username })}
                            >
                              Пригласить
                            </button>
                            <button
                              className="button button-quiet"
                              disabled={busy}
                              onClick={() => void act({ action: 'decline', target: application.username })}
                            >
                              Отклонить
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="compact-search" onSubmit={search}>
                    <label>
                      Игрок
                      <input
                        type="search"
                        maxLength={20}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Ник на сайте или в игре"
                      />
                    </label>
                    <button className="button button-quiet" disabled={busy}>
                      Найти
                    </button>
                  </form>
                  <ul className="social-rows">
                    {candidates.map((candidate) => (
                      <li key={candidate.username}>
                        <div>
                          <strong>{candidate.username}</strong>
                          <small>{candidate.playerName}</small>
                        </div>
                        <button
                          className="button button-quiet"
                          disabled={busy || !guild.actionsAvailable}
                          onClick={() => void act({ action: 'invite', target: candidate.username })}
                        >
                          Пригласить
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
                {guild.rank === 'leader' && settings && (
                  <section className="profile-section">
                    <h2>Настройки гильдии</h2>
                    <form className="guild-settings" onSubmit={save}>
                      {(['avatar', 'banner'] as const).map((kind) => {
                        const updatedAt = settings[kind === 'avatar' ? 'avatarUpdatedAt' : 'bannerUpdatedAt'];
                        const next = updatedAt ? Date.parse(updatedAt) + cooldownHours * 3600_000 : 0;
                        return (
                          <div className="profile-media-edit" key={kind}>
                            <div>
                              <strong>{kind === 'avatar' ? 'Аватар' : 'Обложка'}</strong>
                              {next > Date.now() && (
                                <span>Смена после {new Date(next).toLocaleString('ru-RU')}</span>
                              )}
                            </div>
                            <label className="button button-quiet profile-media-upload">
                              Выбрать изображение
                              <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                disabled={busy || next > Date.now()}
                                onChange={(event) => {
                                  selectMedia(kind, event.target.files?.[0]);
                                  event.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        );
                      })}
                      <label>
                        Описание
                        <textarea
                          rows={3}
                          maxLength={600}
                          value={settings.description}
                          onChange={(event) => setSettings({ ...settings, description: event.target.value })}
                        />
                      </label>
                      <div className="privacy-form">
                        <label>
                          Состав
                          <select
                            value={settings.roster}
                            onChange={(event) =>
                              setSettings({ ...settings, roster: event.target.value as Settings['roster'] })
                            }
                          >
                            <option value="PUBLIC">Все пользователи</option>
                            <option value="MEMBERS">Участники гильдии</option>
                          </select>
                        </label>
                        <label>
                          Лента
                          <select
                            value={settings.feed}
                            onChange={(event) =>
                              setSettings({ ...settings, feed: event.target.value as Settings['feed'] })
                            }
                          >
                            <option value="PUBLIC">Все пользователи</option>
                            <option value="MEMBERS">Участники гильдии</option>
                          </select>
                        </label>
                      </div>
                      <fieldset>
                        <legend>Кто может публиковать</legend>
                        {(['leader', 'officer', 'member'] as const).map((rank) => (
                          <label className="checkbox-row" key={rank}>
                            <input
                              type="checkbox"
                              disabled={rank === 'leader' || busy}
                              checked={settings.writers.includes(rank)}
                              onChange={(event) =>
                                setSettings({
                                  ...settings,
                                  writers: event.target.checked
                                    ? [...settings.writers, rank]
                                    : settings.writers.filter((item) => item !== rank),
                                })
                              }
                            />
                            {ranks[rank]}
                          </label>
                        ))}
                      </fieldset>
                      <button className="button button-primary" disabled={busy}>
                        {busy ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                    </form>
                  </section>
                )}
              </>
            )
          )}
        </>
      )}
      {confirmation && (
        <Dialog title="Подтверди действие" onClose={() => setConfirmation(null)}>
          {notice.element}
          <p>{confirmation.text}</p>
          <div className="form-actions">
            <button className="button button-quiet" disabled={busy} onClick={() => setConfirmation(null)}>
              Отмена
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void act(confirmation.action)}
            >
              Подтвердить
            </button>
          </div>
        </Dialog>
      )}
      {crop && (
        <ImageCropper
          file={crop.file}
          kind={crop.kind}
          onCancel={() => setCrop(null)}
          onApply={(file) => {
            const kind = crop.kind;
            setCrop(null);
            void upload(kind, file);
          }}
        />
      )}
    </div>
  );
}
