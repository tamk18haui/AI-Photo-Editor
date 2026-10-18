
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { authApi } from '../services/authApi';
import { authSession } from '../services/authSession';

import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
  Star,
  Check,
} from 'lucide-react';

import '../styles/auth-modern.css';

type Mode = 'login' | 'register';
type NoticeType = 'error' | 'info';

const slides = [
  '/lumina-auth-slide-1.png',
  '/lumina-auth-slide-2.png',
  '/lumina-auth-slide-3.png',
];

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);

  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<NoticeType>('info');
  const [loading, setLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const register = mode === 'register';

  // Tự động chuyển ảnh bên trái
  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  // Hiển thị thông báo
  const showNotice = (
    message: string,
    type: NoticeType = 'error'
  ) => {
    setNotice(message);
    setNoticeType(type);
  };

  // Chuyển giữa đăng nhập và đăng ký
  const switchMode = (next: Mode) => {
    if (loading) return;

    setMode(next);
    setNotice('');
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  // Xử lý lỗi trả về từ Backend N3
  const handleApiError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      showNotice('Đã xảy ra lỗi không xác định.');
      return;
    }

    if (!error.response) {
      showNotice(
        'Không thể kết nối Backend. Vui lòng kiểm tra Spring Boot.'
      );
      return;
    }

    const status = error.response.status;
    const data = error.response.data;
    const code = data?.code;

    if (code === 'AUTH_INVALID_CREDENTIALS') {
      showNotice('Email hoặc mật khẩu không chính xác.');
      return;
    }

    if (code === 'EMAIL_ALREADY_EXISTS') {
      showNotice('Email này đã được đăng ký.');
      return;
    }

    if (code === 'VALIDATION_ERROR' || code === 'INVALID_REQUEST') {
      showNotice('Thông tin đăng ký không hợp lệ.');
      return;
    }

    if (status === 400) {
      showNotice('Vui lòng kiểm tra lại thông tin.');
    } else if (status === 401) {
      showNotice('Email hoặc mật khẩu không chính xác.');
    } else if (status === 409) {
      showNotice('Email này đã tồn tại trong hệ thống.');
    } else if (status === 429) {
      showNotice('Quá nhiều yêu cầu. Vui lòng thử lại sau.');
    } else if (status >= 500) {
      showNotice('Backend đang gặp lỗi. Vui lòng thử lại.');
    } else {
      showNotice('Không thể xử lý yêu cầu.');
    }
  };

  // Gọi API đăng nhập / đăng ký thật
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showNotice('Vui lòng nhập email và mật khẩu.');
      return;
    }

    if (register) {
      if (!displayName.trim()) {
        showNotice('Vui lòng nhập tên hiển thị.');
        return;
      }

      if (password.length < 8) {
        showNotice('Mật khẩu phải có ít nhất 8 ký tự.');
        return;
      }

      if (password !== confirm) {
        showNotice('Mật khẩu xác nhận chưa trùng khớp.');
        return;
      }

      if (!agree) {
        showNotice('Vui lòng đồng ý với điều khoản sử dụng.');
        return;
      }
    }

    setLoading(true);
    setNotice('');

    try {
      // Đăng ký hoặc đăng nhập với API N3
      const response = register
        ? await authApi.register({
            email: normalizedEmail,
            password,
            displayName: displayName.trim(),
          })
        : await authApi.login({
            email: normalizedEmail,
            password,
          });

      if (!response.accessToken) {
        showNotice('Backend không trả về access token.');
        return;
      }

      // Lưu token vào phiên
      authSession.save(response);

      // Xóa mật khẩu khỏi state
      setPassword('');
      setConfirm('');

      // Chuyển sang danh sách dự án
      navigate('/projects', { replace: true });
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="lum-auth-shell">
      <div className="lum-auth-ambient lum-orb-one" />
      <div className="lum-auth-ambient lum-orb-two" />

      <div className="lum-auth-inner">
        {/* HEADER */}
        <header className="lum-auth-header">
          <Link
            to="/"
            className="lum-auth-logo"
            aria-label="Lumina Studio – Trang chủ"
          >
            <span className="lum-logo-spark">
              <Sparkles size={25} fill="currentColor" />
            </span>
            <span>
              <strong>LUMINA</strong>
              <small>STUDIO</small>
            </span>
          </Link>

          <span className="lum-auth-header-note">
            Creative <b>·</b> AI <b>·</b> Professional
          </span>

          <Link className="lum-auth-return" to="/">
            <ArrowLeft size={15} />
            Trang chủ
          </Link>
        </header>

        <div className="lum-auth-body">
          {/* LEFT SIDE */}
          <section
            className="lum-auth-story"
            aria-label="Giới thiệu Lumina Studio"
          >
            <div className="lum-auth-storycopy">
              <span className="lum-story-kicker">
                ✧ YOUR CREATIVE UNIVERSE
              </span>
              <h1>
                Turn <br />
                Your Ideas <br />
                <em>into Masterpieces</em>
              </h1>
            </div>

            <div className="lum-collage-wrap">
              <div className="lum-collage-stage">
                {slides.map((src, index) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Minh họa sáng tạo Lumina ${index + 1}`}
                    className={`lum-collage-slide ${
                      index === activeSlide ? 'active' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            <div
              className="lum-auth-metrics"
              aria-label="Điểm nổi bật của Lumina"
            >
              <div>
                <strong>AI First</strong>
                <small>Công cụ sáng tạo</small>
              </div>
              <span className="lum-metric-divider" />
              <div>
                <strong>All-in-one</strong>
                <small>Chỉnh sửa & lưu trữ</small>
              </div>
              <span className="lum-metric-divider" />
              <div>
                <strong>Easy</strong>
                <small>Cho mọi nhà sáng tạo</small>
              </div>
            </div>

            <div className="lum-auth-testimonial">
              <div className="lum-avatar">L</div>
              <div className="lum-quote">
                <p>
                  “Biến cảm hứng thành những bức ảnh thật ấn tượng,
                  ngay trong trình duyệt.”
                </p>
                <span>Trải nghiệm Lumina Studio</span>
              </div>
              <div
                className="lum-stars"
                aria-label="Thiết kế sáng tạo"
              >
                <Star size={14} fill="currentColor" />
                <Star size={14} fill="currentColor" />
                <Star size={14} fill="currentColor" />
              </div>
            </div>

            <div className="lum-story-dots">
              {slides.map((_, index) => (
                <i
                  key={index}
                  className={index === activeSlide ? 'active' : ''}
                />
              ))}
            </div>
          </section>

          {/* RIGHT SIDE */}
          <section
            className="lum-auth-card"
            aria-label={register ? 'Đăng ký tài khoản' : 'Đăng nhập'}
          >
            <div className="lum-auth-switchtop">
              <span>
                {register
                  ? 'Bạn đã có tài khoản?'
                  : 'Bạn chưa có tài khoản?'}
              </span>
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  switchMode(register ? 'login' : 'register')
                }
              >
                {register ? 'Đăng nhập' : 'Đăng ký'}
              </button>
            </div>

            <div className="lum-card-content" key={mode}>
              <div className="lum-form-spark">
                <Sparkles size={23} fill="currentColor" />
              </div>

              <h2>
                {register
                  ? 'Tạo tài khoản mới'
                  : 'Chào mừng trở lại'}
              </h2>

              <p className="lum-auth-subtitle">
                {register
                  ? 'Tham gia Lumina Studio và bắt đầu sáng tạo ngay hôm nay.'
                  : 'Đăng nhập để tiếp tục hành trình sáng tạo cùng Lumina Studio.'}
              </p>

              {/* GOOGLE */}
              <button
                type="button"
                className="lum-google-btn"
                disabled={loading}
                onClick={() =>
                  showNotice(
                    'Đăng nhập Google chưa được kết nối với Backend N3.',
                    'info'
                  )
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.35 12.24c0-.73-.06-1.43-.19-2.1H12v3.86h5.22a4.47 4.47 0 0 1-1.94 2.94v2.46h3.15c1.84-1.7 2.92-4.2 2.92-7.16Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 21.75c2.63 0 4.83-.87 6.43-2.35l-3.15-2.46c-.87.59-1.99.94-3.28.94-2.53 0-4.68-1.71-5.45-4H3.31v2.52A9.75 9.75 0 0 0 12 21.75Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.55 13.88a5.85 5.85 0 0 1 0-3.76V7.6H3.31a9.75 9.75 0 0 0 0 8.8l3.24-2.52Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 6.13c1.43 0 2.7.5 3.7 1.45l2.78-2.78A9.37 9.37 0 0 0 12 2.25 9.75 9.75 0 0 0 3.31 7.6l3.24 2.52c.77-2.29 2.92-3.99 5.45-3.99Z"
                  />
                </svg>
                {register
                  ? 'Đăng ký với Google'
                  : 'Đăng nhập với Google'}
              </button>

              <div className="lum-auth-separator">
                <span>hoặc</span>
              </div>

              {/* FORM */}
              <form onSubmit={submit} className="lum-auth-form">
                {register && (
                  <label className="lum-field">
                    <span>Tên hiển thị</span>
                    <div className="lum-field-control">
                      <UserRound size={18} />
                      <input
                        value={displayName}
                        onChange={(e) =>
                          setDisplayName(e.target.value)
                        }
                        placeholder="Nhập tên của bạn"
                        maxLength={100}
                        autoComplete="name"
                        disabled={loading}
                        required
                      />
                    </div>
                  </label>
                )}

                <label className="lum-field">
                  <span>Địa chỉ email</span>
                  <div className="lum-field-control">
                    <Mail size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@creativestudio.com"
                      autoComplete="email"
                      disabled={loading}
                      required
                    />
                  </div>
                </label>

                <label className="lum-field">
                  <span>Mật khẩu</span>
                  <div className="lum-field-control">
                    <LockKeyhole size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        register
                          ? 'Ít nhất 8 ký tự'
                          : 'Nhập mật khẩu của bạn'
                      }
                      minLength={register ? 8 : undefined}
                      autoComplete={
                        register ? 'new-password' : 'current-password'
                      }
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      className="lum-eye-btn"
                      aria-label={
                        showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                      }
                      onClick={() => setShowPassword((p) => !p)}
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </label>

                {register && (
                  <label className="lum-field">
                    <span>Xác nhận mật khẩu</span>
                    <div className="lum-field-control">
                      <LockKeyhole size={18} />
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Nhập lại mật khẩu"
                        minLength={8}
                        autoComplete="new-password"
                        disabled={loading}
                        required
                      />
                      <button
                        type="button"
                        className="lum-eye-btn"
                        aria-label={
                          showConfirm
                            ? 'Ẩn mật khẩu xác nhận'
                            : 'Hiện mật khẩu xác nhận'
                        }
                        onClick={() => setShowConfirm((p) => !p)}
                      >
                        {showConfirm ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </label>
                )}

                {register ? (
                  <label className="lum-tick">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      disabled={loading}
                      required
                    />
                    <span>
                      Tôi đồng ý với{' '}
                      <a
                        href="#terms"
                        onClick={(e) => {
                          e.preventDefault();
                          showNotice(
                            'Điều khoản sử dụng cần được nhóm bổ sung.',
                            'info'
                          );
                        }}
                      >
                        Điều khoản sử dụng
                      </a>
                      {' '}và{' '}
                      <a
                        href="#privacy"
                        onClick={(e) => {
                          e.preventDefault();
                          showNotice(
                            'Chính sách bảo mật cần được nhóm bổ sung.',
                            'info'
                          );
                        }}
                      >
                        Chính sách bảo mật
                      </a>.
                    </span>
                  </label>
                ) : (
                  <div className="lum-auth-extras">
                    <span className="lum-auth-hint">
                      <Check size={15} />
                      Bảo mật tài khoản
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        showNotice(
                          'Chức năng quên mật khẩu chưa có API.',
                          'info'
                        )
                      }
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  className="lum-primary-auth"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading
                    ? 'Đang xử lý...'
                    : register
                      ? 'Tạo tài khoản Lumina Studio'
                      : 'Đăng nhập vào Lumina Studio'}
                  {!loading && <ArrowRight size={18} />}
                </button>
              </form>

              {notice && (
                <div
                  className="lum-form-notice"
                  role={noticeType === 'error' ? 'alert' : 'status'}
                  style={{
                    color:
                      noticeType === 'error' ? '#dc3545' : 'inherit',
                  }}
                >
                  {notice}
                </div>
              )}

              <div className="lum-auth-security">
                <ShieldCheck size={17} />
                Xác thực tài khoản qua Spring Boot API
              </div>
            </div>
          </section>
        </div>

        <footer className="lum-auth-footer">
          © Lumina Studio · Creative AI Workspace
        </footer>
      </div>
    </main>
  );
}
