import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Gamepad2, Link2, Moon, ShieldCheck, Sun } from 'lucide-react';
import { authClient } from './auth-client';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

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
  return 'Сервис авторизации сейчас недоступен или запрос не удался. Попробуй позже.';
}

export function AuthPage({ lightTheme, toggleTheme }: { lightTheme: boolean; toggleTheme: () => void }) {
  const [mode, setMode] = useState<Mode>(modeFromPath);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    if ((mode === 'register' || mode === 'reset') && password !== confirmation) {
      setError('Пароли не совпадают. Проверь оба поля.');
      return;
    }
    if ((mode === 'register' || mode === 'reset') && (password.length < 15 || password.length > 128)) {
      setError('Пароль должен содержать от 15 до 128 символов.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const { error: resultError } = await authClient.signUp.email({ name: 'Игрок', email, password, callbackURL: '/login?verified=1' });
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
  const description = {
    login: 'Войди, чтобы открыть свой профиль и пространство Minecraft.',
    register: 'Укажи email и придумай пароль. Для завершения регистрации подтверди адрес по ссылке из письма.',
    verify: 'Мы отправили ссылку для подтверждения email. После перехода по ней ты сможешь войти.',
    forgot: 'Введи email аккаунта — мы отправим ссылку для смены пароля.',
    reset: 'Придумай новый пароль для аккаунта Aurum.',
  }[mode];
  const verified = mode === 'login' && new URLSearchParams(window.location.search).has('verified');

  return <div className="auth-page">
    <header className="auth-header">
      <div className="auth-brand"><img src="/aurum-logo.png" alt="" /><span><strong>AURUM</strong><small>ИГРОВОЕ СООБЩЕСТВО</small></span></div>
      <button type="button" className="auth-theme" onClick={toggleTheme} aria-pressed={lightTheme}>{lightTheme ? <Moon size={18} /> : <Sun size={18} />}{lightTheme ? 'Тёмная тема' : 'Светлая тема'}</button>
    </header>
    <main className="auth-main">
      <section className="auth-intro" aria-label="О проекте Aurum">
        <h1>Твоё место<br />в Aurum.</h1>
        <span className="auth-game"><Gamepad2 size={17} /> Minecraft Community</span>
        <p>Один аккаунт для сообщества и твоего Minecraft-профиля. Здесь появятся новости, гильдии и твоя игровая история.</p>
        <div className="auth-next"><Link2 size={19} /><span>Игровой профиль привяжешь позже через одноразовый код <strong>/aurumlink</strong> — отдельно от регистрации на сайте.</span></div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <h2 id="auth-title">{title}</h2>
        <p className="auth-description">{description}</p>
        {verified && <p className="auth-notice" role="status">После подтверждения email войди в аккаунт.</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        <form onSubmit={submit}>
          {mode !== 'reset' && <label className="auth-field">Email<input type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={busy} /></label>}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && <label className="auth-field">{mode === 'reset' ? 'Новый пароль' : 'Пароль'}<span className="auth-password"><input type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 15} maxLength={128} required disabled={busy} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>}
          {(mode === 'register' || mode === 'reset') && <><label className="auth-field">Подтверди пароль<input type={showPassword ? 'text' : 'password'} name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required disabled={busy} /></label><p className="auth-hint"><ShieldCheck size={15} /> От 15 до 128 символов. Можно использовать длинную фразу и менеджер паролей.</p></>}
          {mode === 'login' && <button type="button" className="auth-inline-link auth-forgot" onClick={() => navigate('forgot')}>Забыл пароль?</button>}
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Зарегистрироваться' : mode === 'verify' ? 'Отправить письмо ещё раз' : mode === 'forgot' ? 'Отправить ссылку' : 'Сменить пароль'}{!busy && <ArrowRight size={18} />}</button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? <>Нет аккаунта? <button type="button" onClick={() => navigate('register')}>Зарегистрируйтесь</button></> : mode === 'register' ? <>Уже есть аккаунт? <button type="button" onClick={() => navigate('login')}>Войти</button></> : <button type="button" onClick={() => navigate('login')}>Вернуться ко входу</button>}
        </div>
      </section>
    </main>
    <footer className="auth-footer">Aurum Site · Сначала Minecraft. Это ранняя версия сайта; остальные разделы добавляются поэтапно.</footer>
  </div>;
}
