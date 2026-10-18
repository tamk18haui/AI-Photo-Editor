import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Image as ImageIcon, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { editWithGemini } from './geminiApi';
import './gemini.css';

type Message = { id: number; role: 'user' | 'assistant'; text: string };

type Props = {
  originalPreview: string;
  createSource: () => Promise<Blob>;
  onApply: (file: Blob) => void;
  onClose: () => void;
};

/** Entire N5 chat/preview workflow lives outside the existing Editor components. */
export default function GeminiChat({ originalPreview, createSource, onApply, onClose }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState(originalPreview);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:') && previewUrl !== originalPreview) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, originalPreview]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (busy || !prompt || prompt.length > 1500) return;
    setInput(''); setError(''); setBusy(true);
    setMessages(list => [...list, { id: Date.now(), role: 'user', text: prompt }]);
    try {
      // Iterative editing: each next turn uses the latest generated preview, never the stale source.
      const source = draft ?? await createSource();
      const result = await editWithGemini(source, prompt);
      const url = URL.createObjectURL(result.image);
      setDraft(result.image);
      setPreviewUrl(url);
      setMessages(list => [...list, { id: Date.now() + 1, role: 'assistant', text: result.message }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể chỉnh ảnh với Gemini.');
      setInput(prompt);
    } finally { setBusy(false); }
  }

  return (
    <div className="n5-backdrop" role="presentation">
      <section className="n5-modal" role="dialog" aria-modal="true" aria-label="Gemini Chat chỉnh ảnh">
        <div className="n5-preview-pane">
          <header className="n5-pane-head"><span><ImageIcon size={18} /> Xem trước ảnh</span><button type="button" onClick={onClose} aria-label="Đóng Gemini Chat" disabled={busy}><X size={19} /></button></header>
          <div className="n5-preview-stage"><img src={previewUrl} alt={draft ? 'Ảnh Gemini vừa chỉnh sửa' : 'Ảnh gốc trong Editor'} /></div>
          <footer className="n5-preview-footer"><span>{draft ? 'Bản xem trước · Chưa Apply' : 'Ảnh gốc · Chưa chỉnh sửa bằng Gemini'}</span>
            <button className="n5-apply" type="button" disabled={!draft || busy} onClick={() => { if (draft) onApply(draft); }}><Check size={17} /> Apply vào Editor</button></footer>
        </div>
        <div className="n5-chat-pane">
          <header className="n5-chat-head"><span className="n5-avatar"><Sparkles size={21}/></span><span><strong>Gemini Chat</strong><small>Chỉnh ảnh bằng câu lệnh · N5</small></span></header>
          <div className="n5-chat-scroll" ref={scrollRef} aria-live="polite">
            <div className="n5-welcome"><Sparkles size={26}/><strong>Bạn muốn chỉnh ảnh thế nào?</strong><p>Ví dụ: Xóa người phía sau, làm trời hoàng hôn, giữ nguyên khuôn mặt.</p><p>Sau khi có ảnh mới, cứ tiếp tục nhắn để chỉnh từ bản xem trước đó.</p></div>
            {messages.map(m => <div key={m.id} className={`n5-bubble n5-${m.role}`}>{m.text}</div>)}
            {busy && <div className="n5-wait"><LoaderCircle className="n5-spin" size={17}/> Đang xử lý ảnh bằng Gemini...</div>}
            {error && <p className="n5-error" role="alert">{error}</p>}
          </div>
          <form className="n5-composer" onSubmit={send}>
            <textarea value={input} onChange={e => setInput(e.target.value)} maxLength={1500} rows={3} placeholder="Ví dụ: Đổi nền thành bãi biển, giữ nguyên nhân vật..." disabled={busy} aria-label="Nhập câu lệnh chỉnh ảnh" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            <div className="n5-composer-bottom"><small>{input.length}/1500 · Enter để gửi</small><button type="submit" disabled={busy || !input.trim()}><Send size={16}/> Gửi</button></div>
          </form>
        </div>
      </section>
    </div>
  );
}
