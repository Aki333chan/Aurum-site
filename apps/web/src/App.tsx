import { useEffect, useState, type FormEvent } from 'react';
import { AuthPage } from './AuthPage';
import { authClient } from './auth-client';
import { SiteAdminSettings } from './SiteAdminSettings';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Compass,
  Gamepad2,
  Home,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Newspaper,
  Settings2,
  ShieldCheck,
  Sun,
  UsersRound,
  X,
} from 'lucide-react';

type Page = 'home' | 'servers' | 'minecraft' | 'guilds' | 'link' | 'profile' | 'settings';

const navigation = [
  { page: 'home', label: 'Главная', icon: Home },
  { page: null, label: 'Сообщения', icon: MessageCircle },
  { page: 'servers', label: 'Серверы', icon: Gamepad2 },
] as const;

function App() {
  const { data: session, isPending } = authClient.useSession();
  const [page, setPage] = useState<Page>('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [lightTheme, setLightTheme] = useState(() => localStorage.getItem('aurum-site-theme') === 'light');
  const [logoutError, setLogoutError] = useState('');
  const [siteMe, setSiteMe] = useState<{ admin: boolean; avatarUpdatedAt: string | null; avatarCooldownHours: number } | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const inMinecraft = page === 'minecraft' || page === 'guilds' || page === 'link';
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');
  const displayName = session?.user.displayUsername || session?.user.username || session?.user.name || 'AurumPlayer';

  useEffect(() => {
    if (!session?.user.id || preview) return;
    let active = true;
    setSiteMe(null);
    setMaintenance(false);
    fetch('/api/site/me', { cache: 'no-store' }).then(async (response) => {
      if (response.status === 503) { if (active) setMaintenance(true); return; }
      if (response.ok && active) { setSiteMe(await response.json()); setMaintenance(false); }
    }).catch(() => {});
    return () => { active = false; };
  }, [session?.user.id, preview]);

  const go = (next: Page) => {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleTheme = () => {
    const next = !lightTheme;
    setLightTheme(next);
    localStorage.setItem('aurum-site-theme', next ? 'light' : 'dark');
  };

  const signOut = async () => {
    const { error } = await authClient.signOut();
    if (error) setLogoutError('Не удалось выйти. Попробуй ещё раз.');
    else window.history.replaceState(null, '', '/login');
  };

  if (isPending && !preview) return <div className={`app ${lightTheme ? 'theme-light' : ''}`}><main className="auth-loading" role="status">Проверяем вход в Aurum…</main></div>;
  if ((!session || maintenance) && !preview) return <div className={`app ${lightTheme ? 'theme-light' : ''}`}><AuthPage lightTheme={lightTheme} toggleTheme={toggleTheme} /></div>;

  return (
    <div className={`app ${lightTheme ? 'theme-light' : ''}`}>
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={() => setMobileNav(true)}>
          <Menu size={20} />
        </button>
        <button className="brand" onClick={() => go('home')} aria-label="Aurum — на главную">
          <span className="brand-mark"><img src="/aurum-logo.png" alt="" /></span>
          <span className="brand-text"><strong>AURUM</strong><small>ИГРОВОЕ СООБЩЕСТВО</small></span>
        </button>
        <div className="topbar-middle"><span className="topbar-label">{page === 'minecraft' ? 'Серверы' : inMinecraft ? 'Minecraft' : 'Сообщество'}</span><span className="topbar-separator">/</span><span>{page === 'link' ? 'Привязка профиля' : page === 'guilds' ? 'Гильдии' : page === 'minecraft' ? 'Minecraft Community' : page === 'servers' ? 'Серверы' : page === 'profile' ? 'Моя страница' : page === 'settings' ? 'Настройки' : 'Главная'}</span></div>
        <span className="preview-tag"><span />Эскиз интерфейса</span>
      </header>

      <div className="shell">
        <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
          <div className="mobile-sidebar-head"><span>Меню</span><button className="icon-button" aria-label="Закрыть меню" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
          <button className={`sidebar-account ${page === 'profile' ? 'active' : ''}`} onClick={() => go('profile')} aria-label={`Открыть мою страницу — ${displayName}`}>
            <Avatar name={displayName} version={siteMe?.avatarUpdatedAt} /><span className="account-copy"><strong>{displayName}</strong><small>Моя страница</small></span>
          </button>
          <nav aria-label="Основная навигация">
            {navigation.map(({ page: target, label, icon: Icon }) => (
              <button key={label} className={`nav-item ${target && (page === target || (target === 'servers' && inMinecraft)) ? 'active' : ''}`} disabled={!target} title={!target ? 'Раздел появится позже' : undefined} onClick={() => target && go(target)}>
                <Icon size={19} strokeWidth={1.8} /><span>{label}</span>{!target && <em>Скоро</em>}{target && (page === target || (target === 'servers' && inMinecraft)) && <span className="active-notch" />}
              </button>
            ))}
            <button className="nav-item" disabled title="Раздел появится позже"><BookOpen size={19} strokeWidth={1.8} /><span>Справка</span><em>Скоро</em></button>
          </nav>
          <div className="sidebar-bottom">
            <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}><Settings2 size={19} strokeWidth={1.8} /><span>Настройки</span></button>
            <button className="nav-item theme-button" aria-label="Светлая тема" aria-pressed={lightTheme} onClick={toggleTheme}>{lightTheme ? <Moon size={19} strokeWidth={1.8} /> : <Sun size={19} strokeWidth={1.8} />}<span>Светлая тема</span><span className={`theme-switch ${lightTheme ? 'on' : ''}`} aria-hidden="true" /></button>
            <button className="nav-item logout-button" onClick={signOut} disabled={preview}><LogOut size={19} strokeWidth={1.8} /><span>Выйти</span></button>
            {logoutError && <p className="sidebar-error" role="alert">{logoutError}</p>}
          </div>
        </aside>

        <main className="content">
          {page === 'link' ? <LinkPage onBack={() => go('minecraft')} /> : page === 'profile' ? <ProfilePage go={go} name={displayName} email={session?.user.email} avatarVersion={siteMe?.avatarUpdatedAt} /> : page === 'settings' ? <SettingsPage siteMe={siteMe} onAvatarUpdate={(avatarUpdatedAt) => setSiteMe((current) => current && { ...current, avatarUpdatedAt })} /> : page === 'guilds' ? <ConceptPage go={go} /> : page === 'minecraft' ? <MinecraftPage go={go} /> : <HomePage page={page} go={go} />}
        </main>
      </div>
      {mobileNav && <button className="nav-scrim" aria-label="Закрыть меню" onClick={() => setMobileNav(false)} />}
    </div>
  );
}

function HomePage({ page, go }: { page: Page; go: (page: Page) => void }) {
  const heading = page === 'servers' ? 'Игровые миры' : 'Главная сообщества';
  const subheading = page === 'servers' ? 'Выбери игру.' : 'Игры и новости.';
  return (
    <>
      <div className="page-intro">
        <div><h1>{heading}</h1><p>{subheading}</p></div>
        <div className="intro-meta"><span className="demo-dot" />Демонстрационные данные</div>
      </div>

      <div className="main-grid">
        <div className="primary-column">
          <section className="section">
            <div className="section-heading"><h2>Игровые миры</h2>{page === 'home' && <button className="text-link" onClick={() => go('servers')}>Все игры <ArrowRight size={16} /></button>}</div>
            <div className="server-card">
              <div className="server-art" aria-hidden="true"><div className="art-halo" /><div className="art-grid" /><div className="art-block block-one" /><div className="art-block block-two" /><div className="art-block block-three" /><div className="art-glow" /></div>
              <div className="server-content">
                <span className="game-label"><span className="game-icon"><Gamepad2 size={16} /></span>MINECRAFT <span className="game-label-line" /> PAPER</span>
                <h3>Minecraft<br />Community</h3>
                <p>Профиль и гильдии.</p>
                <div className="server-actions"><button className="button button-primary" onClick={() => go('minecraft')}>Открыть Minecraft <ArrowRight size={16} /></button><button className="button button-quiet" onClick={() => go('link')}><Link2 size={16} /> Привязать профиль</button></div>
              </div>
              <span className="server-status"><span />Профиль не привязан</span>
            </div>
          </section>

          {page === 'home' && <section className="section lower-section">
            <div className="section-heading"><h2>Лента сообщества</h2></div>
            <article className="news-card"><div className="news-symbol"><Newspaper size={23} strokeWidth={1.6} /></div><div><div className="news-meta">ОБЩИЕ НОВОСТИ <span /> ПРИМЕР ЗАПИСИ</div><h3>Здесь появятся новости сообщества</h3></div></article>
          </section>}
        </div>

        <aside className="right-column">
          <section className="welcome-panel"><div className="panel-icon"><Compass size={22} strokeWidth={1.6} /></div><h2>Все игры —<br />в одном месте</h2><div className="step-list"><div><span>01</span><p>Выбери игру</p></div><div><span>02</span><p>Привяжи профиль</p></div><div><span>03</span><p>Открой свою страницу</p></div></div><button className="panel-link" onClick={() => go('minecraft')}>Посмотреть Minecraft <ArrowRight size={16} /></button></section>
        </aside>
      </div>
    </>
  );
}

function MinecraftPage({ go }: { go: (page: Page) => void }) {
  return <div className="game-page">
    <button className="back-link" onClick={() => go('servers')}><ArrowLeft size={18} /> К игровым мирам</button>
    <div className="page-intro"><div><h1>Minecraft Community</h1><p>Профиль, гильдии, события.</p></div><div className="intro-meta"><span className="demo-dot" />Демонстрационные данные</div></div>
    <MinecraftTabs current="minecraft" go={go} />
    <div className="game-grid">
      <section className="game-profile-card"><span className="game-icon"><Gamepad2 size={17} /></span><h2>Привяжи Minecraft-профиль</h2><p>Здесь появятся игровые данные.</p><button className="button button-primary" onClick={() => go('link')}><Link2 size={17} /> Привязать профиль <ArrowRight size={16} /></button></section>
      <button className="game-guild-card" onClick={() => go('guilds')}><UsersRound size={25} strokeWidth={1.6} /><strong>Гильдии Minecraft</strong><span>Список и состав.</span><span className="game-card-link">Открыть каталог <ArrowRight size={16} /></span></button>
    </div>
    <section className="section lower-section"><div className="section-heading"><h2>Лента Minecraft</h2></div><article className="news-card"><div className="news-symbol"><Newspaper size={23} strokeWidth={1.6} /></div><div><div className="news-meta">MINECRAFT <span /> ПРИМЕР ЗАПИСИ</div><h3>Здесь появятся новости Minecraft</h3></div></article></section>
  </div>;
}

function Avatar({ name, version, large = false }: { name: string; version?: string | null; large?: boolean }) {
  return <span className={`avatar ${large ? 'profile-avatar' : ''}`}>{version ? <img src={`/api/site/me/avatar?v=${encodeURIComponent(version)}`} alt="" /> : name.charAt(0).toUpperCase()}</span>;
}

function ProfilePage({ go, name, email, avatarVersion }: { go: (page: Page) => void; name: string; email?: string; avatarVersion?: string | null }) {
  return <div className="profile-page"><h1>Моя страница</h1><div className="profile-head"><Avatar name={name} version={avatarVersion} large /><div><h2>{name}</h2><span>{email ? `Email: ${email} · виден только тебе` : 'Демонстрационный профиль'}</span></div></div><section className="settings-card"><div><h2>Игровые профили</h2><p>Minecraft пока не привязан.</p></div><button className="button button-primary" onClick={() => go('link')}>Привязать Minecraft <ArrowRight size={16} /></button></section></div>;
}

function LinkPage({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  return <div className="form-page"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> К Minecraft</button><div className="form-layout"><div className="form-hero"><h1>Привяжи Minecraft-профиль</h1><div className="link-steps"><div><span>1</span><p>Зайди на сервер.</p></div><div><span>2</span><p>Напиши <code>/aurumlink</code> или <code>/alink</code>.</p></div><div><span>3</span><p>Введи код из чата здесь.</p></div></div><div className="secure-note"><ShieldCheck size={19} /> Никому не передавай код.</div></div><div className="link-form-card"><span className="form-card-icon"><Link2 size={24} /></span><h2>Код из игры</h2><label htmlFor="link-code">ОДНОРАЗОВЫЙ КОД</label><input id="link-code" autoComplete="off" maxLength={12} value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Например, AB12-CD34" /><button className="button button-primary form-submit" disabled>Привязать профиль <ArrowRight size={17} /></button><p className="form-disclaimer">Привязка пока недоступна.</p></div></div></div>;
}

function MinecraftTabs({ current, go }: { current: 'minecraft' | 'guilds'; go: (page: Page) => void }) {
  return <nav className="game-tabs" aria-label="Разделы Minecraft">
    <button className={current === 'minecraft' ? 'active' : ''} aria-current={current === 'minecraft' ? 'page' : undefined} onClick={() => go('minecraft')}>Обзор</button>
    <button className={current === 'guilds' ? 'active' : ''} aria-current={current === 'guilds' ? 'page' : undefined} onClick={() => go('guilds')}>Гильдии</button>
  </nav>;
}

function ConceptPage({ go }: { go: (page: Page) => void }) {
  return <div className="concept-page"><button className="back-link" onClick={() => go('servers')}><ArrowLeft size={18} /> К игровым мирам</button><h1>Гильдии Minecraft</h1><MinecraftTabs current="guilds" go={go} /><div className="concept-card"><span><UsersRound size={25} /></span><div><strong>Раздел пока в разработке</strong></div></div></div>;
}

function SettingsPage({ siteMe, onAvatarUpdate }: { siteMe: { admin: boolean; avatarUpdatedAt: string | null; avatarCooldownHours: number } | null; onAvatarUpdate: (value: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const nextAvatarAt = siteMe?.avatarUpdatedAt ? Date.parse(siteMe.avatarUpdatedAt) + siteMe.avatarCooldownHours * 3600_000 : 0;
  useEffect(() => {
    if (nextAvatarAt <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [nextAvatarAt, now]);

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_000_000) { setAvatarError(true); return setAvatarMessage('Выбери JPG, PNG или WebP до 2 МБ.'); }
    if (Date.now() < nextAvatarAt) { setAvatarError(true); return setAvatarMessage('Сменить аватар можно после окончания ожидания.'); }
    setAvatarBusy(true);
    setAvatarMessage('');
    try {
      const response = await fetch('/api/site/me/avatar', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      const result = await response.json();
      if (!response.ok) { setAvatarError(true); setAvatarMessage(response.status === 429 ? 'Смена аватара пока недоступна.' : 'Не удалось загрузить изображение.'); }
      else { onAvatarUpdate(result.avatarUpdatedAt); setNow(Date.now()); setAvatarError(false); setAvatarMessage('Аватар обновлён.'); }
    } catch { setAvatarError(true); setAvatarMessage('Не удалось загрузить изображение.'); }
    finally { setAvatarBusy(false); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (newPassword !== confirmation) return setError('Новые пароли не совпадают.');
    if (newPassword.length < 15 || newPassword.length > 128) return setError('Пароль: 15–128 символов.');
    if (newPassword === currentPassword) return setError('Новый пароль должен отличаться от текущего.');
    setBusy(true);
    try {
      const { error: resultError } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (resultError) setError(resultError.status === 429 ? 'Слишком много попыток. Подожди и попробуй снова.' : 'Не удалось сменить пароль. Проверь текущий пароль.');
      else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmation('');
        setNotice('Пароль изменён. Другие сеансы завершены.');
      }
    } catch {
      setError('Не удалось связаться с сервисом. Попробуй позже.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="settings-page">
    <h1>Настройки</h1>
    {siteMe?.admin && <SiteAdminSettings />}
    <section className="settings-card avatar-settings">
      <div><h2>Аватар</h2><p>{nextAvatarAt > now ? `Следующая смена: ${new Date(nextAvatarAt).toLocaleString('ru-RU')}` : 'JPG, PNG или WebP · до 2 МБ'}</p></div>
      <label className="button button-quiet avatar-upload">{avatarBusy ? 'Загружаем…' : 'Выбрать фото'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy || nextAvatarAt > now} onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {avatarMessage && <p className={`avatar-feedback ${avatarError ? 'error' : ''}`} role={avatarError ? 'alert' : 'status'}>{avatarMessage}</p>}
    </section>
    <section className="settings-card settings-password">
      <h2>Смена пароля</h2>
      <form onSubmit={changePassword}>
        <label>Текущий пароль<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(''); }} required disabled={busy} /></label>
        <label>Новый пароль<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(''); }} required disabled={busy} /></label>
        <label>Повтори новый пароль<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} required disabled={busy} /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сменить пароль'}</button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
    </section>
  </div>;
}

export default App;
