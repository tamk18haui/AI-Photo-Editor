import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import '../styles/auth-modern.css';

export default function ResetPasswordPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [notice,setNotice] = useState('');
  const [success,setSuccess] = useState(false);
  const [busy,setBusy] = useState(false);
  const [show,setShow] = useState(false);
  useEffect(() => {
    if (token) window.history.replaceState(window.history.state, '', '/reset-password');
  }, [token]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setNotice('');
    if (password.length < 8) return setNotice('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password.length > 200) return setNotice('Mật khẩu mới tối đa 200 ký tự.');
    if (password !== confirm) return setNotice('Xác nhận mật khẩu không khớp.');
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setPassword(''); setConfirm(''); setSuccess(true);
      setNotice('Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.');
    } catch (error: unknown) {
      const code = axios.isAxiosError(error) ? (error.response?.data as {code?:string}|undefined)?.code : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setNotice(code === 'PASSWORD_RESET_INVALID_TOKEN'
        ? 'Liên kết hết hạn, sai hoặc đã sử dụng. Hãy yêu cầu email mới.'
        : status === 400 ? 'Mật khẩu mới hoặc liên kết không hợp lệ.'
        : !status ? 'Không kết nối được Backend 8080.' : 'Đặt lại mật khẩu thất bại. Mã HTTP: '+status);
    } finally {setBusy(false);}
  };
  return <main className="lum-auth-shell">
    <section className="lum-auth-card" style={{maxWidth:460,margin:'8vh auto'}}>
      <div className="lum-card-content">
        <h2>Đặt lại mật khẩu</h2>
        {!token && <p role="alert">Không tìm thấy mã khôi phục. Hãy yêu cầu email mới.</p>}
        {!!token && !success && <form className="lum-auth-form" onSubmit={submit}>
          <label className="lum-field"><span>Mật khẩu mới</span>
            <input type={show?'text':'password'} required minLength={8} maxLength={200}
              autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} />
          </label>
          <label className="lum-field"><span>Xác nhận mật khẩu mới</span>
            <input type={show?'text':'password'} required autoComplete="new-password"
              value={confirm} onChange={e=>setConfirm(e.target.value)} />
          </label>
          <label style={{fontSize:13}}><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Hiện mật khẩu</label>
          <button className="lum-primary-auth" disabled={busy} type="submit">
            {busy?'Đang lưu...':'Đặt lại mật khẩu'}
          </button>
        </form>}
        {notice && <p role={success?'status':'alert'} style={{color:success?'#08744b':'#b42318'}}>{notice}</p>}
        <Link to="/login">Quay lại đăng nhập</Link>
        <p><Link to="/forgot-password">Gửi lại liên kết</Link></p>
      </div>
    </section>
  </main>;
}
