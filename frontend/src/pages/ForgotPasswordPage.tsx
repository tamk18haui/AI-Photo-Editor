import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, Clock3, Eye, EyeOff,
  KeyRound, LoaderCircle, LockKeyhole, Mail, RefreshCw, Send, ShieldCheck, Sparkles
} from 'lucide-react';
import { authApi } from '../services/authApi';
import PasswordStrengthHint from '../components/PasswordStrengthHint';
import { isStrongPassword } from '../utils/passwordPolicy';
import '../styles/forgot-password-modern.css';
import '../styles/n3-n1-password-bridge.css';

type RecoveryMode = 'otp' | 'link';
type ApiError = { code?: string };
const OTP_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [mode, setMode] = useState<RecoveryMode>('otp');
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
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const inOtpStep = mode === 'otp' && Boolean(sentTo) && !complete;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (inOtpStep) otpInputRef.current?.focus();
  }, [inOtpStep]);

  const errorText = (exception: unknown): string => {
    const code = axios.isAxiosError(exception)
      ? (exception.response?.data as ApiError | undefined)?.code : undefined;
    const status = axios.isAxiosError(exception) ? exception.response?.status : undefined;
    if (code === 'PASSWORD_RESET_NOT_CONFIGURED') return 'Máy chủ chưa cấu hình SMTP gửi email.';
    if (code === 'PASSWORD_RESET_EMAIL_FAILED') return 'Chưa gửi được email. Hãy kiểm tra SMTP hoặc Google App Password.';
    if (code === 'PASSWORD_RESET_INVALID_OTP') return 'Mã OTP không hợp lệ, hết hạn hoặc đã hết lượt thử. Hãy yêu cầu mã mới.';
    if (!status) return 'Không kết nối được Backend. Hãy kiểm tra Spring Boot và Vite proxy.';
    if (status === 429) return 'Bạn đã yêu cầu quá nhiều lần. Hãy thử lại sau.';
    if (status === 400) return 'Thông tin xác minh hoặc mật khẩu không hợp lệ.';
    return `Không thể xử lý yêu cầu (HTTP ${status}).`;
  };

  const changeMode = (nextMode: RecoveryMode) => {
    if (busy) return;
    setMode(nextMode);
    setNotice('');
    setError(false);
    setLinkSent(false);
    // Không xóa email; giữ lại để người dùng chọn cách khác khi cần.
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
      setNotice('Nếu tài khoản tồn tại và dùng mật khẩu, mã OTP đã được gửi. Kiểm tra cả thư Spam.');
    } catch (exception) {
      setNotice(errorText(exception));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setBusy(true);
    setNotice('');
    setError(false);
    try {
      await authApi.forgotPassword(normalizedEmail);
      setLinkSent(true);
      setNotice('Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi. Kiểm tra cả thư Spam.');
    } catch (exception) {
      setNotice(errorText(exception));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const resetWithOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setNotice('Vui lòng nhập đủ 6 chữ số OTP.'); setError(true); return;
    }
    if (!isStrongPassword(password)) {
      setNotice('Mật khẩu cần 8–200 ký tự, chữ hoa, chữ thường, chữ số và ký tự đặc biệt.'); setError(true); return;
    }
    if (password !== confirm) {
      setNotice('Hai mật khẩu chưa trùng nhau.'); setError(true); return;
    }
    setBusy(true);
    setNotice('');
    setError(false);
    try {
      await authApi.resetPasswordOtp(sentTo, otp, password);
      setPassword(''); setConfirm(''); setOtp('');
      setComplete(true);
      setNotice('Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.');
    } catch (exception) {
      setNotice(errorText(exception));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => {
    if (busy) return;
    setEmail(sentTo);
    setSentTo(''); setOtp(''); setPassword(''); setConfirm('');
    setShowPassword(false); setCooldown(0); setNotice(''); setError(false);
  };

  return (
    <main className="lum-reset-page">
      <div className="lum-reset-shell">
        <aside className="lum-reset-aside" aria-label="Giới thiệu khôi phục tài khoản">
          <Link to="/" className="lum-reset-brand"><Sparkles size={29} /> <strong>Lumina Studio</strong></Link>
          <div className="lum-reset-aside-body">
            <h1>Lấy lại quyền truy cập tài khoản</h1>
            <p>Khôi phục mật khẩu an toàn bằng mã OTP 6 số hoặc liên kết xác minh qua email.</p>
            <div className="lum-reset-benefits">
              <div><span><Mail size={22} /></span><p><strong>Gửi xác minh qua email</strong><small>Chọn OTP hoặc liên kết bảo mật</small></p></div>
              <div><span><Clock3 size={22} /></span><p><strong>OTP hiệu lực 5 phút</strong><small>Liên kết khôi phục hiệu lực 20 phút</small></p></div>
              <div><span><LockKeyhole size={22} /></span><p><strong>Mật khẩu mạnh</strong><small>Chữ hoa, chữ thường, số và ký tự đặc biệt</small></p></div>
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
            <div className="lum-reset-main-icon">{complete ? <CheckCircle2 size={31}/> : inOtpStep ? <KeyRound size={31}/> : <Mail size={31}/>}</div>
            <h2>{complete ? 'Đổi mật khẩu thành công!' : inOtpStep ? 'Nhập mã OTP' : 'Quên mật khẩu?'}</h2>
            <p className="lum-reset-lead">
              {complete ? 'Bạn đã có thể quay lại Lumina Studio.'
                : inOtpStep ? 'Nhập mã 6 số từ email và đặt một mật khẩu mới an toàn.'
                : 'Chọn phương thức xác minh để lấy lại tài khoản của bạn.'}
            </p>

            {!inOtpStep && !complete && (
              <div className="lum-reset-bridge-tabs" role="group" aria-label="Phương thức lấy lại mật khẩu">
                <button type="button" className={mode === 'otp' ? 'is-active' : ''}
                  disabled={busy} aria-pressed={mode === 'otp'} onClick={() => changeMode('otp')}>
                  <KeyRound size={17}/> Mã OTP
                </button>
                <button type="button" className={mode === 'link' ? 'is-active' : ''}
                  disabled={busy} aria-pressed={mode === 'link'} onClick={() => changeMode('link')}>
                  <Mail size={17}/> Liên kết email
                </button>
              </div>
            )}

            {complete ? (
              <div className="lum-reset-bridge-complete">
                <CheckCircle2 size={40} aria-hidden="true" />
                <p>Mật khẩu mới đã được lưu. Vui lòng đăng nhập lại.</p>
                <Link to="/login" className="lum-reset-bridge-primary-link">Đăng nhập ngay <ArrowRight size={18}/></Link>
              </div>
            ) : inOtpStep ? (
              <>
                <div className="lum-reset-bridge-recipient">
                  <Mail size={16} /><span title={sentTo}>{sentTo}</span>
                  <button type="button" disabled={busy} onClick={changeEmail}>Đổi email</button>
                </div>
                <form onSubmit={resetWithOtp} className="lum-reset-bridge-otp-form">
                  <label htmlFor="n3-otp-code">Mã xác minh 6 số</label>
                  <div className="lum-reset-input-wrap">
                    <KeyRound size={19}/>
                    <input id="n3-otp-code" ref={otpInputRef} type="text" inputMode="numeric"
                      autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={OTP_LENGTH} required
                      placeholder="● ● ● ● ● ●" aria-describedby="n3-otp-expiry" value={otp} disabled={busy}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}/>
                  </div>
                  <div id="n3-otp-expiry" className="lum-reset-bridge-helper"><Clock3 size={15}/> OTP có hiệu lực 5 phút kể từ khi gửi.</div>
                  <label htmlFor="n3-otp-password">Mật khẩu mới</label>
                  <div className="lum-reset-input-wrap">
                    <LockKeyhole size={19}/>
                    <input id="n3-otp-password" type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={200}
                      autoComplete="new-password" placeholder="Nhập mật khẩu mới" value={password} disabled={busy}
                      onChange={e => setPassword(e.target.value)}/>
                    <button type="button" className="lum-reset-bridge-eye" disabled={busy}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      onClick={() => setShowPassword(value => !value)}>
                      {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                    </button>
                  </div>
                  <PasswordStrengthHint password={password} confirm={confirm}/>
                  <label htmlFor="n3-otp-confirm">Xác nhận mật khẩu mới</label>
                  <div className="lum-reset-input-wrap">
                    <ShieldCheck size={19}/>
                    <input id="n3-otp-confirm" type={showPassword ? 'text' : 'password'} required minLength={8} maxLength={200}
                      autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" value={confirm} disabled={busy}
                      onChange={e => setConfirm(e.target.value)}/>
                  </div>
                  <button className="lum-reset-submit" type="submit"
                    disabled={busy || otp.length !== OTP_LENGTH || !isStrongPassword(password) || password !== confirm}>
                    {busy ? <><LoaderCircle className="lum-reset-spin" size={20}/> Đang xác minh...</>
                      : <><ShieldCheck size={20}/> Đặt lại mật khẩu</>}
                  </button>
                </form>
                <div className="lum-reset-bridge-resend">
                  <span>Chưa nhận được mã?</span>
                  <button type="button" disabled={busy || cooldown > 0} onClick={() => { void requestOtp(); }}>
                    <RefreshCw size={15}/> {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại OTP'}
                  </button>
                </div>
              </>
            ) : mode === 'otp' || !linkSent ? (
              <form onSubmit={mode === 'otp' ? requestOtp : sendLink}>
                <label htmlFor="n3-reset-email">Địa chỉ email</label>
                <div className="lum-reset-input-wrap">
                  <Mail size={20}/>
                  <input id="n3-reset-email" type="email" required autoComplete="email" maxLength={254}
                    placeholder="name@gmail.com" value={email} disabled={busy}
                    onChange={e => setEmail(e.target.value)}/>
                  {email && !busy && <button type="button" className="lum-reset-clear" onClick={() => setEmail('')} aria-label="Xóa email">×</button>}
                </div>
                <button className="lum-reset-submit" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className="lum-reset-spin" size={20}/> : mode === 'otp' ? <KeyRound size={20}/> : <Send size={20}/>}
                  {busy ? 'Đang gửi xác minh...' : mode === 'otp' ? 'Gửi mã OTP' : 'Gửi liên kết đặt lại mật khẩu'}
                </button>
              </form>
            ) : (
              <div className="lum-reset-bridge-link-sent">
                <CheckCircle2 size={38}/>
                <p>Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư.</p>
                <button type="button" onClick={() => setLinkSent(false)}>Thử gửi lại hoặc đổi email</button>
              </div>
            )}

            {notice && (
              <div className={`lum-reset-notice ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>
                {error ? <CircleHelp size={22}/> : <CheckCircle2 size={22}/>}
                <span>{notice}</span>
              </div>
            )}
            {!complete && <div className="lum-reset-help">
              <div className="lum-reset-help-title"><CircleHelp size={21}/><strong>Không nhận được email?</strong></div>
              <ul>
                <li>Kiểm tra thư Spam hoặc Quảng cáo.</li>
                <li>OTP 6 số có hiệu lực 5 phút; liên kết email có hiệu lực 20 phút.</li>
                <li>Nếu gặp vấn đề, có thể chọn phương thức xác minh còn lại.</li>
              </ul>
            </div>}
            <div className="lum-reset-secure"><ShieldCheck size={15}/> Thông tin xác minh chỉ dùng để khôi phục mật khẩu của bạn.</div>
          </div>
        </section>
      </div>
    </main>
  );
}
