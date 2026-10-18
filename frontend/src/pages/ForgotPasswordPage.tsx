import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import '../styles/auth-modern.css';

export default function ForgotPasswordPage() {
  const [email,setEmail] = useState('');
  const [notice,setNotice] = useState('');
  const [success,setSuccess] = useState(false);
  const [busy,setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setNotice(''); setSuccess(false);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
      setNotice('Nếu email này tồn tại trong hệ thống, liên kết đặt lại mật khẩu sẽ được gửi. Kiểm tra cả thư Spam.');
    } catch (error: unknown) {
      const code = axios.isAxiosError(error) ? (error.response?.data as {code?:string}|undefined)?.code : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setNotice(code === 'PASSWORD_RESET_NOT_CONFIGURED' ? 'Backend chưa cấu hình SMTP gửi email.'
        : code === 'PASSWORD_RESET_EMAIL_FAILED' ? 'Máy chủ không gửi được email. Kiểm tra SMTP hoặc App Password.'
        : status === 400 ? 'Địa chỉ email chưa đúng định dạng.'
        : !status ? 'Không kết nối được Backend tại cổng 8080.'
        : 'Gửi yêu cầu thất bại. Mã HTTP: '+status);
    } finally {setBusy(false);}
  };
  return <main className="lum-auth-shell">
    <section className="lum-auth-card" style={{maxWidth:460,margin:'8vh auto'}}>
      <div className="lum-card-content">
        <h2>Quên mật khẩu?</h2><p>Nhập email tài khoản Lumina để nhận liên kết đặt lại mật khẩu.</p>
        <form className="lum-auth-form" onSubmit={submit}>
          <label className="lum-field"><span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
          </label>
          <button className="lum-primary-auth" type="submit" disabled={busy}>
            {busy?'Đang gửi...':'Gửi liên kết đặt lại mật khẩu'}
          </button>
        </form>
        {notice && <p role={success?'status':'alert'} style={{color:success?'#08744b':'#b42318'}}>{notice}</p>}
        <Link to="/login">Quay lại đăng nhập</Link>
      </div>
    </section>
  </main>;
}
