import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Flag, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api, Dialog, errorText, jsonBody, useNotice } from './site-api';

type Item = {
  id: string;
  body: string;
  username: string | null;
  own: boolean;
  createdAt: string;
  replies: number;
};
type Page = { items: Item[]; more: boolean; next: string | null; canWrite: boolean; canManage: boolean };

export function Feed({
  scope,
  kind = 'posts',
  parent,
  title,
  onUser,
}: {
  scope: string;
  kind?: 'posts' | 'comments';
  parent?: string;
  title?: string;
  onUser: (name: string) => void;
}) {
  const [page, setPage] = useState<Page | null>(null),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(''),
    [text, setText] = useState('');
  const [reply, setReply] = useState<Item | null>(null),
    [report, setReport] = useState<Item | null>(null),
    [reason, setReason] = useState(''),
    [removing, setRemoving] = useState<Item | null>(null);
  const notice = useNotice();
  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      setError('');
      try {
        const result = await api<Page>(
          `/api/site/feed?${new URLSearchParams({ scope, kind, ...(parent ? { parent } : {}), ...(before ? { before } : {}) })}`,
        );
        setPage((current) =>
          before && current ? { ...result, items: [...current.items, ...result.items] } : result,
        );
      } catch (error) {
        setError(errorText(error));
        setPage(null);
      } finally {
        setBusy(false);
      }
    },
    [scope, kind, parent],
  );
  useEffect(() => {
    setPage(null);
    setText('');
    void load();
  }, [load]);
  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api('/api/site/feed', jsonBody({ scope, kind, text, ...(parent ? { parent } : {}) }));
      setText('');
      await load();
      notice.show('Опубликовано.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setSending(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setSending(true);
    try {
      await api(`/api/site/content/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      await load();
      notice.show('Удалено.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setSending(false);
    }
  };
  const sendReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!report) return;
    setSending(true);
    try {
      await api('/api/site/reports', jsonBody({ id: report.id, reason }));
      setReport(null);
      setReason('');
      notice.show('Жалоба отправлена.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="community-feed">
      <div className="profile-section-heading">
        <h2>{title || (kind === 'comments' ? 'Комментарии' : 'Записи')}</h2>
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() => void load()}
          aria-label="Обновить ленту"
        >
          <RefreshCw size={15} />
          <span>Обновить</span>
        </button>
      </div>
      {!report && !removing && notice.element}
      {page?.canWrite && (
        <form className="feed-compose" onSubmit={publish}>
          <label>
            <span className="sr-only">{kind === 'comments' ? 'Твой комментарий' : 'Новая запись'}</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={kind === 'comments' ? 1000 : 3000}
              placeholder={kind === 'comments' ? 'Напиши комментарий…' : 'Поделиться новостью…'}
              disabled={sending}
            />
          </label>
          <div>
            <span>
              {text.length}/{kind === 'comments' ? 1000 : 3000}
            </span>
            <button className="button button-primary" disabled={sending || !text.trim()}>
              {sending ? 'Отправляем…' : 'Опубликовать'}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}{' '}
          <button className="text-link" onClick={() => void load()}>
            Повторить
          </button>
        </p>
      )}
      {busy && !page ? (
        <p role="status">Загружаем…</p>
      ) : page && !page.items.length ? (
        <p className="profile-empty">
          {kind === 'comments' ? 'Пока нет комментариев.' : 'Пока нет записей.'}
        </p>
      ) : null}
      <div className={`feed-items${kind === 'posts' ? ' feed-posts' : ''}`}>
        {page?.items.map((item) => (
          <article key={item.id} className="feed-item">
            <header>
              <button
                className="text-link"
                disabled={!item.username}
                onClick={() => item.username && onUser(item.username)}
              >
                {item.username || 'Удалённый аккаунт'}
              </button>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </header>
            <p>{item.body}</p>
            <footer>
              {kind === 'posts' && (
                <button className="text-link" onClick={() => setReply(item)}>
                  <MessageCircle size={15} />
                  Комментарии{item.replies ? ` · ${item.replies}` : ''}
                </button>
              )}
              <span className="feed-item-controls">
                {(item.own || page.canManage) && (
                  <button
                    className="icon-button"
                    aria-label="Удалить запись"
                    onClick={() => setRemoving(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {!item.own && (
                  <button
                    className="icon-button"
                    aria-label="Пожаловаться"
                    onClick={() => {
                      setReport(item);
                      setReason('');
                    }}
                  >
                    <Flag size={16} />
                  </button>
                )}
              </span>
            </footer>
          </article>
        ))}
      </div>
      {page?.more && (
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() => page.next && void load(page.next)}
        >
          {busy ? 'Загружаем…' : 'Раньше'}
        </button>
      )}
      {reply && (
        <Dialog title="Комментарии к записи" onClose={() => setReply(null)}>
          <p className="feed-replied-text">{reply.body}</p>
          <Feed scope={scope} kind="comments" parent={reply.id} onUser={onUser} />
        </Dialog>
      )}
      {report && (
        <Dialog title="Пожаловаться" onClose={() => setReport(null)}>
          {notice.element}
          <form onSubmit={sendReport}>
            <label>
              Причина
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                required
                rows={4}
              />
            </label>
            <button className="button button-primary" disabled={sending || !reason.trim()}>
              Отправить
            </button>
          </form>
        </Dialog>
      )}
      {removing && (
        <Dialog title="Удалить запись?" onClose={() => setRemoving(null)}>
          {notice.element}
          <p>Комментарии к ней тоже будут удалены.</p>
          <div className="form-actions">
            <button className="button button-quiet" onClick={() => setRemoving(null)} disabled={sending}>
              Отмена
            </button>
            <button className="button button-primary" onClick={() => void remove()} disabled={sending}>
              Удалить
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
