import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { api, Dialog, errorText, jsonBody, useNotice } from './site-api';

type Relation = {
  own: boolean;
  blocked: boolean;
  friend: boolean;
  pending: boolean;
  incoming: boolean;
  canMessage: boolean;
};
type Person = { username: string };
type Friends = {
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  blocked: Person[];
  more: boolean;
};
type Message = { id: string; body: string; own: boolean; createdAt: string };
type Thread = {
  username: string;
  canWrite: boolean;
  messages: Message[];
  more: boolean;
  next: string | null;
};
type Conversation = { username: string; body: string; createdAt: string };

export function RelationshipActions({
  username,
  onMessage,
}: {
  username: string;
  onMessage: (name: string) => void;
}) {
  const [relation, setRelation] = useState<Relation | null>(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const notice = useNotice();
  const load = useCallback(
    () => api<Relation>('/api/site/relationship?user=' + encodeURIComponent(username)).then(setRelation),
    [username],
  );
  useEffect(() => {
    setRelation(null);
    void load().catch(() => {});
  }, [load]);
  const act = async (action: string) => {
    setBusy(true);
    try {
      await api('/api/site/friends', jsonBody({ username, action }));
      setConfirm(false);
      await load();
      notice.show('Готово.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  if (!relation || relation.own) return null;
  return (
    <>
      {notice.element}
      {!relation.blocked && (
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() =>
            void act(
              relation.friend || (relation.pending && !relation.incoming)
                ? 'remove'
                : relation.incoming
                  ? 'accept'
                  : 'request',
            )
          }
        >
          <UserPlus size={15} />
          {relation.friend
            ? 'Убрать из друзей'
            : relation.pending
              ? relation.incoming
                ? 'Принять дружбу'
                : 'Отменить заявку'
              : 'Добавить в друзья'}
        </button>
      )}
      {relation.canMessage && (
        <button className="button button-quiet" onClick={() => onMessage(username)}>
          <MessageCircle size={15} />
          Написать
        </button>
      )}
      {!relation.blocked && (
        <button className="button button-quiet" disabled={busy} onClick={() => setConfirm(true)}>
          Блокировать
        </button>
      )}
      {confirm && (
        <Dialog title={`Блокировать ${username}?`} onClose={() => setConfirm(false)}>
          <p>Дружба будет удалена, сообщения и комментарии между вами скрыты.</p>
          <button className="button button-primary" disabled={busy} onClick={() => void act('block')}>
            Блокировать
          </button>
        </Dialog>
      )}
    </>
  );
}

export function SocialPage({
  initialUser = '',
  onUser,
}: {
  initialUser?: string;
  onUser: (name: string) => void;
}) {
  const [tab, setTab] = useState<'messages' | 'friends'>('messages'),
    [selected, setSelected] = useState(initialUser),
    [inbox, setInbox] = useState<Conversation[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [list, setList] = useState<Friends | null>(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [inbox, friends] = await Promise.all([
        api<{ conversations: Conversation[] }>('/api/site/messages'),
        api<Friends>('/api/site/friends'),
      ]);
      setInbox(inbox.conversations);
      setList(friends);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSelected(initialUser);
  }, [initialUser]);
  const search = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setPeople((await api<{ users: Person[] }>('/api/site/people?q=' + encodeURIComponent(query))).users);
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  const act = async (username: string, action: string) => {
    setBusy(true);
    try {
      await api('/api/site/friends', jsonBody({ username, action }));
      await load();
      notice.show('Готово.');
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="social-page">
      <div className="minecraft-page-heading">
        <h1>Сообщения</h1>
        <button className="button button-quiet" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>
      {notice.element}
      <nav className="game-tabs" aria-label="Общение">
        <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>
          Переписки
        </button>
        <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>
          Друзья{list?.incoming.length ? ` · ${list.incoming.length}` : ''}
        </button>
      </nav>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'messages' ? (
        <div className={`messages-layout ${selected ? 'has-selection' : ''}`}>
          <aside className="conversation-list">
            <form className="compact-search" onSubmit={search}>
              <label>
                Ник
                <input
                  type="search"
                  maxLength={20}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Найти игрока"
                />
              </label>
              <button className="button button-quiet" disabled={busy}>
                Найти
              </button>
            </form>
            {people.length > 0 && (
              <div className="person-search-results">
                {people.map((person) => (
                  <button
                    key={person.username}
                    className="conversation-row"
                    onClick={() => {
                      setSelected(person.username);
                      setPeople([]);
                    }}
                  >
                    {person.username}
                  </button>
                ))}
              </div>
            )}
            {inbox.map((conversation) => (
              <button
                key={conversation.username}
                className={`conversation-row ${selected === conversation.username ? 'active' : ''}`}
                onClick={() => setSelected(conversation.username)}
              >
                <strong>{conversation.username}</strong>
                <span>{conversation.body}</span>
              </button>
            ))}
            {!busy && !inbox.length && (
              <p className="profile-empty">Найди игрока по нику, чтобы начать переписку.</p>
            )}
          </aside>
          {selected ? (
            <MessageThread
              key={selected}
              username={selected}
              onBack={() => setSelected('')}
              onUser={onUser}
              onSent={() => void load()}
            />
          ) : (
            <section className="message-thread empty-thread">
              <MessageCircle size={30} />
              <p>Выбери переписку</p>
            </section>
          )}
        </div>
      ) : (
        <section className="profile-section">
          <form className="compact-search" onSubmit={search}>
            <label>
              Ник
              <input
                type="search"
                value={query}
                maxLength={20}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти игрока"
              />
            </label>
            <button className="button button-quiet" disabled={busy}>
              Найти
            </button>
          </form>
          {people.length > 0 && (
            <ul className="social-rows">
              {people.map((person) => (
                <li key={person.username}>
                  <button className="text-link" onClick={() => onUser(person.username)}>
                    {person.username}
                  </button>
                  <button
                    className="button button-quiet"
                    disabled={busy}
                    onClick={() => void act(person.username, 'request')}
                  >
                    Добавить
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list &&
            (['incoming', 'friends', 'outgoing', 'blocked'] as const).map((kind) => (
              <section className="friend-section" key={kind}>
                <h2>
                  {
                    {
                      incoming: 'Заявки в друзья',
                      friends: 'Друзья',
                      outgoing: 'Отправленные заявки',
                      blocked: 'Заблокированные',
                    }[kind]
                  }
                </h2>
                {!list[kind].length ? (
                  <p className="profile-empty">Пусто</p>
                ) : (
                  <ul className="social-rows">
                    {list[kind].map((person) => (
                      <li key={person.username}>
                        <button className="text-link" onClick={() => onUser(person.username)}>
                          {person.username}
                        </button>
                        <div className="row-actions">
                          {kind === 'friends' && (
                            <button
                              className="button button-quiet"
                              onClick={() => {
                                setSelected(person.username);
                                setTab('messages');
                              }}
                            >
                              Написать
                            </button>
                          )}
                          {kind === 'incoming' && (
                            <button
                              className="button button-primary"
                              disabled={busy}
                              onClick={() => void act(person.username, 'accept')}
                            >
                              Принять
                            </button>
                          )}
                          <button
                            className="button button-quiet"
                            disabled={busy}
                            onClick={() =>
                              void act(person.username, kind === 'blocked' ? 'unblock' : 'remove')
                            }
                          >
                            {kind === 'blocked'
                              ? 'Разблокировать'
                              : kind === 'incoming'
                                ? 'Отклонить'
                                : kind === 'outgoing'
                                  ? 'Отменить'
                                  : 'Удалить'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          {list?.more && (
            <p className="short-hint">Показаны последние 100 связей. Другого игрока можно найти по нику.</p>
          )}
        </section>
      )}
    </div>
  );
}

function MessageThread({
  username,
  onBack,
  onUser,
  onSent,
}: {
  username: string;
  onBack: () => void;
  onUser: (name: string) => void;
  onSent: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const notice = useNotice();
  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      setError('');
      try {
        const result = await api<Thread>(
          `/api/site/messages?${new URLSearchParams({ user: username, ...(before ? { before } : {}) })}`,
        );
        setThread((current) =>
          before && current ? { ...result, messages: [...result.messages, ...current.messages] } : result,
        );
      } catch (error) {
        setError(errorText(error));
        setThread(null);
      } finally {
        setBusy(false);
      }
    },
    [username],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [thread?.messages[thread.messages.length - 1]?.id]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await api('/api/site/messages', jsonBody({ username, text }));
      setText('');
      await load();
      onSent();
    } catch (error) {
      notice.show(errorText(error), true);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="message-thread">
      <header>
        <button className="icon-button thread-back" aria-label="К перепискам" onClick={onBack}>
          <ArrowLeft size={19} />
        </button>
        <button className="text-link" onClick={() => onUser(username)}>
          {username}
        </button>
        <button
          className="icon-button"
          aria-label="Обновить переписку"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={17} />
        </button>
      </header>
      {notice.element}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="message-scroll">
        {thread?.more && (
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => thread.next && void load(thread.next)}
          >
            Предыдущие сообщения
          </button>
        )}
        {busy && !thread ? (
          <p role="status">Загружаем…</p>
        ) : !thread?.messages.length && !error ? (
          <p className="profile-empty">Начало переписки</p>
        ) : null}
        {thread?.messages.map((message) => (
          <article className={`message-bubble ${message.own ? 'own' : ''}`} key={message.id}>
            <p>{message.body}</p>
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </article>
        ))}
        <div ref={end} />
      </div>
      {thread?.canWrite ? (
        <form className="message-compose" onSubmit={send}>
          <label>
            <span className="sr-only">Сообщение для {username}</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Сообщение…"
              disabled={sending}
            />
          </label>
          <button className="button button-primary" disabled={sending || !text.trim()}>
            {sending ? 'Отправляем…' : 'Отправить'}
          </button>
        </form>
      ) : (
        thread && <p className="profile-empty">Игрок не принимает сообщения.</p>
      )}
    </section>
  );
}
