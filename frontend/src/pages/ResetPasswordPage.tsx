import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { authApi } from '../services/authApi';
import PasswordStrengthHint from '../components/PasswordStrengthHint';
import { isStrongPassword } from '../utils/passwordPolicy';
import '../styles/reset-password-modern.css';

export default function ResetPasswordPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get('token') ?? ''
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (token) {
      window.history.replaceState(window.history.state, '', '/reset-password');
    }
  }, [token]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice('');
    setSuccess(false);
    if (busy) return;
    if (!token) {
      setNotice('Không tìm thấy mã khôi phục. Hãy yêu cầu gửi lại liên kết.');
      return;
    }
    if (!isStrongPassword(password)) {
      setNotice('Mật khẩu phải có 8–200 ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return;
    }
    if (password !== confirm) {
      setNotice('Xác nhận mật khẩu không khớp.');
      return;
    }

    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setPassword('');
      setConfirm('');
      setSuccess(true);
      setNotice('Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.');
    } catch (error: unknown) {
      const code = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string } | undefined)?.code
        : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      setNotice(
        code === 'PASSWORD_RESET_INVALID_TOKEN'
          ? 'Liên kết đã hết hạn, không hợp lệ hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.'
          : status === 400
          ? 'Mật khẩu mới hoặc liên kết không hợp lệ.'
          : !status
          ? 'Không kết nối được Backend. Hãy kiểm tra Spring Boot và Vite proxy.'
          : 'Đặt lại mật khẩu thất bại. Mã HTTP: ' + status
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="lum-rp-page">
      <div className="lum-rp-shell">
        <aside className="lum-rp-aside" aria-label="Thông tin bảo mật">
          <Link to="/" className="lum-rp-brand">
            <Sparkles size={28} />
            <strong>Lumina Studio</strong>
          </Link>

          <div className="lum-rp-aside-body">
            <h1>Tạo mật khẩu mới an toàn</h1>
            <p>
              Hãy đặt mật khẩu mạnh để bảo vệ tài khoản của bạn trước các truy
              cập trái phép.
            </p>

            <div className="lum-rp-benefits">
              <div>
                <span><ShieldCheck size={22} /></span>
                <p>
                  <strong>Bảo mật hơn</strong>
                  <small>Cần chữ hoa, chữ thường, số và ký tự đặc biệt</small>
                </p>
              </div>

              <div>
                <span><KeyRound size={22} /></span>
                <p>
                  <strong>Liên kết dùng một lần</strong>
                  <small>Không thể tái sử dụng sau khi hoàn tất</small>
                </p>
              </div>

              <div>
                <span><RefreshCcw size={22} /></span>
                <p>
                  <strong>Đăng nhập lại dễ dàng</strong>
                  <small>Sau khi đổi xong, hãy dùng mật khẩu mới</small>
                </p>
              </div>
            </div>
          </div>

          <div className="lum-rp-art" aria-hidden="true">
            <div className="lum-rp-art-glow" />
            <div className="lum-rp-lock-card">
              <div className="lum-rp-lock-icon">
                <LockKeyhole size={88} strokeWidth={1.4} />
              </div>
              <div className="lum-rp-lock-badge">
                <ShieldCheck size={22} />
              </div>
            </div>
          </div>
        </aside>

        <section className="lum-rp-content">
          <div className="lum-rp-top">
            <Link to="/login" className="lum-rp-back">
              <ArrowLeft size={18} />
              Quay lại đăng nhập
            </Link>
          </div>

          <div className="lum-rp-form-area">
            <div className="lum-rp-main-icon">
              <LockKeyhole size={30} />
            </div>

            <h2>Đặt lại mật khẩu</h2>
            <p className="lum-rp-lead">
              Nhập mật khẩu mới cho tài khoản Lumina của bạn để tiếp tục đăng nhập an toàn.
            </p>

            {!token && (
              <div className="lum-rp-notice is-error" role="alert">
                <CircleAlert size={22} />
                <span>Không tìm thấy mã khôi phục. Hãy quay lại và yêu cầu gửi liên kết mới.</span>
              </div>
            )}

            {!!token && !success && (
              <form onSubmit={submit} className="lum-rp-form">
                <label className="lum-rp-field">
                  <span>Mật khẩu mới</span>
                  <div className="lum-rp-input-wrap">
                    <LockKeyhole size={20} />
                    <input
                      type={show ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={200}
                      autoComplete="new-password"
                      placeholder="Ít nhất 8 ký tự"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </label>

                <PasswordStrengthHint password={password} confirm={confirm} />

                <label className="lum-rp-field">
                  <span>Xác nhận mật khẩu mới</span>
                  <div className="lum-rp-input-wrap">
                    <KeyRound size={20} />
                    <input
                      type={show ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Nhập lại mật khẩu mới"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                </label>

                <label className="lum-rp-toggle">
                  <input
                    type="checkbox"
                    checked={show}
                    onChange={(e) => setShow(e.target.checked)}
                  />
                  <span>{show ? <EyeOff size={16} /> : <Eye size={16} />} Hiện mật khẩu</span>
                </label>

                <button className="lum-rp-submit" disabled={busy || !isStrongPassword(password) || password !== confirm} type="submit">
                  {busy ? <LoaderCircle className="lum-rp-spin" size={20} /> : <ShieldCheck size={20} />}
                  {busy ? 'Đang lưu mật khẩu mới...' : 'Đặt lại mật khẩu'}
                </button>
              </form>
            )}

            {success && (
              <div className="lum-rp-success-box">
                <div className="lum-rp-success-icon">
                  <CheckCircle2 size={34} />
                </div>
                <h3>Thành công!</h3>
                <p>Mật khẩu của bạn đã được cập nhật. Giờ bạn có thể đăng nhập bằng mật khẩu mới.</p>
                <Link to="/login" className="lum-rp-login-btn">Đăng nhập ngay</Link>
              </div>
            )}

            {notice && !success && (
              <div className="lum-rp-notice is-error" role="alert">
                <CircleHelp size={22} />
                <span>{notice}</span>
              </div>
            )}

            <div className="lum-rp-help">
              <div className="lum-rp-help-title">
                <CircleHelp size={20} />
                <strong>Mẹo tạo mật khẩu tốt</strong>
              </div>
              <ul>
                <li>Dùng tối thiểu 8 ký tự.</li>
                <li>Nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.</li>
                <li>Không nên dùng ngày sinh hoặc thông tin quá dễ đoán.</li>
                <li>Không chia sẻ mật khẩu với người khác.</li>
              </ul>
            </div>

            <div className="lum-rp-bottom-links">
              <Link to="/login">Quay lại đăng nhập</Link>
              <Link to="/forgot-password">Gửi lại liên kết</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
