import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Gamepad2,
  HeartHandshake,
  Home,
  Link2,
  Menu,
  MessageCircle,
  Newspaper,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';

type Page = 'home' | 'servers' | 'guilds' | 'news' | 'link' | 'settings';

const navigation = [
  { page: 'home', label: 'Главная', icon: Home },
  { page: 'servers', label: 'Серверы', icon: Gamepad2 },
  { page: 'guilds', label: 'Гильдии', icon: UsersRound },
  { page: 'news', label: 'Новости', icon: Newspaper },
] as const;

const secondary = [
  { label: 'Сообщения', icon: MessageCircle },
  { label: 'Справка', icon: BookOpen },
] as const;

function App() {
  const [page, setPage] = useState<Page>('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);

  const go = (next: Page) => {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
        <div className="topbar-middle"><span className="topbar-label">Сообщество</span><span className="topbar-separator">/</span><span>{page === 'link' ? 'Привязка профиля' : page === 'guilds' ? 'Гильдии' : page === 'news' ? 'Новости' : page === 'servers' ? 'Серверы' : page === 'settings' ? 'Настройки' : 'Главная'}</span></div>
        <div className="topbar-actions">
          <span className="preview-tag"><span />Эскиз интерфейса</span>
          <button className="icon-button desktop-only" aria-label="Поиск — в разработке" title="Поиск появится позже" disabled><Search size={19} /></button>
          <button className="icon-button desktop-only" aria-label="Уведомления — в разработке" title="Уведомления появятся позже" disabled><Bell size={19} /></button>
          <button className="user-button" onClick={() => go('settings')}><span className="avatar">A</span><span>Мой аккаунт</span><ChevronDown size={16} /></button>
        </div>
      </header>

      <div className="shell">
        <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
          <div className="mobile-sidebar-head"><span>Меню</span><button className="icon-button" aria-label="Закрыть меню" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
          <div className="nav-group-label">ПРОСТРАНСТВО</div>
          <nav aria-label="Основная навигация">
            {navigation.map(({ page: target, label, icon: Icon }) => (
              <button key={target} className={`nav-item ${page === target ? 'active' : ''}`} onClick={() => go(target)}>
                <Icon size={19} strokeWidth={1.8} /><span>{label}</span>{page === target && <span className="active-notch" />}
              </button>
            ))}
          </nav>
          <div className="nav-divider" />
          <div className="nav-group-label">ОБЩЕНИЕ И ПОМОЩЬ</div>
          <nav aria-label="Дополнительная навигация">
            {secondary.map(({ label, icon: Icon }) => (
              <button key={label} className="nav-item" disabled title="Раздел появится позже">
                <Icon size={19} strokeWidth={1.8} /><span>{label}</span>{label === 'Сообщения' && <em>Скоро</em>}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-note"><Sparkles size={18} /><span>Все игровые миры<br />под одной учётной записью</span></div>
            <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}><Settings2 size={19} strokeWidth={1.8} /><span>Настройки</span></button>
          </div>
        </aside>

        <main className="content">
          {page === 'link' ? <LinkPage onBack={() => go('home')} /> : page === 'settings' ? <SettingsPage lightTheme={lightTheme} onThemeChange={setLightTheme} /> : page === 'guilds' || page === 'news' ? <ConceptPage page={page} onBack={() => go('home')} /> : <HomePage page={page} go={go} />}
        </main>
      </div>
      {mobileNav && <button className="nav-scrim" aria-label="Закрыть меню" onClick={() => setMobileNav(false)} />}
    </div>
  );
}

function HomePage({ page, go }: { page: Page; go: (page: Page) => void }) {
  const heading = page === 'guilds' ? 'Гильдии сообщества' : page === 'news' ? 'Новости мира Aurum' : page === 'servers' ? 'Игровые серверы' : 'Добро пожаловать в Aurum';
  const subheading = page === 'guilds' ? 'Найди своё сообщество или загляни к уже знакомым игрокам.' : page === 'news' ? 'Важные события и обновления всех игровых миров в одном месте.' : 'Начни с сервера: открой свой игровой профиль, новости и сообщество.';
  return (
    <>
      <div className="page-intro">
        <div><div className="eyebrow"><span className="eyebrow-line" />ТВОЁ ПРОСТРАНСТВО</div><h1>{heading}</h1><p>{subheading}</p></div>
        <div className="intro-meta"><span className="demo-dot" />Демонстрационные данные</div>
      </div>

      <div className="main-grid">
        <div className="primary-column">
          <section className="section">
            <div className="section-heading"><div><span className="section-kicker">01 / ИГРА</span><h2>Твои серверы</h2></div><button className="text-link" onClick={() => go('servers')}>Все серверы <ArrowRight size={16} /></button></div>
            <div className="server-card">
              <div className="server-art" aria-hidden="true"><div className="art-halo" /><div className="art-grid" /><div className="art-block block-one" /><div className="art-block block-two" /><div className="art-block block-three" /><div className="art-glow" /></div>
              <div className="server-content">
                <span className="game-label"><span className="game-icon"><Gamepad2 size={16} /></span>MINECRAFT <span className="game-label-line" /> PAPER</span>
                <h3>Minecraft<br />Community</h3>
                <p>Мир, гильдии и твоя история игры — в одном профиле.</p>
                <div className="server-actions"><button className="button button-primary" onClick={() => go('link')}><Link2 size={17} /> Привязать профиль <ArrowRight size={16} /></button><button className="button button-quiet" disabled title="Страница сервера появится после подключения данных">О сервере</button></div>
              </div>
              <span className="server-status"><span />Профиль не привязан</span>
            </div>
          </section>

          <section className="section lower-section">
            <div className="section-heading"><div><span className="section-kicker">02 / СОБЫТИЯ</span><h2>Что нового</h2></div><button className="text-link" onClick={() => go('news')}>Все новости <ArrowRight size={16} /></button></div>
            <article className="news-card"><div className="news-symbol"><Newspaper size={23} strokeWidth={1.6} /></div><div><div className="news-meta">НОВОСТИ СЕРВЕРА <span /> ПРИМЕР ЗАПИСИ</div><h3>Здесь появятся новости игрового мира</h3><p>Обновления, события и важные объявления будут видны сразу после входа.</p></div><ArrowRight className="news-arrow" size={19} /></article>
          </section>
        </div>

        <aside className="right-column">
          <section className="welcome-panel"><div className="panel-icon"><Compass size={22} strokeWidth={1.6} /></div><span className="right-eyebrow">БЫСТРЫЙ СТАРТ</span><h2>Твой путь<br />начинается здесь</h2><p>Свяжи аккаунт сайта с персонажем, чтобы открыть свой профиль и игровые возможности.</p><div className="step-list"><div><span>01</span><p>Войди на игровой сервер</p></div><div><span>02</span><p>Введи команду <code>/aurumlink</code></p></div><div><span>03</span><p>Вставь код на сайте</p></div></div><button className="panel-link" onClick={() => go('link')}>Как привязать профиль <ArrowRight size={16} /></button></section>
          <section className="guild-panel"><div className="guild-top"><span className="guild-icon"><UsersRound size={21} /></span><ArrowRight size={18} /></div><span className="right-eyebrow">СООБЩЕСТВО</span><h2>Гильдии</h2><p>Смотри список гильдий, знакомься с участниками и следи за их событиями.</p><button className="guild-link" onClick={() => go('guilds')}>Открыть каталог <ArrowRight size={16} /></button></section>
        </aside>
      </div>
      <div className="footer-note"><span>AURUM</span> · Эскиз главной страницы. Содержимое и действия до подключения API — демонстрационные.</div>
    </>
  );
}

function LinkPage({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  return <div className="form-page"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> К серверам</button><div className="form-layout"><div className="form-hero"><div className="eyebrow"><span className="eyebrow-line" />СВЯЗЬ С ИГРОЙ</div><h1>Привяжи Minecraft-профиль</h1><p>Сайт узнает, какой персонаж твой, только после подтверждения в игре. Один аккаунт сайта сможет хранить профили разных игр.</p><div className="link-steps"><div><span>1</span><p>Зайди на сервер и авторизуйся в игре.</p></div><div><span>2</span><p>Напиши <code>/aurumlink</code> или <code>/alink</code>.</p></div><div><span>3</span><p>Скопируй одноразовый код из чата и введи его здесь.</p></div></div><div className="secure-note"><ShieldCheck size={19} /> Код одноразовый и действует ограниченное время. Никому его не передавай.</div></div><div className="link-form-card"><span className="form-card-icon"><Link2 size={24} /></span><h2>Введи код из игры</h2><p>После подтверждения откроется твой Minecraft-профиль.</p><label htmlFor="link-code">ОДНОРАЗОВЫЙ КОД</label><input id="link-code" autoComplete="off" maxLength={12} value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Например, AB12-CD34" /><button className="button button-primary form-submit" disabled>Привязать профиль <ArrowRight size={17} /></button><p className="form-disclaimer">Это визуальный прототип. Проверка кода будет доступна после подключения защищённого API.</p></div></div></div>;
}

function ConceptPage({ page, onBack }: { page: 'guilds' | 'news'; onBack: () => void }) {
  const isGuilds = page === 'guilds';
  const Icon = isGuilds ? UsersRound : Newspaper;
  return <div className="concept-page"><button className="back-link" onClick={onBack}><ArrowLeft size={18} /> На главную</button><div className="eyebrow"><span className="eyebrow-line" />{isGuilds ? 'СООБЩЕСТВО' : 'СОБЫТИЯ'}</div><h1>{isGuilds ? 'Каталог гильдий' : 'Новости Aurum'}</h1><p>{isGuilds ? 'Здесь появится список всех гильдий Minecraft, поиск и доступные тебе действия — с учётом приватности каждой гильдии.' : 'Здесь будут объявления сервера и события сообщества, опубликованные командой Aurum.'}</p><div className="concept-card"><span><Icon size={25} /></span><div><strong>Раздел пока в разработке</strong><p>Это эскиз внешнего вида. Реальные данные и действия появятся после подключения защищённого API.</p></div></div></div>;
}

function SettingsPage({ lightTheme, onThemeChange }: { lightTheme: boolean; onThemeChange: (value: boolean) => void }) {
  return <div className="settings-page"><div className="eyebrow"><span className="eyebrow-line" />ПЕРСОНАЛИЗАЦИЯ</div><h1>Настройки</h1><p>Параметры внешнего вида этого эскиза. Настройки аккаунта и приватности появятся после подключения сайта.</p><div className="settings-card"><div><h2>Тема интерфейса</h2><p>Выбери, как выглядит твоё пространство Aurum.</p></div><div className="theme-options"><button className={!lightTheme ? 'selected' : ''} onClick={() => onThemeChange(false)}>Тёмная {!lightTheme && <Check size={16} />}</button><button className={lightTheme ? 'selected' : ''} onClick={() => onThemeChange(true)}>Светлая {lightTheme && <Check size={16} />}</button></div></div><div className="settings-card muted-setting"><div><h2>Профиль и приватность</h2><p>Позже здесь можно будет управлять видимостью игровых данных, комментариями и защитой аккаунта.</p></div><ExternalLink size={18} /></div><div className="settings-card muted-setting"><div><h2>Связанные игры</h2><p>Просмотр и управление привязанными игровыми профилями.</p></div><HeartHandshake size={19} /></div></div>;
}

export default App;
