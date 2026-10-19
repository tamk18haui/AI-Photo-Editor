import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import axios from 'axios';
import { CircleUserRound, KeyRound, LogOut, UserRound, X, Link2, Eye, EyeOff, Save } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { authSession } from '../services/authSession';
import GoogleAuthButton from './GoogleAuthButton';
import PasswordStrengthHint from './PasswordStrengthHint';
import { isStrongPassword } from '../utils/passwordPolicy';

type Profile = { id: number; email: string; displayName: string | null; avatarUrl: string | null };
type View = 'menu' | 'password' | 'profile' | 'google';

const fieldStyle: CSSProperties = { display:'block', width:'100%', boxSizing:'border-box', padding:'10px 12px',
  border:'1px solid #ded7f2', borderRadius:10, marginTop:5, background:'#fff', color:'#1f1740', fontSize:14 };
const actionStyle: CSSProperties = { width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9,
  padding:'10px 12px', border:'none', borderRadius:10, cursor:'pointer',
  background:'#f5f2ff', color:'#34256f', fontWeight:600, fontSize:14 };

export default function AccountMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const clearSecretFields = () => {
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPassword(false);
  };
  const close = () => { setOpen(false); setView('menu'); clearSecretFields(); setMessage(''); setSuccess(false); };

  const openMenu = () => {
    if (open) { close(); return; }
    setOpen(true); setView('menu'); setMessage(''); setSuccess(false);
    void apiClient.get<Profile>('/users/me').then(({data}) => {
      setProfile(data); setDisplayName(data.displayName ?? '');
    }).catch((error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        authSession.clear(); close(); navigate('/login', { replace:true });
      } else setMessage('Không tải được thông tin tài khoản. Kiểm tra Backend.');
    });
  };

  const logout = async () => {
    setLoading(true);
    try {
      const refreshToken = authSession.getRefreshToken();
      if (refreshToken) await apiClient.post('/auth/logout', {refreshToken});
    } catch { /* Local tokens are always cleared. */ }
    finally { authSession.clear(); close(); setLoading(false); navigate('/login', { replace:true }); }
  };

  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setMessage(''); setSuccess(false);
    if (!currentPassword) return setMessage('Vui lòng nhập mật khẩu hiện tại.');
    if (newPassword.length < 8) return setMessage('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (newPassword.length > 200) return setMessage('Mật khẩu mới không được vượt quá 200 ký tự.');
    if (!isStrongPassword(newPassword)) return setMessage('Mật khẩu mới cần chữ hoa, chữ thường, chữ số và ký tự đặc biệt.');
    if (currentPassword === newPassword) return setMessage('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
    if (newPassword !== confirmPassword) return setMessage('Xác nhận mật khẩu mới không khớp.');
    setLoading(true);
    try {
      await apiClient.put('/users/me/password', {currentPassword, newPassword});
      authSession.clear(); // all refresh tokens revoked by N3 backend
      clearSecretFields(); close();
      navigate('/login', { replace:true });
      window.alert('Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.');
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? (error.response?.data as {code?: string; message?: string}|undefined) : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (data?.code === 'AUTH_INVALID_CREDENTIALS') setMessage('Mật khẩu hiện tại không chính xác.');
      else if (data?.code === 'PASSWORD_SAME_AS_CURRENT' || data?.message === 'New password must differ')
        setMessage('Mật khẩu mới không được trùng với mật khẩu cũ.');
      else if (data?.code === 'GOOGLE_PASSWORD_NOT_SET' || data?.message === 'Password login not configured for this account')
        setMessage('Tài khoản Google chưa tạo mật khẩu riêng. Vui lòng đăng nhập Google.');
      else if (data?.code === 'PASSWORD_TOO_WEAK')
        setMessage('Mật khẩu mới cần 8–200 ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.');
      else if (data?.code === 'VALIDATION_ERROR' || status === 400)
        setMessage('Dữ liệu mật khẩu chưa hợp lệ (8–200 ký tự).');
      else if (status === 401) setMessage('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      else if (!status) setMessage('Không thể kết nối Backend 8080.');
      else setMessage('Đổi mật khẩu thất bại. Mã HTTP: '+status);
    } finally { setLoading(false); }
  };

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setMessage(''); setSuccess(false);
    if (!displayName.trim()) return setMessage('Tên hiển thị không được bỏ trống.');
    if (displayName.trim().length > 100) return setMessage('Tên hiển thị tối đa 100 ký tự.');
    setLoading(true);
    try {
      const result = await apiClient.patch<Profile>('/users/me', {displayName: displayName.trim()});
      setProfile(result.data); setSuccess(true); setMessage('Đã cập nhật thông tin tài khoản.');
    } catch (error:unknown) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      setMessage(status === 401 ? 'Phiên đăng nhập hết hạn.' : 'Không thể lưu thông tin tài khoản.');
    } finally { setLoading(false); }
  };

  if (!authSession.isLoggedIn()) {
    return <Link to="/login" className="circle-link" aria-label="Đăng nhập"><CircleUserRound size={21}/></Link>;
  }

  return <div style={{position:'relative',flexShrink:0}}>
    <button type="button" className="circle-link" style={{border:'none',cursor:'pointer'}}
      aria-label="Mở menu tài khoản" aria-expanded={open} onClick={openMenu}>
      <CircleUserRound size={21}/>
    </button>
    {open && <div role="dialog" aria-label="Tài khoản của tôi" style={{position:'absolute',right:0,top:46,width:330,
      maxWidth:'calc(100vw - 28px)', background:'white', border:'1px solid #e9e3f5',borderRadius:16,
      boxShadow:'0 16px 50px #25144224',padding:16,zIndex:200,color:'#241b40',textAlign:'left'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
        <strong>{view === 'password' ? 'Đổi mật khẩu' : view === 'profile' ? 'Thông tin tài khoản'
          : view === 'google' ? 'Liên kết Google' : 'Tài khoản của tôi'}</strong>
        <button type="button" onClick={close} aria-label="Đóng menu"
          style={{border:'none',background:'transparent',cursor:'pointer',color:'#49405c'}}><X size={19}/></button>
      </div>
      {view === 'menu' && <div style={{display:'grid',gap:9}}>
        <div style={{padding:'10px 12px',background:'#fbfaff',borderRadius:10,overflowWrap:'anywhere'}}>
          <div style={{display:'flex',gap:7,alignItems:'center'}}><UserRound size={16}/><strong>{profile?.displayName || 'Người dùng Lumina'}</strong></div>
          <div style={{fontSize:13,marginTop:5,color:'#675b7d'}}>{profile?.email || 'Đang tải tài khoản...'}</div>
        </div>
        <button type="button" style={actionStyle} onClick={()=>{setView('profile');setMessage('');setSuccess(false)}}>
          <UserRound size={17}/> Thông tin tài khoản
        </button>
        <button type="button" style={actionStyle} onClick={()=>{setView('password');setMessage('');setSuccess(false)}}>
          <KeyRound size={17}/> Đổi mật khẩu
        </button>
        <button type="button" style={actionStyle} onClick={()=>{setView('google');setMessage('');setSuccess(false)}}>
          <Link2 size={17}/> Liên kết đăng nhập Google
        </button>
        <button type="button" style={actionStyle} onClick={()=>void logout()} disabled={loading}>
          <LogOut size={17}/> Đăng xuất
        </button>
      </div>}
      {view === 'profile' && <form onSubmit={e=>void saveProfile(e)} style={{display:'grid',gap:12}}>
        <label style={{fontSize:13,fontWeight:600}}>Email (không thể sửa)
          <input style={fieldStyle} value={profile?.email ?? ''} readOnly />
        </label>
        <label style={{fontSize:13,fontWeight:600}}>Tên hiển thị
          <input style={fieldStyle} value={displayName} maxLength={100} onChange={e=>setDisplayName(e.target.value)} required />
        </label>
        <button type="submit" style={{...actionStyle,justifyContent:'center',background:'#5c46d8',color:'white'}} disabled={loading}>
          <Save size={16}/>{loading?'Đang lưu...':'Lưu thông tin'}
        </button>
      </form>}
      {view === 'password' && <form onSubmit={e=>void changePassword(e)} style={{display:'grid',gap:12}}>
        <label style={{fontSize:13,fontWeight:600}}>Mật khẩu hiện tại
          <input style={fieldStyle} type={showPassword?'text':'password'} autoComplete="current-password"
            value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required />
        </label>
        <label style={{fontSize:13,fontWeight:600}}>Mật khẩu mới
          <input style={fieldStyle} type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={200}
            value={newPassword} onChange={e=>setNewPassword(e.target.value)} required />
        </label>
        <PasswordStrengthHint password={newPassword} confirm={confirmPassword} />
        <label style={{fontSize:13,fontWeight:600}}>Xác nhận mật khẩu mới
          <input style={fieldStyle} type={showPassword?'text':'password'} autoComplete="new-password"
            value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
        </label>
        <button type="button" onClick={()=>setShowPassword(v=>!v)} style={{...actionStyle,justifyContent:'center'}}>
          {showPassword?<EyeOff size={16}/>:<Eye size={16}/>} {showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}
        </button>
        <button type="submit" disabled={loading || !isStrongPassword(newPassword) || newPassword !== confirmPassword || !currentPassword || currentPassword === newPassword}
          style={{...actionStyle,justifyContent:'center',background:'#5c46d8',color:'white',opacity:loading || !isStrongPassword(newPassword) || newPassword !== confirmPassword || !currentPassword || currentPassword === newPassword ? 0.55 : 1}}>
          {loading?'Đang xử lý...':'Lưu mật khẩu mới'}
        </button>
        <Link to="/forgot-password" onClick={close} style={{fontSize:13,textAlign:'center'}}>Quên mật khẩu hiện tại?</Link>
      </form>}
      {view === 'google' && <div style={{display:'grid',gap:12}}>
        <p style={{fontSize:13,margin:0}}>Chọn đúng tài khoản Google có email <strong>{profile?.email}</strong>. Sau khi liên kết, bạn có thể đăng nhập bằng Google hoặc mật khẩu.</p>
        <GoogleAuthButton mode="link" onDone={()=>{setSuccess(true);setMessage('Liên kết Google thành công. Bạn có thể đăng nhập bằng Google.')}}
          onError={message=>{setSuccess(false);setMessage(message)}}/>
      </div>}
      {view !== 'menu' && <button type="button" onClick={()=>{setView('menu');setMessage('');setSuccess(false);clearSecretFields()}}
        style={{...actionStyle,justifyContent:'center',marginTop:12}}>Quay lại</button>}
      {message && <p role={success?'status':'alert'} style={{fontSize:13,color:success?'#08744b':'#b42318',margin:'12px 2px 0'}}>{message}</p>}
    </div>}
  </div>;
}
