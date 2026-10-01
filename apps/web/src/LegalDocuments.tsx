import { useEffect, useRef, type MouseEvent } from 'react';
import { FileText, ShieldCheck, X } from 'lucide-react';
import { legalContent, legalPaths, legalRevision, type LegalDocument } from './legal-content';

type LegalNavigation = { onOpen: (document: LegalDocument) => void };

function openFromLink(event: MouseEvent<HTMLAnchorElement>, document: LegalDocument, onOpen: LegalNavigation['onOpen']) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onOpen(document);
}

export function LegalLinks({ onOpen, compact = false }: LegalNavigation & { compact?: boolean }) {
  return <nav className="legal-links" aria-label="Правовая информация">
    <a href={legalPaths.terms} aria-label="Условия использования" title="Условия использования" onClick={(event) => openFromLink(event, 'terms', onOpen)}><FileText size={18} strokeWidth={1.8} aria-hidden="true" /><span>{compact ? 'Условия' : 'Условия использования'}</span></a>
    <a href={legalPaths.privacy} aria-label="Приватность" title="Приватность" onClick={(event) => openFromLink(event, 'privacy', onOpen)}><ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" /><span>Приватность</span></a>
  </nav>;
}

export function LegalDialog({ document, onOpen, onClose }: LegalNavigation & { document: LegalDocument; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const content = legalContent[document];

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = window.document.activeElement;
    const previousOverflow = window.document.documentElement.style.overflow;
    const previousTitle = window.document.title;
    dialog?.showModal();
    window.document.documentElement.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      window.document.documentElement.style.overflow = previousOverflow;
      window.document.title = previousTitle;
      if (opener instanceof HTMLElement && opener.isConnected && opener !== window.document.body) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    readerRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
    window.document.title = `${content.title} — Aurum`;
  }, [document, content.title]);

  return <dialog ref={dialogRef} className="legal-dialog" aria-labelledby="legal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="legal-header">
      <nav className="legal-document-nav" aria-label="Документы">
        {(Object.keys(legalPaths) as LegalDocument[]).map((target) => <a key={target} href={legalPaths[target]} aria-current={document === target ? 'page' : undefined} onClick={(event) => openFromLink(event, target, onOpen)}>{target === 'terms' ? 'Условия' : 'Приватность'}</a>)}
      </nav>
      <button type="button" className="legal-close" onClick={onClose} aria-label="Закрыть документ"><X size={20} /><span>Закрыть</span></button>
    </header>
    <div className="legal-reader" ref={readerRef}>
      <article className="legal-article">
        <h1 id="legal-title" ref={titleRef} tabIndex={-1}>{content.title}</h1>
        <p className="legal-revision">Обновлено <time dateTime={legalRevision}>1 октября 2026</time></p>
        <p className="legal-introduction">{content.introduction}</p>
        {content.sections.map((section) => <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>)}
        <footer className="legal-contact">
          <a href="mailto:admin@aurumgg.ovh">admin@aurumgg.ovh</a>
          {document === 'privacy' && <a href="https://www.uodo.gov.pl/pl/492/2464" target="_blank" rel="noopener noreferrer">Подать жалобу в UODO</a>}
        </footer>
      </article>
    </div>
  </dialog>;
}
