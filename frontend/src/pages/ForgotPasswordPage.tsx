import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { authApi } from '../services/authApi';
import '../styles/auth-modern.css';
import '../styles/auth-otp.css';

type ApiError = { code?: string };

const OTP_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const step = complete ? 3 : sentTo ? 2 : 1;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (sentTo && !complete) otpInputRef.current?.focus();
  }, [sentTo, complete]);

  const errorText = (exception: unknown, action: 'request' | 'reset'): string => {
    const code = axios.isAxiosError(exception)
      ? (exception.response?.data as ApiError | undefined)?.code
      : undefined;
    const status = axios.isAxiosError(exception) ? exception.response?.status : undefined;

    if (code === 'PASSWORD_RESET_NOT_CONFIGURED') return 'Máy chủ chưa cấu hình gửi email SMTP.';
    if (code === 'PASSWORD_RESET_EMAIL_FAILED') return 'Chưa gửi được email. Vui lòng kiểm tra cấu hình SMTP.';
    if (code === 'PASSWORD_RESET_INVALID_OTP') return 'Mã OTP không hợp lệ, đã hết hạn hoặc hết lượt thử. Hãy yêu cầu mã mới.';
    if (!status) return 'Không kết nối được máy chủ. Hãy kiểm tra Backend đang chạy.';
    if (status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
    if (status === 400) return action === 'request'
      ? 'Địa chỉ email không hợp lệ.'
      : 'Vui lòng kiểm tra mã OTP và mật khẩu mới.';
    return `Không thể xử lý yêu cầu (HTTP ${status}).`;
  };

  const requestOtp = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy || (sentTo && cooldown > 0)) return;

    const normalizedEmail = (sentTo || email).trim().toLowerCase();
    if (!normalizedEmail) return;

    setBusy(true);
    setNotice('');
    setError(false);
    try {
      await authApi.requestPasswordOtp(normalizedEmail);
      setSentTo(normalizedEmail);
      setOtp('');
      setCooldown(RESEND_DELAY_SECONDS);
      setNotice('Nếu tài khoản tồn tại và dùng mật khẩu, mã OTP đã được gửi. Kiểm tra cả Spam.');
    } catch (exception) {
      setNotice(errorText(exception, 'request'));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const resetWithOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    if (!/^\d{6}$/.test(otp)) {
      setNotice('Vui lòng nhập đủ 6 chữ số OTP.');
      setError(true);
      return;
    }
    if (password.length < 8 || password.length > 200) {
      setNotice('Mật khẩu mới phải có từ 8 đến 200 ký tự.');
      setError(true);
      return;
    }
    if (password !== confirm) {
      setNotice('Mật khẩu xác nhận chưa trùng khớp.');
      setError(true);
      return;
    }

    setBusy(true);
    setNotice('');
    setError(false);
    try {
      await authApi.resetPasswordOtp(sentTo, otp, password);
      setPassword('');
      setConfirm('');
      setOtp('');
      setComplete(true);
      setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.');
    } catch (exception) {
      setNotice(errorText(exception, 'reset'));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => {
    if (busy) return;
    setEmail(sentTo);
    setSentTo('');
    setOtp('');
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setCooldown(0);
    setNotice('');
    setError(false);
  };

  return (
    <main className="lum-auth-shell lum-otp-shell">
      <div className="lum-otp-glow lum-otp-glow-one" aria-hidden="true" />
      <div className="lum-otp-glow lum-otp-glow-two" aria-hidden="true" />
      <div className="lum-otp-container">
        <header className="lum-otp-header">
          <Link to="/" className="lum-auth-logo" aria-label="Lumina Studio - Trang chủ">
            <span className="lum-logo-spark"><Sparkles size={25} fill="currentColor" /></span>
            <span><strong>LUMINA</strong><small>STUDIO</small></span>
          </Link>
          <Link to="/login" className="lum-otp-header-back">
            <ArrowLeft size={16} /> Quay lại đăng nhập
          </Link>
        </header>

        <div className="lum-otp-layout">
          <aside className="lum-otp-story" aria-label="Thông tin bảo mật tài khoản">
            <div className="lum-otp-story-top">
              <div className="lum-otp-story-icon"><ShieldCheck size={28} /></div>
              <span>ACCOUNT SECURITY</span>
            </div>
            <div className="lum-otp-story-main">
              <div className="lum-otp-story-kicker"><Sparkles size={14} /> LUMINA STUDIO</div>
              <h1>Quay lại với<br />cảm hứng của bạn.</h1>
              <p>Khôi phục quyền truy cập an toàn, nhanh chóng với mã xác minh gửi qua email.</p>
              <div className="lum-otp-feature-list">
                <div><span><Mail size={17} /></span><div><strong>Nhận mã qua Gmail</strong><small>Không cần mở đường dẫn localhost</small></div></div>
                <div><span><Clock3 size={17} /></span><div><strong>OTP có hiệu lực 5 phút</strong><small>Mã chỉ sử dụng được một lần</small></div></div>
                <div><span><LockKeyhole size={17} /></span><div><strong>Tài khoản được bảo vệ</strong><small>Xác minh trước khi đổi mật khẩu</small></div></div>
              </div>
            </div>
            <div className="lum-otp-story-footer"><BadgeCheck size={17} /> Secure account recovery</div>
          </aside>

          <section className="lum-otp-panel" aria-label="Khôi phục mật khẩu">
            <div className="lum-otp-progress" aria-label={`Bước ${step} trong 3 bước`}>
              {['Email', 'Xác minh', 'Hoàn tất'].map((label, index) => (
                <div key={label} className={`lum-otp-progress-step ${step === index + 1 ? 'is-current' : ''} ${step > index + 1 ? 'is-done' : ''}`}>
                  <span className="lum-otp-progress-dot">{step > index + 1 ? <Check size={13} /> : index + 1}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="lum-otp-content">
              {complete ? (
                <>
                  <div className="lum-otp-success-icon"><CheckCircle2 size={35} /></div>
                  <div className="lum-otp-eyebrow">HOÀN TẤT</div>
                  <h2>Mật khẩu đã đổi thành công!</h2>
                  <p className="lum-otp-subtitle">Tài khoản Lumina đã sẵn sàng. Đăng nhập với mật khẩu mới để tiếp tục sáng tạo nhé.</p>
                  {notice && <div className="lum-otp-notice is-success" role="status"><CheckCircle2 size={17} /> <span>{notice}</span></div>}
                  <Link className="lum-otp-main-button" to="/login">
                    Đăng nhập ngay <ArrowRight size={18} />
                  </Link>
                </>
              ) : !sentTo ? (
                <>
                  <div className="lum-otp-heading-icon"><Mail size={26} /></div>
                  <div className="lum-otp-eyebrow">BƯỚC 01 / 03</div>
                  <h2>Quên mật khẩu?</h2>
                  <p className="lum-otp-subtitle">Nhập email bạn đã đăng ký với Lumina. Chúng tôi sẽ gửi mã OTP 6 số để bạn đặt lại mật khẩu.</p>

                  <form className="lum-otp-form" onSubmit={requestOtp}>
                    <label htmlFor="lum-reset-email" className="lum-otp-label">Địa chỉ email</label>
                    <div className="lum-otp-field">
                      <Mail size={19} aria-hidden="true" />
                      <input id="lum-reset-email" type="email" autoComplete="email" required maxLength={254}
                        placeholder="email@example.com" value={email}
                        onChange={(event) => setEmail(event.target.value)} disabled={busy} />
                    </div>
                    <button className="lum-otp-main-button" type="submit" disabled={busy}>
                      {busy ? <><RefreshCw size={17} className="lum-otp-spin" /> Đang gửi mã...</>
                        : <>Gửi mã xác minh <ArrowRight size={18} /></>}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="lum-otp-heading-icon"><KeyRound size={26} /></div>
                  <div className="lum-otp-eyebrow">BƯỚC 02 / 03</div>
                  <h2>Xác minh OTP</h2>
                  <p className="lum-otp-subtitle">Nhập mã gồm 6 chữ số được gửi tới địa chỉ email bên dưới.</p>
                  <div className="lum-otp-recipient">
                    <Mail size={16} aria-hidden="true" />
                    <span title={sentTo}>{sentTo}</span>
                    <button type="button" onClick={changeEmail} disabled={busy}>Đổi</button>
                  </div>

                  <form className="lum-otp-form lum-otp-verify-form" onSubmit={resetWithOtp}>
                    <label htmlFor="lum-reset-otp" className="lum-otp-label">Mã xác minh</label>
                    <div className="lum-otp-code-control">
                      <input ref={otpInputRef} id="lum-reset-otp" type="text" inputMode="numeric"
                        autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={OTP_LENGTH} required
                        aria-label="Mã OTP gồm 6 chữ số" aria-describedby="lum-otp-expiry"
                        value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                        disabled={busy} />
                      <div className="lum-otp-code-digits" aria-hidden="true">
                        {Array.from({ length: OTP_LENGTH }, (_, index) => (
                          <span key={index} className={otp.length === index ? 'is-active' : ''}>
                            {otp[index] ?? ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="lum-otp-expiry" id="lum-otp-expiry"><Clock3 size={14} /> Mã có hiệu lực trong 5 phút kể từ khi gửi</div>

                    <label htmlFor="lum-reset-password" className="lum-otp-label">Mật khẩu mới</label>
                    <div className="lum-otp-field">
                      <LockKeyhole size={19} aria-hidden="true" />
                      <input id="lum-reset-password" type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" required minLength={8} maxLength={200}
                        placeholder="Ít nhất 8 ký tự" value={password}
                        onChange={(event) => setPassword(event.target.value)} disabled={busy} />
                      <button type="button" className="lum-otp-visibility" disabled={busy}
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <label htmlFor="lum-reset-confirm" className="lum-otp-label">Xác nhận mật khẩu mới</label>
                    <div className="lum-otp-field">
                      <LockKeyhole size={19} aria-hidden="true" />
                      <input id="lum-reset-confirm" type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" required minLength={8} maxLength={200}
                        placeholder="Nhập lại mật khẩu mới" value={confirm}
                        onChange={(event) => setConfirm(event.target.value)} disabled={busy} />
                    </div>
                    <button className="lum-otp-main-button" type="submit" disabled={busy}>
                      {busy ? <><RefreshCw size={17} className="lum-otp-spin" /> Đang xác minh...</>
                        : <>Đặt lại mật khẩu <ArrowRight size={18} /></>}
                    </button>
                  </form>
                  <div className="lum-otp-resend">
                    <span>Chưa nhận được mã?</span>
                    <button type="button" disabled={busy || cooldown > 0} onClick={() => { void requestOtp(); }}>
                      <RefreshCw size={14} /> {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã OTP'}
                    </button>
                  </div>
                </>
              )}

              {notice && !complete && (
                <div className={`lum-otp-notice ${error ? 'is-error' : 'is-info'}`} role={error ? 'alert' : 'status'}>
                  {error ? <ShieldCheck size={17} /> : <CheckCircle2 size={17} />}
                  <span>{notice}</span>
                </div>
              )}
              <div className="lum-otp-bottom-link">
                <Link to="/login"><ArrowLeft size={15} /> Quay lại đăng nhập</Link>
              </div>
            </div>
            <div className="lum-otp-panel-footer"><ShieldCheck size={15} /> Mã OTP được bảo vệ và chỉ sử dụng một lần</div>
          </section>
        </div>
        <p className="lum-otp-copyright">© Lumina Studio · Tạo nên những điều khác biệt</p>
      </div>
    </main>
  );
}
