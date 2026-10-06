import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result.error || (response.status === 401 ? 'Войди снова.' : 'Сервис недоступен. Попробуй позже.'),
    );
  return result as T;
}
export const jsonBody = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие.';

export function useNotice() {
  const [notice, setNotice] = useState({ text: '', error: false });
  useEffect(() => {
    if (!notice.text) return;
    const timer = window.setTimeout(() => setNotice({ text: '', error: false }), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return {
    show: (text: string, error = false) => setNotice({ text, error }),
    element: notice.text && (
      <div
        className={`settings-toast ${notice.error ? 'error' : ''}`}
        role={notice.error ? 'alert' : 'status'}
      >
        <span className="settings-toast-text">{notice.text}</span>
        <button aria-label="Закрыть уведомление" onClick={() => setNotice({ text: '', error: false })}>
          <X size={17} />
        </button>
      </div>
    ),
  };
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="site-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть окно" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
