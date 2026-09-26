import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, X } from 'lucide-react';

type Settings = {
  maintenanceEnabled: boolean;
  registrationEnabled: boolean;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpHasPassword: boolean;
  smtpTestedAt: string | null;
  avatarCooldownHours: number;
};

export function SiteAdminSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/site/admin/settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setSettings)
      .catch(() => setMessage({ text: 'Не удалось загрузить настройки сайта.', error: true }));
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => current && { ...current, [key]: value });
    setDirty(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/site/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...(smtpPassword ? { smtpPassword } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить.');
      setSettings(result);
      setSmtpPassword('');
      setDirty(false);
      setMessage({ text: 'Настройки сохранены.', error: false });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Не удалось сохранить.', error: true }); }
    finally { setBusy(false); }
  };

  const testMail = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/site/admin/smtp/test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error('Проверка SMTP не удалась. Проверь адрес, порт и пароль.');
      setSettings((current) => current && { ...current, smtpTestedAt: new Date().toISOString() });
      setMessage({ text: `Письмо отправлено на ${result.sentTo}. Проверь получение.`, error: false });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Проверка не удалась.', error: true }); }
    finally { setBusy(false); }
  };

  return <section className="settings-card site-admin-card">
    <div className="site-admin-heading"><span className="site-admin-icon"><ShieldCheck size={20} /></span><div><h2>Настройки сайта</h2><p>Доступно только администрации.</p></div></div>
    {settings ? <form onSubmit={save}>
      <div className="admin-toggle-list">
        <label><span>Режим обновления</span><input type="checkbox" checked={settings.maintenanceEnabled} onChange={(event) => change('maintenanceEnabled', event.target.checked)} /></label>
        <label><span>Письма</span><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => change('emailEnabled', event.target.checked)} /></label>
        <label><span>Регистрация</span><input type="checkbox" checked={settings.registrationEnabled} onChange={(event) => change('registrationEnabled', event.target.checked)} /></label>
      </div>
      <div className="admin-settings-grid">
        <label>SMTP сервер<input value={settings.smtpHost} onChange={(event) => change('smtpHost', event.target.value)} placeholder="smtp.example.com" maxLength={254} /></label>
        <label>Порт<input type="number" min={1} max={65535} value={settings.smtpPort} onChange={(event) => change('smtpPort', Number(event.target.value))} /></label>
        <label>Логин SMTP<input value={settings.smtpUser} onChange={(event) => change('smtpUser', event.target.value)} maxLength={254} autoComplete="off" /></label>
        <label>Пароль SMTP<input type="password" value={smtpPassword} onChange={(event) => { setSmtpPassword(event.target.value); setDirty(true); }} placeholder={settings.smtpHasPassword ? 'Не изменён' : ''} maxLength={1024} autoComplete="new-password" /></label>
        <label className="admin-grid-wide">Отправитель<input value={settings.smtpFrom} onChange={(event) => change('smtpFrom', event.target.value)} placeholder="Aurum <mail@example.com>" maxLength={254} /></label>
        <label>Смена аватара, часов<input type="number" min={1} max={720} value={settings.avatarCooldownHours} onChange={(event) => change('avatarCooldownHours', Number(event.target.value))} /></label>
      </div>
      <div className="admin-actions"><button type="submit" className="button button-primary" disabled={busy || !dirty}>Сохранить</button><button type="button" className="button button-quiet" disabled={busy || dirty || !settings.smtpHasPassword} onClick={testMail}>Проверить SMTP</button><span className="admin-mail-status">{settings.smtpTestedAt ? 'SMTP проверен' : 'SMTP не проверен'}</span></div>
    </form> : <p>Загружаем…</p>}
    {message && <div className={`settings-toast ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}<button type="button" aria-label="Закрыть" onClick={() => setMessage(null)}><X size={16} /></button></div>}
  </section>;
}
