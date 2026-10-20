import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowLeft, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Crown, DownloadCloud, FileClock, HardDrive, LayoutDashboard, LockKeyhole, LogOut,
  RefreshCw, Search, Shield, ShieldCheck, UserCheck, Users, XCircle,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type { AdminAudit, AdminDashboard, AdminPage, AdminUser, AccountRole, AccountStatus, SubscriptionPlan } from '../services/adminApi';
import { authSession } from '../services/authSession';
import './admin-page.css';

type Tab = 'overview' | 'users' | 'audit' | 'plans';
const nf = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const date = (v: string | null | undefined) => v ? new Date(v).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'}) : '—';
const bytes = (n: number) => n >= 1_073_741_824 ? `${(n/1_073_741_824).toFixed(2)} GB` : `${(n/1_048_576).toFixed(1)} MB`;
const errorText = (e: unknown) => {
  if (!axios.isAxiosError(e)) return 'Có lỗi xảy ra. Vui lòng thử lại.';
  const code = (e.response?.data as { code?:string } | undefined)?.code;
  if (code === 'ADMIN_SELF_ROLE' || code === 'ADMIN_SELF_LOCK') return 'Không thể tự thay đổi quyền hoặc trạng thái tài khoản của mình.';
  if (code === 'ADMIN_PROTECTED') return 'Hãy hạ quyền Admin trước khi khóa tài khoản này.';
  if (code === 'INVALID_PREMIUM_DATE') return 'Gói Premium cần ngày hết hạn ở tương lai.';
  if (e.response?.status === 403) return 'Tài khoản không có quyền Admin.';
  if (!e.response) return 'Không kết nối được Backend. Hãy kiểm tra Spring Boot.';
  return `Máy chủ từ chối yêu cầu (HTTP ${e.response.status}).`;
};

function Metric({ icon:Icon, title, value, sub }: {icon:typeof Users; title:string; value:string; sub:string}) {
  return <div className="ad-metric"><span className="ad-metric-icon"><Icon size={19}/></span><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>;
}

function Trend({ stats }: {stats:AdminDashboard}) {
  const max = Math.max(1, ...stats.trend.map(t=>t.requests));
  return <section className="ad-panel ad-trend">
    <div className="ad-panel-heading"><div><h2>Lưu lượng API 7 ngày</h2><p>Đếm các yêu cầu API có đăng nhập, theo ngày UTC. Không phải lượt xem trang.</p></div><Activity size={21}/></div>
    <div className="ad-bars" role="img" aria-label="Biểu đồ các yêu cầu API đã xác thực trong 7 ngày">
      {stats.trend.map(point=><div className="ad-bar-day" key={point.day} title={`${point.day}: ${nf(point.requests)} requests, ${point.activeUsers} người hoạt động`}>
        <strong>{nf(point.requests)}</strong><div className="ad-bar-track"><div style={{height:`${point.requests ? Math.max(5, point.requests/max*100):2}%`}} className="ad-bar"/></div><span>{point.day.slice(5)}</span>
      </div>)}
    </div>
    <div className="ad-trend-foot"><span><b>{nf(stats.apiRequests7d)}</b> yêu cầu / 7 ngày</span><span><b>{nf(stats.activeUsers7d)}</b> người dùng hoạt động</span></div>
  </section>;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<'loading'|'yes'|'no'>('loading');
  const [name, setName] = useState('Quản trị viên');
  const [tab,setTab] = useState<Tab>('overview');
  const [dashboard,setDashboard] = useState<AdminDashboard|null>(null);
  const [users,setUsers] = useState<AdminPage<AdminUser>|null>(null);
  const [audit,setAudit] = useState<AdminPage<AdminAudit>|null>(null);
  const [query,setQuery] = useState('');
  const [search,setSearch] = useState('');
  const [roleFilter,setRoleFilter] = useState('');
  const [statusFilter,setStatusFilter] = useState('');
  const [planFilter,setPlanFilter] = useState('');
  const [page,setPage] = useState(0);
  const [auditPage,setAuditPage] = useState(0);
  const [selected,setSelected] = useState<AdminUser|null>(null);
  const [premiumUntil,setPremiumUntil] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [revision,setRevision] = useState(0);
  // N3_ADMIN_REACT_LINT_HOTFIX_V1: update UI clock outside render.
  const [nowMs,setNowMs] = useState(() => Date.now());
  useEffect(()=>{
    const timer = window.setInterval(()=>setNowMs(Date.now()),60_000);
    return ()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    if (!authSession.isLoggedIn()) { navigate('/login', {replace:true}); return; }
    let live = true;
    adminApi.me().then(me=>{if(live){setName(me.displayName||me.email);setAuthorized('yes');}})
      .catch(e=>{
        if(!live)return;
        if(axios.isAxiosError(e) && e.response?.status===401) navigate('/login',{replace:true});
        else setAuthorized('no');
      });
    return ()=>{live=false};
  },[navigate]);

  useEffect(()=>{
    if(authorized!=='yes')return;
    let live=true;
    const task = tab==='users' ? adminApi.users({page,size:12,search,role:roleFilter,status:statusFilter,plan:planFilter}).then(r=>{if(live)setUsers(r)})
      : tab==='audit' ? adminApi.audit(auditPage).then(r=>{if(live)setAudit(r)})
      : adminApi.dashboard().then(r=>{if(live)setDashboard(r)});
    void task.catch(e=>{if(live)setMessage(errorText(e))}).finally(()=>{if(live)setLoading(false)});
    return ()=>{live=false};
  },[authorized,tab,page,search,roleFilter,statusFilter,planFilter,auditPage,revision]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{setSearch(query.trim());setPage(0);},300);
    return ()=>window.clearTimeout(timer);
  },[query]);

  const reload=()=>{setLoading(true);setRevision(v=>v+1)};
  const change = async (kind:'role'|'status'|'plan', value:string) => {
    if(!selected||busy)return;
    const ask=kind==='role' ? `Đổi quyền ${selected.email} thành ${value}?`
      : kind==='status' ? `${value==='BLOCKED'?'KHÓA':'MỞ KHÓA'} tài khoản ${selected.email}?`
      : `Đổi gói ${selected.email} thành ${value}?\nĐây là cập nhật thủ công, KHÔNG thu tiền tự động.`;
    if (!window.confirm(ask)) return;
    setBusy(true); setMessage('');
    try {
      let updated:AdminUser;
      if (kind==='role') updated=await adminApi.setRole(selected.id,value as AccountRole);
      else if (kind==='status') updated=await adminApi.setStatus(selected.id,value as AccountStatus);
      else {
        let until:string|null=null;
        if (value==='PREMIUM') {
          if (!premiumUntil) {setMessage('Chọn ngày hết hạn Premium trước.');return;}
          const parsed = new Date(`${premiumUntil}T23:59:59`);
          if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {setMessage('Hạn Premium phải ở tương lai.');return;}
          until=parsed.toISOString();
        }
        updated=await adminApi.setPlan(selected.id,value as SubscriptionPlan,until);
      }
      setSelected(updated);
      setMessage('Đã cập nhật tài khoản và lưu nhật ký quản trị.');
      reload();
    } catch(e){setMessage(errorText(e));}
    finally{setBusy(false)}
  };

  const openUser=(u:AdminUser)=>{setSelected(u);setPremiumUntil(u.premiumUntil?new Date(u.premiumUntil).toISOString().slice(0,10):'');setMessage('')};
  const logout=()=>{authSession.clear();navigate('/login',{replace:true})};

  if(authorized==='loading')return <div className="ad-center">Đang xác thực quyền Admin…</div>;
  if(authorized==='no')return <main className="ad-center"><Shield size={34}/><h1>Không có quyền quản trị</h1><p>Chỉ tài khoản được cấp quyền ADMIN mới vào được trang này.</p><Link to="/projects">Về dự án của tôi</Link></main>;

  return <div className="ad-app">
    <aside className="ad-sidebar">
      <div className="ad-brand"><span className="ad-brand-symbol"><ShieldCheck size={24}/></span><div><b>LUMINA</b><small>ADMIN CONSOLE</small></div></div>
      <p className="ad-nav-caption">QUẢN TRỊ</p>
      {([['overview','Tổng quan',LayoutDashboard],['users','Tài khoản',Users],['audit','Nhật ký quản trị',FileClock],['plans','Gói dịch vụ',Crown]] as const).map(([key,label,Icon])=><button type="button" key={key} className={`ad-nav ${tab===key?'active':''}`} onClick={()=>{setLoading(true);setTab(key);setMessage('')}}><Icon size={19}/>{label}</button>)}
      <div className="ad-sidebar-bottom"><Link to="/projects" className="ad-nav"><ArrowLeft size={19}/> Về Studio</Link><button type="button" onClick={logout} className="ad-nav"><LogOut size={19}/> Đăng xuất</button></div>
    </aside>
    <main className="ad-main">
      <header className="ad-topbar"><div><span>HỆ THỐNG / QUẢN TRỊ</span><h1>{tab==='overview'?'Tổng quan hệ thống':tab==='users'?'Quản lý tài khoản':tab==='audit'?'Nhật ký quản trị':'Quản lý gói dịch vụ'}</h1></div><div className="ad-top-actions"><span className="ad-who"><ShieldCheck size={15}/> {name}</span><button type="button" className="ad-button light" onClick={reload} disabled={loading}><RefreshCw size={16}/> Làm mới</button></div></header>
      {message&&<div role="alert" className="ad-notice">{message}<button type="button" aria-label="Đóng thông báo" onClick={()=>setMessage('')}>×</button></div>}
      {loading&&<div className="ad-loading" role="status">Đang tải dữ liệu…</div>}
      {tab==='overview'&&dashboard&&<>
        <div className="ad-intro"><div><span>TRUNG TÂM ĐIỀU HÀNH</span><h2>Chào mừng trở lại!</h2><p>Thống kê thực từ database, cập nhật theo dữ liệu hiện có.</p></div><span className="ad-intro-art"><BarChart3 size={56}/></span></div>
        <div className="ad-metrics">
          <Metric icon={Users} title="Tổng tài khoản" value={nf(dashboard.usersTotal)} sub={`${nf(dashboard.newUsers7d)} đăng ký trong 7 ngày`}/>
          <Metric icon={UserCheck} title="Đang hoạt động" value={nf(dashboard.usersActive)} sub={`${nf(dashboard.usersBlocked)} tài khoản bị khóa`}/>
          <Metric icon={Crown} title="Premium còn hạn" value={nf(dashboard.premiumActive)} sub="Gán gói thủ công, chưa thanh toán"/>
          <Metric icon={Activity} title="API hôm nay" value={nf(dashboard.apiRequestsToday)} sub="Yêu cầu đã xác thực (UTC)"/>
          <Metric icon={DownloadCloud} title="Lượt xử lý AI" value={nf(dashboard.aiJobsTotal)} sub={`${nf(dashboard.aiJobsCompleted)} job hoàn thành`}/>
          <Metric icon={HardDrive} title="Dung lượng ảnh" value={bytes(dashboard.totalStorageBytes)} sub={`${nf(dashboard.assetsTotal)} asset · ${nf(dashboard.projectsTotal)} project`}/>
        </div>
        <div className="ad-overview-grid"><Trend stats={dashboard}/><section className="ad-panel"><div className="ad-panel-heading"><div><h2>Hoạt động hệ thống</h2><p>Các số liệu tổng hợp trên 7 ngày gần nhất</p></div><Clock size={20}/></div><div className="ad-quick-list"><div><span>Lượt tự lưu Editor</span><b>{nf(dashboard.editSaves7d)}</b></div><div><span>Người dùng dùng API</span><b>{nf(dashboard.activeUsers7d)}</b></div><div><span>Quản trị viên</span><b>{nf(dashboard.admins)}</b></div><div><span>Project hiện có</span><b>{nf(dashboard.projectsTotal)}</b></div></div></section></div>
      </>}
      {tab==='users'&&<>
        <div className="ad-tools"><label className="ad-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm theo email hoặc tên hiển thị..." maxLength={100}/></label>
          <select value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(0)}} aria-label="Lọc quyền"><option value="">Mọi quyền</option><option value="ADMIN">Admin</option><option value="USER">User</option></select>
          <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(0)}} aria-label="Lọc trạng thái"><option value="">Mọi trạng thái</option><option value="ACTIVE">Đang mở</option><option value="BLOCKED">Bị khóa</option></select>
          <select value={planFilter} onChange={e=>{setPlanFilter(e.target.value);setPage(0)}} aria-label="Lọc gói"><option value="">Mọi gói</option><option value="FREE">Free</option><option value="PREMIUM">Premium</option></select>
        </div>
        <section className="ad-panel ad-table-panel"><div className="ad-panel-heading"><div><h2>Danh sách tài khoản</h2><p>{nf(users?.totalElements??0)} tài khoản phù hợp bộ lọc · Chọn một hàng để quản lý</p></div><Users size={20}/></div>
          <div className="ad-scroll"><table className="ad-table"><thead><tr><th>Người dùng</th><th>Quyền</th><th>Gói</th><th>Trạng thái</th><th>Dự án / AI</th><th>Ngày tạo</th><th></th></tr></thead><tbody>{users?.items.map(u=><tr key={u.id}>
            <td><div className="ad-user-cell"><span className="ad-avatar">{(u.displayName||u.email).slice(0,1).toUpperCase()}</span><div><b>{u.displayName||'Chưa đặt tên'}</b><small>{u.email}</small></div></div></td>
            <td><span className={`ad-pill ${u.role==='ADMIN'?'purple':'grey'}`}>{u.role}</span></td>
            <td><span className={`ad-pill ${u.plan==='PREMIUM'?'gold':'grey'}`}>{u.plan==='PREMIUM' && u.premiumUntil && new Date(u.premiumUntil).getTime()<nowMs?'Hết hạn':u.plan}</span></td>
            <td><span className={`ad-pill ${u.status==='ACTIVE'?'green':'red'}`}>{u.status==='ACTIVE'?'Hoạt động':'Đã khóa'}</span></td>
            <td>{u.projectsCount} / {u.aiJobsCount}</td><td>{date(u.createdAt)}</td><td><button type="button" className="ad-link" onClick={()=>openUser(u)}>Quản lý →</button></td></tr>)}
            {!users?.items.length&&<tr><td colSpan={7} className="ad-empty">Không tìm thấy tài khoản nào.</td></tr>}
          </tbody></table></div><div className="ad-pagination"><span>Trang {(users?.page??0)+1}/{Math.max(1,users?.totalPages??1)}</span><div><button type="button" disabled={page===0||loading} onClick={()=>setPage(v=>Math.max(0,v-1))}><ChevronLeft size={19}/></button><button type="button" disabled={!users||page+1>=users.totalPages||loading} onClick={()=>setPage(v=>v+1)}><ChevronRight size={19}/></button></div></div>
        </section>
      </>}
      {tab==='audit'&&<section className="ad-panel ad-table-panel"><div className="ad-panel-heading"><div><h2>Nhật ký thao tác Admin</h2><p>Ai đã phân quyền, khóa tài khoản hoặc đổi gói dịch vụ</p></div><FileClock size={20}/></div><div className="ad-scroll"><table className="ad-table"><thead><tr><th>Thời gian</th><th>Admin thực hiện</th><th>Tài khoản bị tác động</th><th>Thao tác</th><th>Thay đổi</th></tr></thead><tbody>{audit?.items.map(a=><tr key={a.id}><td>{date(a.createdAt)}</td><td>{a.actorEmail}</td><td>{a.targetEmail}</td><td><span className="ad-pill purple">{a.action}</span></td><td>{a.detail||'—'}</td></tr>)}{!audit?.items.length&&<tr><td colSpan={5} className="ad-empty">Chưa có thay đổi nào được ghi nhận.</td></tr>}</tbody></table></div><div className="ad-pagination"><span>Trang {(audit?.page??0)+1}/{Math.max(1,audit?.totalPages??1)}</span><div><button type="button" disabled={!auditPage} onClick={()=>setAuditPage(v=>Math.max(0,v-1))}><ChevronLeft size={19}/></button><button type="button" disabled={!audit||auditPage+1>=audit.totalPages} onClick={()=>setAuditPage(v=>v+1)}><ChevronRight size={19}/></button></div></div></section>}
      {tab==='plans'&&<div className="ad-plan-grid"><section className="ad-panel ad-plan"><span className="ad-plan-icon"><Users size={27}/></span><h2>Free</h2><strong>Miễn phí</strong><p>Gói mặc định cho mọi tài khoản mới. Đang được sử dụng thực tế.</p><ul><li>Đăng nhập và quản lý dự án</li><li>Editor cơ bản</li><li>Các chức năng hiện tại theo chính sách dự án</li></ul></section><section className="ad-panel ad-plan premium"><span className="ad-plan-icon"><Crown size={27}/></span><h2>Premium</h2><strong>Sẵn sàng cấu hình</strong><p>Admin có thể cấp Premium thủ công và đặt ngày hết hạn trong mục Tài khoản.</p><ul><li>Đã lưu gói và hạn dùng trong database</li><li>Chưa tích hợp cổng thanh toán</li><li>Chưa áp dụng giới hạn AI theo gói</li></ul></section><div className="ad-plan-note"><ShieldCheck size={20}/><span>Phân quyền Admin và gói Premium là hai khái niệm tách biệt. Khi triển khai thu phí, bổ sung giao dịch, webhook xác nhận và giới hạn tính năng ở Backend.</span></div></div>}
    </main>
    {selected&&<div className="ad-modal-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null)}}><section className="ad-detail" role="dialog" aria-modal="true" aria-label="Quản lý tài khoản"><header><div><span>TÀI KHOẢN #{selected.id}</span><h2>{selected.displayName||selected.email}</h2><small>{selected.email}</small></div><button type="button" aria-label="Đóng" disabled={busy} onClick={()=>setSelected(null)}><XCircle size={22}/></button></header>
      <div className="ad-detail-content">{message&&<div role="alert" className="ad-notice">{message}</div>}<div className="ad-detail-stats"><div>Project <b>{selected.projectsCount}</b></div><div>AI Jobs <b>{selected.aiJobsCount}</b></div><div>Đăng nhập cuối <b>{date(selected.lastLoginAt)}</b></div></div>
        <div className="ad-detail-box"><h3><Shield size={16}/> Phân quyền</h3><p>Quyền hiện tại: <b>{selected.role}</b></p><div className="ad-action-row"><button type="button" disabled={busy||selected.role==='USER'} onClick={()=>void change('role','USER')}>Chuyển USER</button><button type="button" disabled={busy||selected.role==='ADMIN'} onClick={()=>void change('role','ADMIN')}>Cấp ADMIN</button></div></div>
        <div className="ad-detail-box"><h3><LockKeyhole size={16}/> Khóa / mở khóa tài khoản</h3><p>Trạng thái: <b>{selected.status}</b>. Tài khoản bị khóa không đăng nhập hoặc dùng JWT còn hạn được.</p><div className="ad-action-row"><button type="button" disabled={busy||selected.status==='ACTIVE'} onClick={()=>void change('status','ACTIVE')}><CheckCircle2 size={15}/> Mở khóa</button><button type="button" className="danger" disabled={busy||selected.status==='BLOCKED'} onClick={()=>void change('status','BLOCKED')}><LockKeyhole size={15}/> Khóa tài khoản</button></div></div>
        <div className="ad-detail-box"><h3><Crown size={16}/> Gói dịch vụ</h3><p>Hiện tại: <b>{selected.plan}</b> {selected.premiumUntil?`· Hạn ${date(selected.premiumUntil)}`:''}</p><label>Hết hạn Premium<input type="date" value={premiumUntil} min={new Date(nowMs).toISOString().slice(0,10)} onChange={e=>setPremiumUntil(e.target.value)}/></label><div className="ad-action-row"><button type="button" disabled={busy||selected.plan==='FREE'} onClick={()=>void change('plan','FREE')}>Chuyển Free</button><button type="button" disabled={busy} onClick={()=>void change('plan','PREMIUM')}><Crown size={15}/> Cấp Premium</button></div><small>Không phát sinh thanh toán tự động.</small></div>
      </div></section></div>}
  </div>;
}
