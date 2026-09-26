import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Gamepad2, Moon, Sun } from 'lucide-react';
import { authClient } from './auth-client';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
type SiteConfig = { registrationEnabled: boolean; emailEnabled: boolean };

function modeFromPath(): Mode {
  const path = window.location.pathname;
  if (path === '/register') return 'register';
  if (path === '/verify-email') return 'verify';
  if (path === '/forgot-password') return 'forgot';
  if (path === '/reset-password') return 'reset';
  return 'login';
}

function errorMessage(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return 'Не удалось выполнить действие. Попробуй ещё раз.';
  if (error.status === 429) return 'Слишком много попыток. Подожди немного и попробуй снова.';
  if (error.code === 'EMAIL_NOT_VERIFIED') return 'Подтверди email по ссылке из письма, затем войди.';
  if (error.code === 'INVALID_EMAIL_OR_PASSWORD') return 'Неверный email или пароль.';
  if (error.code?.includes('USERNAME')) return 'Ник занят или недопустим.';
  return 'Сервис авторизации сейчас недоступен или запрос не удался. Попробуй позже.';
}

export function AuthPage({ lightTheme, toggleTheme }: { lightTheme: boolean; toggleTheme: () => void }) {
  const [mode, setMode] = useState<Mode>(modeFromPath);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [notice, setNotice] = useState('');
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/site/config', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((value: SiteConfig) => {
        if (typeof value.registrationEnabled !== 'boolean' || typeof value.emailEnabled !== 'boolean') throw new Error('Invalid site config');
        if (active) setSiteConfig(value);
      })
      .catch(() => { if (active) { setConfigError(true); setSiteConfig({ registrationEnabled: false, emailEnabled: false }); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const navigate = (next: Mode) => {
    const path = { login: '/login', register: '/register', verify: '/verify-email', forgot: '/forgot-password', reset: '/reset-password' }[next];
    window.history.pushState(null, '', path);
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Проверь email.');
      return;
    }
    if (mode === 'register' && !/^[A-Za-z0-9_]{3,20}$/.test(nickname)) {
      setError('Ник: 3–20 латинских букв, цифр или _.');
      return;
    }
    if ((mode === 'register' || mode === 'reset') && password !== confirmation) {
      setError('Пароли не совпадают. Проверь оба поля.');
      return;
    }
    if ((mode === 'register' || mode === 'reset') && (password.length < 15 || password.length > 128)) {
      setError('Пароль: 15–128 символов.');
      return;
    }
    if (mode === 'login' && !password) {
      setError('Введи пароль.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const { error: resultError } = await authClient.signUp.email({ name: nickname, username: nickname, email, password, callbackURL: '/login?verified=1' });
        if (resultError) setError(errorMessage(resultError));
        else navigate('verify');
      } else if (mode === 'login') {
        const { error: resultError } = await authClient.signIn.email({ email, password });
        if (resultError) setError(errorMessage(resultError));
        else window.history.replaceState(null, '', '/');
      } else if (mode === 'verify') {
        const { error: resultError } = await authClient.sendVerificationEmail({ email, callbackURL: '/login?verified=1' });
        if (resultError && (!resultError.status || resultError.status === 429 || resultError.status >= 500)) setError(errorMessage(resultError));
        else setNotice('Если адрес зарегистрирован, новое письмо отправлено. Проверь также папку «Спам».');
      } else if (mode === 'forgot') {
        const { error: resultError } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
        if (resultError && (!resultError.status || resultError.status === 429 || resultError.status >= 500)) setError(errorMessage(resultError));
        else setNotice('Если такой email зарегистрирован, мы отправили ссылку для сброса пароля.');
      } else {
        const token = new URLSearchParams(window.location.search).get('token');
        if (!token) setError('Ссылка для сброса недействительна. Запроси новую.');
        else {
          const { error: resultError } = await authClient.resetPassword({ newPassword: password, token });
          if (resultError) setError('Не удалось сменить пароль. Возможно, срок ссылки истёк — запроси новую.');
          else {
            navigate('login');
            setNotice('Пароль обновлён. Теперь войди с новым паролем.');
          }
        }
      }
    } catch {
      setError('Не удалось связаться с сервисом авторизации. Попробуй позже.');
    } finally {
      setBusy(false);
    }
  };

  const title = { login: 'С возвращением', register: 'Создать аккаунт', verify: 'Проверь почту', forgot: 'Восстановить доступ', reset: 'Новый пароль' }[mode];
  const verified = mode === 'login' && new URLSearchParams(window.location.search).has('verified');
  const unavailable = mode === 'register' && !siteConfig?.registrationEnabled
    ? 'Регистрация пока закрыта.'
    : (mode === 'verify' || mode === 'forgot') && !siteConfig?.emailEnabled
      ? 'Почта пока не настроена.'
      : '';

  return <div className="auth-page">
    <header className="auth-header">
      <div className="auth-brand"><img src="/aurum-logo.png" alt="" /><span><strong>AURUM</strong><small>ИГРОВОЕ СООБЩЕСТВО</small></span></div>
      <button type="button" className="auth-theme" onClick={toggleTheme} aria-pressed={lightTheme}>{lightTheme ? <Moon size={18} /> : <Sun size={18} />}{lightTheme ? 'Тёмная тема' : 'Светлая тема'}</button>
    </header>
    <main className="auth-main">
      <section className="auth-intro" aria-label="О проекте Aurum">
        <h1>Твоё место<br />в Aurum.</h1>
        <span className="auth-game"><Gamepad2 size={17} /> Minecraft Community</span>
        <p>Новости, гильдии и игровые профили в одном месте.</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <h2 id="auth-title">{title}</h2>
        {verified && <p className="auth-notice" role="status">После подтверждения email войди в аккаунт.</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
        {configError && mode === 'login' && <p className="auth-error" role="alert">Сервис входа сейчас недоступен. Попробуй позже.</p>}
        {unavailable && <p className="auth-unavailable" role="status">{configError ? 'Не удалось связаться с сервисом. Попробуй позже.' : siteConfig ? unavailable : 'Проверяем доступность сервиса…'}</p>}

        {!unavailable && <form onSubmit={submit} noValidate>
          {mode !== 'reset' && <label className="auth-field">Email<input type="email" name="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={busy} /></label>}
          {mode === 'register' && <label className="auth-field">Ник на сайте<input type="text" name="nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); setError(''); }} autoComplete="nickname" placeholder="Player123" maxLength={20} required disabled={busy} /></label>}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && <label className="auth-field">{mode === 'reset' ? 'Новый пароль' : 'Пароль'}<span className="auth-password"><input type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} required disabled={busy} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>}
          {(mode === 'register' || mode === 'reset') && <label className="auth-field">Подтверди пароль<input type={showPassword ? 'text' : 'password'} name="confirmation" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} autoComplete="new-password" required disabled={busy} /></label>}
          {mode === 'login' && siteConfig?.emailEnabled && <button type="button" className="auth-inline-link auth-forgot" onClick={() => navigate('forgot')}>Забыл пароль?</button>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Зарегистрироваться' : mode === 'verify' ? 'Отправить письмо ещё раз' : mode === 'forgot' ? 'Отправить ссылку' : 'Сменить пароль'}{!busy && <ArrowRight size={18} />}</button>
        </form>}

        <div className="auth-switch">
          {mode === 'login' ? <>Нет аккаунта? <button type="button" onClick={() => navigate('register')}>Зарегистрируйтесь</button></> : mode === 'register' ? <>Уже есть аккаунт? <button type="button" onClick={() => navigate('login')}>Войти</button></> : <button type="button" onClick={() => navigate('login')}>Вернуться ко входу</button>}
        </div>
      </section>
    </main>
  </div>;
}
