import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Link2, ShieldCheck, X } from 'lucide-react';

export type MinecraftProfile = { serverId: string; serverName: string; playerName: string; playerUuid?: string; linkedAt: string };
export type MinecraftState = { available: boolean; servers: { id: string; name: string }[]; profiles: MinecraftProfile[]; error?: string };

export function MinecraftLinkPage({ state, reload, onBack }: {
  state: MinecraftState | null;
  reload: () => Promise<MinecraftState>;
  onBack: () => void;
}) {
  const [entry] = useState(() => {
    const url = new URL(window.location.href);
    const code = new URLSearchParams(url.hash.slice(1)).get('code') || '';
    return { code: code.slice(0, 24), serverId: url.searchParams.get('server') || '' };
  });
  const [code, setCode] = useState(entry.code);
  const [serverId, setServerId] = useState(entry.serverId);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [saved, setSaved] = useState<MinecraftProfile | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const selected = serverId || state?.servers[0]?.id || state?.profiles[0]?.serverId || '';
  const profile = saved || state?.profiles.find(item => item.serverId === selected);
  const serverValid = state?.servers.some(item => item.id === selected);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (new URLSearchParams(url.hash.slice(1)).has('code')) {
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || profile || !serverValid) return;
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(normalized)) {
      setMessage({ text: 'Введи 8 символов из команды /aurumlink.', error: true });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/site/minecraft/link', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serverId: selected, code: normalized }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось привязать профиль.');
      setSaved(result.profile);
      setCode('');
      setMessage({ text: 'Minecraft-профиль привязан.', error: false });
      await reload().catch(() => undefined);
    } catch (error) {
      // Do not replay a POST if its response was lost. Read authoritative state.
      const current = await reload().catch(() => null);
      const linked = current?.profiles.find(item => item.serverId === selected);
      if (linked) { setSaved(linked); setCode(''); }
      else setMessage({ text: error instanceof Error ? error.message : 'Сервер не отвечает. Попробуй позже.', error: true });
    } finally { setBusy(false); submitting.current = false; }
  };

  return <div className="form-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={18} /> К Minecraft</button>
    <div className="form-layout">
      <div className="form-hero"><h1>Привяжи Minecraft-профиль</h1>
        <div className="link-steps"><div><span>1</span><p>Зайди на сервер и войди в игру.</p></div><div><span>2</span><p>Напиши <code>/aurumlink</code> или <code>/alink</code>.</p></div><div><span>3</span><p>Введи код из чата здесь.</p></div></div>
        <div className="secure-note"><ShieldCheck size={19} /> Код действует 5 минут. Никому не передавай его.</div>
      </div>
      <form className="link-form-card" onSubmit={submit} aria-busy={busy}>
        <span className="form-card-icon"><Link2 size={24} /></span>
        <h2>{profile ? 'Профиль привязан' : 'Код из игры'}</h2>
        {!state ? <p role="status">Загружаем серверы…</p> : profile ? <>
          <p className="link-profile-name">{profile.playerName}</p><p>{profile.serverName}</p>
          <button type="button" className="button button-primary form-submit" onClick={onBack}>Открыть Minecraft <ArrowRight size={17} /></button>
        </> : <>
          <label htmlFor="link-server">Сервер</label>
          <select id="link-server" value={selected} disabled={busy || !state.available} onChange={event => { setServerId(event.target.value); setMessage(null); }}>
            {!serverValid && <option value={selected}>Выбери сервер</option>}
            {state.servers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label htmlFor="link-code">Одноразовый код</label>
          <input id="link-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24}
            value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="ABCD-2345" disabled={busy || !state.available}
            aria-invalid={message?.error || undefined} aria-describedby={message?.error ? 'link-status' : undefined} />
          <button className="button button-primary form-submit" type="submit" disabled={busy || !state.available || !serverValid || !code.trim()}>
            {busy ? 'Привязываем…' : 'Привязать профиль'} <ArrowRight size={17} /></button>
          {(!state.available || !state.servers.length) && <div className="link-unavailable"><p>{state.error || 'Пока нет доступных серверов.'}</p><button type="button" className="button button-quiet" onClick={() => void reload().catch(() => setMessage({ text: 'Не удалось обновить серверы.', error: true }))}>Обновить</button></div>}
        </>}
      </form>
    </div>
    {message && <div id="link-status" className={`settings-toast ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>
      <span className="settings-toast-text">{message.text}</span><button type="button" aria-label="Закрыть уведомление" onClick={() => setMessage(null)}><X size={17} /></button>
    </div>}
  </div>;
}
