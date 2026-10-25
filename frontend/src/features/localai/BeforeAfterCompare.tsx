import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import './before-after-compare.css';

type Props = {
  beforeUrl: string;
  afterUrl: string;
  isApplying: boolean;
  onClose: () => void;
  onApply: () => void;
};

/** A true two-image wipe: pixels come directly from the source and AI result assets. */
export default function BeforeAfterCompare({
  beforeUrl, afterUrl, isApplying, onClose, onApply,
}: Props) {
  const [split, setSplit] = useState(50);
  const [ratio, setRatio] = useState(16 / 9);
  const [loadError, setLoadError] = useState('');
  const dragging = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isApplying) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, isApplying]);

  const moveHandle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSplit(Math.min(100, Math.max(0, Math.round((event.clientX - rect.left) / rect.width * 100))));
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isApplying) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveHandle(event);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current && !isApplying) moveHandle(event);
  };
  const stopDragging = () => { dragging.current = false; };

  return createPortal(
    <div className="lumina-compare-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !isApplying) onClose();
    }}>
      <section className="lumina-compare-dialog" role="dialog" aria-modal="true"
        aria-label="So sánh ảnh trước và sau khi nâng cấp AI">
        <header className="lumina-compare-heading">
          <div>
            <small>LUMINA · AI UPSCALE</small>
            <h2>So sánh trước / sau</h2>
            <p>Kéo thanh ở giữa ảnh để kiểm tra chi tiết trước khi áp dụng.</p>
          </div>
          <button ref={closeButton} type="button" className="lumina-compare-close"
            onClick={onClose} disabled={isApplying} aria-label="Đóng so sánh"><X size={22}/></button>
        </header>
        <div className="lumina-compare-stage" style={{aspectRatio: ratio,maxWidth:`${64 * ratio}vh`}}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={stopDragging} onPointerCancel={stopDragging}>
          <img className="lumina-compare-img" src={afterUrl} draggable={false}
            alt="Ảnh sau khi nâng cấp AI" onError={() => setLoadError('Không tải được ảnh kết quả AI. Kiểm tra URL ảnh.')} />
          <div className="lumina-compare-before" style={{clipPath:`inset(0 ${100 - split}% 0 0)`}}>
            <img className="lumina-compare-img" src={beforeUrl} draggable={false}
              alt="Ảnh gốc trước khi nâng cấp" onLoad={event => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
              }} onError={() => setLoadError('Không tải được ảnh gốc. Kiểm tra URL ảnh.')} />
          </div>
          <span className="lumina-compare-label lumina-compare-label-left">TRƯỚC</span>
          <span className="lumina-compare-label lumina-compare-label-right">SAU AI</span>
          <div className="lumina-compare-separator" style={{left:`${split}%`}} aria-hidden="true">
            <span className="lumina-compare-grip">‹ ›</span>
          </div>
        </div>
        {loadError && <p className="lumina-compare-error" role="alert">{loadError}</p>}
        <label className="lumina-compare-range-label" htmlFor="lumina-compare-range">
          Vị trí thanh so sánh <span>{split}%</span>
        </label>
        <input id="lumina-compare-range" className="lumina-compare-range" type="range"
          min={0} max={100} step={1} value={split} onChange={event => setSplit(Number(event.target.value))}
          aria-label="Điều chỉnh vùng hiển thị ảnh trước và sau" />
        <footer className="lumina-compare-actions">
          <button type="button" className="lumina-compare-cancel" onClick={onClose} disabled={isApplying}>
            Quay lại Editor
          </button>
          <button type="button" className="lumina-compare-apply" onClick={onApply}
            disabled={isApplying || Boolean(loadError)}>
            <Check size={18}/>{isApplying ? 'Đang lưu Layer...' : 'Áp dụng ảnh AI'}
          </button>
        </footer>
      </section>
    </div>, document.body
  );
}
