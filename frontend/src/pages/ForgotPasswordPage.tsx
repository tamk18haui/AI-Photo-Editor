import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, CircleHelp, Clock3, LoaderCircle,
  LockKeyhole, Mail, Send, ShieldCheck, Sparkles
} from 'lucide-react';
import { authApi } from '../services/authApi';
import '../styles/forgot-password-modern.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    setSuccess(false);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
      setNotice('Nếu email này tồn tại trong hệ thống, liên kết đặt lại mật khẩu sẽ được gửi. Hãy kiểm tra cả thư Spam.');
    } catch (error: unknown) {
      const code = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string } | undefined)?.code
        : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setNotice(
        code === 'PASSWORD_RESET_NOT_CONFIGURED'
          ? 'Backend chưa cấu hình SMTP gửi email.'
          : code === 'PASSWORD_RESET_EMAIL_FAILED'
          ? 'Không gửi được email. Hãy kiểm tra SMTP hoặc Google App Password.'
          : status === 400
          ? 'Địa chỉ email chưa đúng định dạng.'
          : !status
          ? 'Không kết nối được Backend. Hãy kiểm tra Spring Boot và Vite proxy.'
          : 'Gửi yêu cầu thất bại. Mã HTTP: ' + status
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="lum-reset-page">
      <div className="lum-reset-shell">
        <aside className="lum-reset-aside" aria-label="Giới thiệu khôi phục tài khoản">
          <Link to="/" className="lum-reset-brand"><Sparkles size={29} /> <strong>Lumina Studio</strong></Link>
          <div className="lum-reset-aside-body">
            <h1>Lấy lại quyền truy cập tài khoản</h1>
            <p>Chúng tôi sẽ gửi cho bạn một liên kết đặt lại mật khẩu an toàn qua email.</p>
            <div className="lum-reset-benefits">
              <div><span><Mail size={22} /></span><p><strong>Gửi email nhanh chóng</strong><small>Chỉ mất vài giây</small></p></div>
              <div><span><ShieldCheck size={22} /></span><p><strong>Liên kết an toàn</strong><small>Có thời hạn 20 phút</small></p></div>
              <div><span><LockKeyhole size={22} /></span><p><strong>Bảo mật thông tin</strong><small>Không gửi mật khẩu hiện tại qua email</small></p></div>
            </div>
          </div>
          <div className="lum-reset-art" aria-hidden="true">
            <div className="lum-reset-art-glow" />
            <div className="lum-reset-envelope">
              <span className="lum-reset-letter"><Sparkles size={22} /></span>
              <Mail size={112} strokeWidth={1.1} />
              <span className="lum-reset-lock"><LockKeyhole size={26} /></span>
            </div>
          </div>
        </aside>
        <section className="lum-reset-content">
          <div className="lum-reset-back"><Link to="/login"><ArrowLeft size={18} /> Quay lại đăng nhập</Link></div>
          <div className="lum-reset-form-area">
            <div className="lum-reset-main-icon"><Mail size={31} /></div>
            <h2>Quên mật khẩu?</h2>
            <p className="lum-reset-lead">Nhập email tài khoản Lumina để nhận liên kết đặt lại mật khẩu.</p>
            <form onSubmit={submit}>
              <label htmlFor="reset-email">Địa chỉ email</label>
              <div className="lum-reset-input-wrap">
                <Mail size={20} />
                <input id="reset-email" type="email" required autoComplete="email"
                  placeholder="name@gmail.com" value={email} disabled={busy}
                  onChange={e => setEmail(e.target.value)} />
                {email && !busy && (
                  <button type="button" className="lum-reset-clear" onClick={() => setEmail('')} aria-label="Xóa email">×</button>
                )}
              </div>
              <button className="lum-reset-submit" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="lum-reset-spin" size={20} /> : <Send size={20} />}
                {busy ? 'Đang gửi liên kết...' : 'Gửi liên kết đặt lại mật khẩu'}
              </button>
            </form>
            {notice && (
              <div className={`lum-reset-notice ${success ? 'is-success' : 'is-error'}`}
                role={success ? 'status' : 'alert'}>
                {success ? <CheckCircle2 size={23} /> : <CircleHelp size={23} />}
                <span>{notice}</span>
              </div>
            )}
            <div className="lum-reset-help">
              <div className="lum-reset-help-title"><CircleHelp size={21} /><strong>Không nhận được email?</strong></div>
              <ul>
                <li>Kiểm tra thư mục Spam hoặc Quảng cáo.</li>
                <li>Đảm bảo bạn nhập đúng địa chỉ email.</li>
                <li>Liên kết có thời hạn 20 phút.</li>
                <li>Thử gửi lại sau vài phút nếu cần.</li>
              </ul>
            </div>
            <div className="lum-reset-secure"><Clock3 size={15} /> Hãy dùng liên kết trước khi hết hạn.</div>
          </div>
        </section>
      </div>
    </main>
  );
}
