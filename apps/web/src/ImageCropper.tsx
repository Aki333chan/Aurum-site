import { useEffect, useRef, useState } from 'react';

type Kind = 'avatar' | 'banner';
type Point = { x: number; y: number };

const sizes = {
  avatar: { previewWidth: 640, previewHeight: 640, outputWidth: 256, outputHeight: 256, maxPixels: 16_000_000 },
  banner: { previewWidth: 400, previewHeight: 100, outputWidth: 1600, outputHeight: 400, maxPixels: 24_000_000 },
};

export function ImageCropper({ file, kind, onCancel, onApply }: {
  file: File;
  kind: Kind;
  onCancel: () => void;
  onApply: (cropped: File) => void;
}) {
  const frame = sizes[kind];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; offset: Point } | null>(null);
  const cancelledRef = useRef(false);
  const exportingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState('');

  const cancel = () => { cancelledRef.current = true; onCancel(); };

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      if (image.naturalWidth * image.naturalHeight > frame.maxPixels) {
        setError(`Слишком большое разрешение. Максимум ${frame.maxPixels / 1_000_000} Мп.`);
        return;
      }
      imageRef.current = image;
      setError('');
      setReady(true);
    };
    image.onerror = () => { if (active) setError('Браузер не открыл этот формат. Попробуй JPG или PNG.'); };
    image.src = url;
    return () => { active = false; imageRef.current = null; URL.revokeObjectURL(url); };
  }, [file, frame.maxPixels]);

  const placement = (image: HTMLImageElement, point: Point) => {
    const scale = Math.max(frame.previewWidth / image.naturalWidth, frame.previewHeight / image.naturalHeight) * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const maxX = (width - frame.previewWidth) / 2;
    const maxY = (height - frame.previewHeight) / 2;
    const x = Math.max(-maxX, Math.min(maxX, point.x));
    const y = Math.max(-maxY, Math.min(maxY, point.y));
    return { left: (frame.previewWidth - width) / 2 + x, top: (frame.previewHeight - height) / 2 + y, width, height };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = placement(image, offset);
    context.clearRect(0, 0, frame.previewWidth, frame.previewHeight);
    context.drawImage(image, rect.left, rect.top, rect.width, rect.height);
  }, [ready, zoom, offset, frame.previewWidth, frame.previewHeight]);

  const move = (point: Point) => {
    const image = imageRef.current;
    if (!image) return;
    const rect = placement(image, point);
    setOffset({ x: rect.left - (frame.previewWidth - rect.width) / 2,
      y: rect.top - (frame.previewHeight - rect.height) / 2 });
  };

  const apply = () => {
    const image = imageRef.current;
    if (!image || exportingRef.current) return;
    exportingRef.current = true;
    const canvas = document.createElement('canvas');
    canvas.width = frame.outputWidth;
    canvas.height = frame.outputHeight;
    const context = canvas.getContext('2d');
    if (!context) { exportingRef.current = false; setError('Не удалось подготовить изображение.'); return; }
    const rect = placement(image, offset);
    const factor = frame.outputWidth / frame.previewWidth;
    context.drawImage(image, rect.left * factor, rect.top * factor, rect.width * factor, rect.height * factor);
    canvas.toBlob((blob) => {
      if (cancelledRef.current) return;
      if (!blob) { exportingRef.current = false; setError('Не удалось подготовить изображение.'); return; }
      onApply(new File([blob], `${kind}.png`, { type: blob.type || 'image/png' }));
    }, 'image/png');
  };

  return <dialog className="crop-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); cancel(); }}>
    <div className="crop-head"><h2>{kind === 'avatar' ? 'Обрезать аватар' : 'Обрезать обложку'}</h2><button type="button" onClick={cancel} aria-label="Закрыть редактор">×</button></div>
    <p>Перетащи изображение и выбери масштаб.</p>
    <div className={`crop-stage crop-${kind}`}><canvas ref={canvasRef} className={`crop-canvas crop-${kind}`} width={frame.previewWidth} height={frame.previewHeight}
      role="group" aria-label="Предпросмотр обрезки. Стрелками можно сместить изображение." tabIndex={0}
      onPointerDown={(event) => { if (!ready) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, offset }; }}
      onPointerMove={(event) => { if (!dragRef.current) return; const rect = event.currentTarget.getBoundingClientRect();
        move({ x: dragRef.current.offset.x + (event.clientX - dragRef.current.pointerX) * frame.previewWidth / rect.width,
          y: dragRef.current.offset.y + (event.clientY - dragRef.current.pointerY) * frame.previewHeight / rect.height }); }}
      onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
      onKeyDown={(event) => { const delta: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
        if (!delta[event.key]) return; event.preventDefault(); move({ x: offset.x + delta[event.key].x, y: offset.y + delta[event.key].y }); }} /></div>
    <label className="crop-zoom">Масштаб<input type="range" min="1" max="12" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={!ready} /></label>
    {error && <p className="crop-error" role="alert">{error}</p>}
    <div className="crop-actions"><button className="button button-quiet" type="button" onClick={cancel}>Отмена</button><button className="button button-primary" type="button" onClick={apply} disabled={!ready}>{kind === 'banner' ? 'Опубликовать обложку' : 'Сохранить аватар'}</button></div>
  </dialog>;
}
