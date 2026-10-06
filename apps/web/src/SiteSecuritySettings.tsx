import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { authClient } from './auth-client';
import { api, Dialog, errorText, jsonBody, useNotice } from './site-api';
import type { MinecraftState } from './MinecraftLinkPage';

type SiteUser = {
  id: string;
  username: string;
  displayName: string;
  verified: boolean;
  role: 'owner' | 'admin' | 'player';
};
type UserPage = { users: SiteUser[]; more: boolean; offset: number };
const roles = { owner: 'Владелец', admin: 'Администратор', player: 'Игрок' };

export function OwnerRoles() {
  const [page, setPage] = useState<UserPage | null>(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<SiteUser | null>(null),
    [password, setPassword] = useState('');
  const notice = useNotice();
  const load = useCallback(async (offset = 0, q = '') => {
    setBusy(true);
    setError('');
    try {
      setPage(
        await api<UserPage>(`/api/site/admin/users?${new URLSearchParams({ q, offset: String(offset) })}`),
      );
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(
        '/api/site/admin/users',
        jsonBody({ userId: selected.id, admin: selected.role !== 'admin', password }, 'PUT'),
      );
      setSelected(null);
      setPassword('');
      await load(page?.offset || 0, query);
      notice.show('Роль обновлена.');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card settings-stack owner-roles">
      <h2>Пользователи и роли</h2>
      {notice.element}
      <form
        className="compact-search"
        onSubmit={(event) => {
          event.preventDefault();
          void load(0, query);
        }}
      >
        <label>
          Ник
          <input
            type="search"
            value={query}
            maxLength={20}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти пользователя"
          />
        </label>
        <button className="button button-quiet" disabled={busy}>
          Найти
        </button>
      </form>
      {error && !selected && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <ul className="social-rows">
        {page?.users.map((user) => (
          <li key={user.id}>
            <div>
              <strong>{user.displayName || user.username}</strong>
              <small>
                {roles[user.role]}
                {!user.verified ? ' · почта не подтверждена' : ''}
              </small>
            </div>
            {user.role === 'owner' ? (
              <ShieldCheck size={19} aria-label="Защищённый владелец" />
            ) : (
              <button
                className="button button-quiet"
                disabled={busy || !user.verified}
                onClick={() => {
                  setSelected(user);
                  setPassword('');
                  setError('');
                }}
              >
                {user.role === 'admin' ? 'Снять админку' : 'Назначить админом'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!page && busy && <p role="status">Загружаем…</p>}
      {page && !page.users.length && <p className="profile-empty">Пользователь не найден.</p>}
      <div className="form-actions">
        {(page?.offset || 0) > 0 && (
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => void load(Math.max(0, (page?.offset || 0) - 25), query)}
          >
            Назад
          </button>
        )}
        {page?.more && (
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => void load(page.offset + 25, query)}
          >
            Далее
          </button>
        )}
      </div>
      {selected && (
        <Dialog
          title={selected.role === 'admin' ? 'Снять админку?' : 'Назначить администратором?'}
          onClose={() => {
            setSelected(null);
            setPassword('');
            setError('');
          }}
        >
          <p>{selected.username}</p>
          <form onSubmit={update}>
            <label>
              Твой пароль
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={busy}
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setPassword('');
                }}
              >
                Отмена
              </button>
              <button className="button button-primary" disabled={busy || !password}>
                {busy ? 'Сохраняем…' : 'Подтвердить'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}

type Privacy = { profile: string; comments: string; messages: string; statistics: string };
const choices = [
  ['ALL', 'Все пользователи'],
  ['FRIENDS', 'Друзья'],
] as const;
export function PrivacySettings({ minecraft }: { minecraft: MinecraftState | null }) {
  const [scope, setScope] = useState('global'),
    [settings, setSettings] = useState<Privacy | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  useEffect(() => {
    const controller = new AbortController();
    setSettings(null);
    setError('');
    void api<Privacy>(`/api/site/privacy?scope=${encodeURIComponent(scope)}`, { signal: controller.signal })
      .then(setSettings)
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error));
      });
    return () => controller.abort();
  }, [scope]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    try {
      await api('/api/site/privacy?scope=' + encodeURIComponent(scope), jsonBody(settings, 'PUT'));
      notice.show('Приватность сохранена.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card settings-stack">
      <h2>Приватность</h2>
      {notice.element}
      <label className="scope-select">
        Профиль
        <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={busy}>
          <option value="global">Aurum</option>
          {minecraft?.profiles.map((profile) => (
            <option key={profile.serverId} value={`minecraft:${profile.serverId}`}>
              {profile.serverName} · {profile.playerName}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {settings ? (
        <form className="privacy-form" onSubmit={save}>
          {(
            [
              ['profile', 'Просмотр профиля'],
              ['comments', 'Комментарии'],
              ['messages', 'Личные сообщения'],
              ['statistics', 'Баланс и статистика'],
            ] as const
          )
            .filter(([key]) => (scope === 'global' ? key !== 'statistics' : key !== 'messages'))
            .map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={settings[key]}
                  disabled={busy}
                  onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                >
                  {choices.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                  <option value={key === 'profile' || key === 'statistics' ? 'PRIVATE' : 'OFF'}>
                    {key === 'profile' || key === 'statistics' ? 'Только мне' : 'Выключено'}
                  </option>
                </select>
              </label>
            ))}
          <button className="button button-primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      ) : (
        !error && <p role="status">Загружаем…</p>
      )}
    </section>
  );
}

export function TwoFactorSettings() {
  const { data: session } = authClient.useSession();
  const enabled = !!session?.user.twoFactorEnabled;
  const [password, setPassword] = useState(''),
    [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null),
    [code, setCode] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (setup) {
        const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
        if (result.error) throw new Error('Проверь шестизначный код.');
        setSetup(null);
        setCode('');
        setSaved(false);
        await authClient.getSession();
        notice.show('2FA включена.');
      } else if (enabled) {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) throw new Error('Проверь пароль.');
        setPassword('');
        await authClient.getSession();
        notice.show('2FA выключена.');
      } else {
        const result = await authClient.twoFactor.enable({ password, method: 'totp' });
        if (result.error || !result.data || !('totpURI' in result.data)) throw new Error('Проверь пароль.');
        setSetup({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes });
        setPassword('');
        setSaved(false);
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notice.show('Скопировано.');
    } catch {
      notice.show('Не удалось скопировать. Выдели текст вручную.', true);
    }
  };
  const secret = setup ? new URL(setup.totpURI).searchParams.get('secret') || '' : '';
  return (
    <section className="settings-card settings-stack">
      <h2>Двухфакторная защита</h2>
      {notice.element}
      <p className="setting-status">{enabled ? 'Включена' : 'Не включена · необязательно'}</p>
      <form onSubmit={submit}>
        {setup ? (
          <>
            <label>
              Ключ для приложения-аутентификатора
              <input readOnly value={secret} className="totp-secret" />
            </label>
            <button className="button button-quiet" type="button" onClick={() => void copy(secret)}>
              <Copy size={15} />
              Скопировать ключ
            </button>
            <h3>Резервные коды</h3>
            <p className="short-hint">Сохрани вне сайта. Каждый код работает один раз.</p>
            <div className="backup-codes">
              {setup.backupCodes.map((value) => (
                <code key={value}>{value}</code>
              ))}
            </div>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => void copy(setup.backupCodes.join('\n'))}
            >
              <Copy size={15} />
              Скопировать коды
            </button>
            <label className="checkbox-row">
              <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />Я
              сохранил резервные коды
            </label>
            <label>
              Код из приложения
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </label>
          </>
        ) : (
          <label>
            Текущий пароль
            <input
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          disabled={busy || (setup ? !saved || code.length !== 6 : !password)}
        >
          {busy
            ? 'Подождите…'
            : setup
              ? 'Подтвердить и включить'
              : enabled
                ? 'Выключить 2FA'
                : 'Настроить 2FA'}
        </button>
      </form>
    </section>
  );
}

type Report = {
  id: string;
  contentId: string | null;
  reason: string;
  body: string | null;
  reporter: string;
  author: string;
  scope: string;
  createdAt: string;
};
export function ModerationQueue() {
  const [reports, setReports] = useState<Report[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState<Report | null>(null);
  const notice = useNotice();
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setReports((await api<{ reports: Report[] }>('/api/site/admin/reports')).reports);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (report: Report, remove = false) => {
    setBusy(true);
    try {
      if (remove && report.contentId)
        await api(`/api/site/content/${report.contentId}`, { method: 'DELETE' });
      await api(`/api/site/admin/reports/${report.id}`, jsonBody({}, 'PUT'));
      setDeleting(null);
      await load();
      notice.show(remove ? 'Запись удалена.' : 'Жалоба закрыта.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card settings-stack">
      <div className="profile-section-heading">
        <h2>Жалобы</h2>
        <button className="button button-quiet" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      {notice.element}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {!busy && !reports.length && !error && <p className="profile-empty">Нет открытых жалоб.</p>}
      {reports.map((report) => (
        <article className="moderation-row" key={report.id}>
          <strong>
            {report.reporter} → {report.author || 'Удалённая запись'}
          </strong>
          <p>{report.reason}</p>
          {report.body && <blockquote>{report.body}</blockquote>}
          <div className="form-actions">
            <button className="button button-quiet" disabled={busy} onClick={() => void act(report)}>
              Закрыть жалобу
            </button>
            {report.contentId && (
              <button className="button button-quiet" disabled={busy} onClick={() => setDeleting(report)}>
                Удалить запись
              </button>
            )}
          </div>
        </article>
      ))}
      {deleting && (
        <Dialog title="Удалить запись по жалобе?" onClose={() => setDeleting(null)}>
          {notice.element}
          <p>Комментарии тоже будут удалены.</p>
          <button className="button button-primary" disabled={busy} onClick={() => void act(deleting, true)}>
            Удалить
          </button>
        </Dialog>
      )}
    </section>
  );
}
