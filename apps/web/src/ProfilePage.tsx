import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Copy, Gamepad2, X } from 'lucide-react';
import { ImageCropper } from './ImageCropper';
import type { MinecraftProfile } from './MinecraftLinkPage';

type Profile = {
  username: string;
  displayName: string;
  tagline: string;
  about: string;
  avatarUpdatedAt: string | null;
  bannerUpdatedAt: string | null;
  own: boolean;
  minecraftProfiles?: MinecraftProfile[];
};

type Tab = 'overview' | 'posts' | 'comments';
type MediaKind = 'avatar' | 'banner';

export function ProfilePage({ username, preview, imageCooldownHours, onAvatarUpdate, onBack, onLink }: {
  username: string;
  preview: boolean;
  imageCooldownHours: number;
  onAvatarUpdate: (updatedAt: string) => void;
  onBack: () => void;
  onLink: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [tagline, setTagline] = useState('');
  const [about, setAbout] = useState('');
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState<MediaKind | null>(null);
  const [cropSelection, setCropSelection] = useState<{ file: File; kind: MediaKind } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    let active = true;
    setTab('overview');
    setEditing(false);
    setMessage('');
    setMessageError(false);
    setError('');
    setLoading(true);
    setProfile(null);
    if (preview) {
      const sample = { username, displayName: username, tagline: '', about: '', avatarUpdatedAt: null, bannerUpdatedAt: null, own: username === 'AurumPlayer' };
      setProfile(sample);
      setTagline('');
      setAbout('');
      setLoading(false);
      return;
    }
    if (!username) { setLoading(false); setError('Профиль не найден.'); return; }
    fetch(`/api/site/profile/${encodeURIComponent(username)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'Профиль не найден.' : 'Не удалось загрузить профиль.');
        return response.json() as Promise<Profile>;
      })
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setTagline(result.tagline);
        setAbout(result.about);
      })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [username, preview]);

  const nextAvatarAt = profile?.avatarUpdatedAt ? Date.parse(profile.avatarUpdatedAt) + imageCooldownHours * 3600_000 : 0;
  const nextBannerAt = profile?.bannerUpdatedAt ? Date.parse(profile.bannerUpdatedAt) + imageCooldownHours * 3600_000 : 0;
  useEffect(() => {
    if (nextAvatarAt <= now && nextBannerAt <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [nextAvatarAt, nextBannerAt, now]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile?.own || preview) return;
    setSaving(true);
    setMessage('');
    setMessageError(false);
    try {
      const response = await fetch('/api/site/me/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagline, about }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить профиль.');
      setProfile((current) => current && { ...current, tagline: result.tagline, about: result.about });
      setTagline(result.tagline);
      setAbout(result.about);
      setEditing(false);
      setMessage('Профиль сохранён.');
    } catch (reason) {
      setMessageError(true);
      setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить профиль.');
    } finally { setSaving(false); }
  };

  const share = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${encodeURIComponent(profile.username)}`);
      setMessageError(false);
      setMessage('Ссылка скопирована.');
    } catch { setMessageError(true); setMessage('Не удалось скопировать ссылку.'); }
  };

  const uploadMedia = async (kind: MediaKind, file: File) => {
    if (!profile?.own || preview) return;
    const label = kind === 'avatar' ? 'аватар' : 'обложку';
    const updatedAtField = kind === 'avatar' ? 'avatarUpdatedAt' : 'bannerUpdatedAt';
    if (file.type !== 'image/png' || file.size > (kind === 'avatar' ? 2_000_000 : 4_000_000)) {
      setMessageError(true); setMessage('Не удалось подготовить изображение для загрузки.'); return;
    }
    if (Date.now() < (kind === 'avatar' ? nextAvatarAt : nextBannerAt)) {
      setMessageError(true); setMessage('Смена изображения пока недоступна.'); return;
    }
    setMediaBusy(kind);
    setMessage('');
    try {
      const response = await fetch(`/api/site/me/${kind}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 429 ? 'Смена изображения пока недоступна.'
        : `Не удалось загрузить ${label} (код ${response.status}).`);
      const updatedAt = result[updatedAtField];
      if (typeof updatedAt !== 'string') throw new Error(`Не удалось подтвердить загрузку: ${label}.`);
      setProfile((current) => current && { ...current, [updatedAtField]: updatedAt });
      if (kind === 'avatar') onAvatarUpdate(updatedAt);
      setNow(Date.now());
      setMessageError(false);
      setMessage(kind === 'avatar' ? 'Аватар обновлён.' : 'Обложка обновлена.');
    } catch (reason) {
      setMessageError(true);
      setMessage(reason instanceof Error ? reason.message : `Не удалось загрузить ${label}.`);
    } finally { setMediaBusy(null); }
  };

  const selectMedia = (kind: MediaKind, file?: File) => {
    if (!file) return;
    if (file.size > 20_000_000 || file.type === 'image/svg+xml' || (file.type && !file.type.startsWith('image/'))) {
      setMessageError(true); setMessage('Выбери изображение до 20 МБ. SVG не поддерживается.'); return;
    }
    setMessage('');
    setCropSelection({ file, kind });
  };

  if (loading) return <div className="profile-page"><p className="profile-state" role="status">Загружаем профиль…</p></div>;
  if (!profile) return <div className="profile-page"><p className="profile-state" role="alert">{error}</p><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> На главную</button></div>;

  const name = profile.displayName || profile.username;
  const avatarUrl = profile.avatarUpdatedAt
    ? `/api/site/profile/${encodeURIComponent(profile.username)}/avatar?v=${encodeURIComponent(profile.avatarUpdatedAt)}` : null;
  const bannerUrl = profile.bannerUpdatedAt
    ? `/api/site/profile/${encodeURIComponent(profile.username)}/banner?v=${encodeURIComponent(profile.bannerUpdatedAt)}` : null;

  return <div className="profile-page">
    <div className="profile-path"><button onClick={onBack}><ArrowLeft size={16} /> Сообщество</button><span>/</span><span>{profile.own ? 'Моя страница' : name}</span></div>
    <header className="profile-hero">
      <div className={`profile-cover ${bannerUrl ? 'custom' : ''}`}>
        {bannerUrl && <img className="profile-cover-image" src={bannerUrl} alt="" />}
        <span>AURUM · ИГРОВОЕ СООБЩЕСТВО</span><strong aria-hidden="true">{name}</strong>
      </div>
      <div className="profile-identity">
        <span className="profile-portrait">{avatarUrl ? <img src={avatarUrl} alt="" /> : name.charAt(0).toUpperCase()}</span>
        <div className="profile-identity-copy"><h1>{name}</h1><p>{profile.tagline || (profile.own ? 'Добавь короткую строку о себе.' : 'Участник сообщества Aurum')}</p></div>
        <div className="profile-actions">
          {profile.own && <button className="button button-primary" onClick={() => { setEditing(!editing); setMessage(''); }}>{editing ? 'Отменить' : 'Изменить профиль'}</button>}
          <button className="button button-quiet" onClick={share}><Copy size={15} /> Скопировать ссылку</button>
        </div>
      </div>
    </header>

    {message && <div className={`settings-toast ${messageError ? 'error' : ''}`} role={messageError ? 'alert' : 'status'}><span className="settings-toast-text">{message}</span><button aria-label="Закрыть уведомление" onClick={() => setMessage('')}><X size={17} /></button></div>}
    {editing && <form className="profile-editor" onSubmit={save}>
      <h2>О себе</h2>
      <div className="profile-media-edit"><div><strong>Аватар</strong><span>{nextAvatarAt > now ? `Смена после ${new Date(nextAvatarAt).toLocaleString('ru-RU')}` : 'До 20 МБ / 16 Мп · публикация сразу'}</span></div>
        <label className="button button-quiet profile-media-upload">{mediaBusy === 'avatar' ? 'Загружаем…' : 'Выбрать фото'}<input type="file" accept="image/*,.heic,.heif" disabled={Boolean(mediaBusy) || nextAvatarAt > now || preview} onChange={(event) => { selectMedia('avatar', event.target.files?.[0]); event.target.value = ''; }} /></label>
      </div>
      <div className="profile-media-edit"><div><strong>Обложка</strong><span>{nextBannerAt > now ? `Смена после ${new Date(nextBannerAt).toLocaleString('ru-RU')}` : 'До 20 МБ / 24 Мп · публикация сразу'}</span></div>
        <label className="button button-quiet profile-media-upload">{mediaBusy === 'banner' ? 'Загружаем…' : 'Выбрать изображение'}<input type="file" accept="image/*,.heic,.heif" disabled={Boolean(mediaBusy) || nextBannerAt > now || preview} onChange={(event) => { selectMedia('banner', event.target.files?.[0]); event.target.value = ''; }} /></label>
      </div>
      <label>Короткая строка<input maxLength={120} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Например: строю город" disabled={saving} /></label>
      <label>Описание<textarea maxLength={600} rows={4} value={about} onChange={(event) => setAbout(event.target.value)} placeholder="Расскажи о себе" disabled={saving} /></label>
      <div className="profile-editor-actions"><span>{about.length}/600</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></div>
    </form>}

    <nav className="profile-tabs" aria-label="Разделы профиля">
      {([['overview', 'Обзор'], ['posts', 'Записи'], ['comments', 'Комментарии']] as const).map(([value, label]) =>
        <button key={value} className={tab === value ? 'active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}</button>)}
    </nav>

    {tab === 'overview' ? <div className="profile-columns">
      <div className="profile-main-column">
        <section className="profile-section"><h2>{profile.own ? 'Мой Minecraft' : 'Игровой профиль'}</h2>
          {profile.minecraftProfiles?.length ? profile.minecraftProfiles.map(game => <div key={game.serverId} className="profile-game-card"><span className="profile-game-icon"><Gamepad2 size={22} /></span><div><strong>{game.playerName}</strong><p>{game.serverName}</p></div></div>) : <div className="profile-game-card"><span className="profile-game-icon"><Gamepad2 size={22} /></span><div><strong>Minecraft Community</strong><p>Профиль ещё не привязан.</p></div>{profile.own && <button onClick={onLink}>Привязать <ArrowRight size={16} /></button>}</div>}
        </section>
        <section className="profile-section"><div className="profile-section-heading"><h2>Записи</h2><button onClick={() => setTab('posts')}>Все записи <ArrowRight size={15} /></button></div><div className="profile-empty">Записи пока недоступны.</div></section>
        <section className="profile-section"><div className="profile-section-heading"><h2>Комментарии</h2><button onClick={() => setTab('comments')}>Открыть <ArrowRight size={15} /></button></div><div className="profile-empty">Комментарии пока недоступны.</div></section>
      </div>
      <aside className="profile-side-column">
        <section className="profile-section"><h2>О {profile.own ? 'себе' : 'игроке'}</h2><div className="profile-about">{profile.about || (profile.own ? 'Пока пусто. Нажми «Изменить профиль», чтобы рассказать о себе.' : 'Описание ещё не добавлено.')}</div></section>
      </aside>
    </div> : <section className="profile-section profile-tab-panel"><h2>{tab === 'posts' ? 'Записи' : 'Комментарии'}</h2><div className="profile-empty">{tab === 'posts' ? 'Записи пока недоступны.' : 'Комментарии пока недоступны.'}</div></section>}
    {cropSelection && <ImageCropper file={cropSelection.file} kind={cropSelection.kind} onCancel={() => setCropSelection(null)} onApply={(cropped) => { const kind = cropSelection.kind; setCropSelection(null); void uploadMedia(kind, cropped); }} />}
  </div>;
}
