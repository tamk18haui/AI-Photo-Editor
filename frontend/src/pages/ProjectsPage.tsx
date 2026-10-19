import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3, Copy, FolderOpen, ImagePlus, Layers3, LoaderCircle, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import SiteHeader from '../layouts/SiteHeader';
import { authSession } from '../services/authSession';
import { projectApi } from '../services/projectApi';
import type { Project, ProjectSort } from '../services/projectApi';
import '../styles/projects-n1.css';

type Dialog = 'create' | 'rename' | 'delete' | null;
const PAGE_SIZE = 12;
function messageFor(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Không thể thực hiện thao tác. Vui lòng thử lại.';
  if (error.response?.status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (error.response?.status === 403) return 'Bạn không có quyền đối với dự án này.';
  if (error.response?.status === 404) return 'Dự án không tồn tại hoặc đã bị xóa.';
  if (error.response?.status === 409) return 'Dữ liệu đang xung đột. Vui lòng tải lại danh sách.';
  if (!error.response) return 'Không kết nối được Backend. Kiểm tra Spring Boot và Vite proxy.';
  return 'Máy chủ trả lỗi HTTP ' + error.response.status + '.';
}
function dateTime(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 'Chưa xác định' : d.toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' });
}
export default function ProjectsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProjectSort>('UPDATED_DESC');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!authSession.isLoggedIn()) { navigate('/login', {replace:true}); return; }
    let active = true;
    setLoading(true);
    setError('');
    projectApi.list({page, size:PAGE_SIZE, search, sort})
      .then(data => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.totalElements);
        setPages(data.totalPages);
        if (page > 0 && data.totalPages > 0 && page >= data.totalPages) setPage(data.totalPages-1);
        else if (page > 0 && data.totalPages === 0) setPage(0);
      })
      .catch(err => {
        if (!active) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) navigate('/login', {replace:true});
        setError(messageFor(err));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {active = false;};
  }, [page, search, sort, revision, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {setPage(0); setSearch(searchInput.trim());}, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const refresh = () => setRevision(v => v+1);
  const openCreate = () => {
    setSelected(null);setName('Dự án mới');setWidth(1920);setHeight(1080);
    setError('');setDialog('create');
  };
  const openRename = (p: Project) => {setSelected(p);setName(p.name);setError('');setDialog('rename');};
  const openDelete = (p: Project) => {setSelected(p);setError('');setDialog('delete');};
  const close = () => {if (!busy) {setDialog(null);setSelected(null);}};
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = name.trim();
    if (!cleaned || cleaned.length > 150) {setError('Tên dự án phải có 1–150 ký tự.');return;}
    if (dialog === 'create' && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || width > 12000 || height < 1 || height > 12000)) {
      setError('Chiều rộng và chiều cao phải từ 1 đến 12000 px.');return;
    }
    setBusy(true);setError('');setNotice('');
    try {
      if (dialog === 'create') {
        const p = await projectApi.create({name:cleaned,canvasWidth:width,canvasHeight:height});
        setDialog(null);navigate(`/editor/${p.id}`);return;
      }
      if (dialog === 'rename' && selected) {
        await projectApi.rename(selected.id,cleaned);
        setNotice('Đã đổi tên dự án.');setDialog(null);setSelected(null);refresh();
      }
    } catch(err){setError(messageFor(err));}
    finally{setBusy(false);}
  };
  const duplicate = async (p: Project) => {
    setBusy(true);setError('');setNotice('');
    try {await projectApi.duplicate(p.id);setNotice('Đã nhân bản dự án.');setPage(0);refresh();}
    catch(err){setError(messageFor(err));}
    finally{setBusy(false);}
  };
  const remove = async () => {
    if (!selected) return;
    setBusy(true);setError('');setNotice('');
    try {await projectApi.remove(selected.id);setNotice('Đã xóa dự án.');setDialog(null);setSelected(null);refresh();}
    catch(err){setError(messageFor(err));}
    finally{setBusy(false);}
  };
  return <div className="site-page"><SiteHeader/><main className="projects-content">
    <section className="profile-banner">
      <div className="profile-head"><span className="profile-avatar">LS</span><div><span className="section-kicker">THƯ VIỆN CỦA BẠN</span><h1>Không gian sáng tạo cá nhân</h1><p>Quản lý và tiếp tục các dự án chỉnh sửa ảnh của bạn.</p></div></div>
      <button type="button" className="button primary" onClick={openCreate}><Plus size={18}/> Tạo dự án mới</button>
    </section>
    <div className="stat-row">
      <div className="stat-card"><FolderOpen size={20}/><div><b>{total}</b><small>Dự án phù hợp bộ lọc</small></div></div>
      <div className="stat-card"><Layers3 size={20}/><div><b>{items.length}</b><small>Đang hiển thị</small></div></div>
      <div className="stat-card"><Clock3 size={20}/><div><b>Gần đây</b><small>Sắp xếp theo lựa chọn</small></div></div>
    </div>
    <section className="library-section">
      <div className="section-top"><div><span className="section-kicker">BỘ SƯU TẬP</span><h2>Dự án của tôi</h2></div>
        <div className="lum-project-filters">
          <label className="search-shell"><Search size={17}/><input aria-label="Tìm dự án" placeholder="Tìm kiếm dự án..." value={searchInput} onChange={e=>setSearchInput(e.target.value)}/></label>
          <select aria-label="Sắp xếp dự án" value={sort} onChange={e=>{setPage(0);setSort(e.target.value as ProjectSort);}}>
            <option value="UPDATED_DESC">Mới cập nhật</option><option value="UPDATED_ASC">Cũ cập nhật</option>
            <option value="NAME_ASC">Tên A–Z</option><option value="NAME_DESC">Tên Z–A</option>
          </select>
          <button className="lum-project-iconbutton" onClick={refresh} title="Tải lại" disabled={loading}><RefreshCw size={18}/></button>
        </div>
      </div>
      {error && <p className="lum-project-alert" role="alert">{error}</p>}
      {notice && <p className="lum-project-ok" role="status">{notice}</p>}
      {loading ? <div className="lum-project-loading"><LoaderCircle className="lum-project-spin" size={22}/> Đang tải dự án...</div>
       : items.length === 0 ? <div className="empty-project"><div className="empty-icon"><ImagePlus size={30}/></div><h3>{search?'Không tìm thấy dự án':'Chưa có dự án nào'}</h3><p>{search?'Thử từ khóa khác hoặc xóa bộ lọc.':'Tạo dự án đầu tiên để bắt đầu sáng tạo.'}</p><button type="button" className="button primary" onClick={openCreate}><Sparkles size={17}/> Tạo dự án <ArrowRight size={16}/></button></div>
       : <div className="lum-project-grid">{items.map(p=><article className="lum-project-card" key={p.id}>
          <div className="lum-project-thumb" onClick={()=>navigate(`/editor/${p.id}`)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')navigate(`/editor/${p.id}`)}}>
            {p.thumbnailUrl?<img src={p.thumbnailUrl} alt={`Ảnh đại diện ${p.name}`}/>:<ImagePlus size={42}/>}
          </div>
          <div className="lum-project-details"><h3 title={p.name}>{p.name}</h3><p>{p.canvasWidth} × {p.canvasHeight} px</p><small>Cập nhật {dateTime(p.updatedAt)}</small>
          <div className="lum-project-actions">
            <button onClick={()=>navigate(`/editor/${p.id}`)}><FolderOpen size={15}/> Mở</button>
            <button onClick={()=>openRename(p)} disabled={busy} title="Đổi tên"><Pencil size={16}/></button>
            <button onClick={()=>void duplicate(p)} disabled={busy} title="Nhân bản"><Copy size={16}/></button>
            <button onClick={()=>openDelete(p)} disabled={busy} className="danger" title="Xóa"><Trash2 size={16}/></button>
          </div></div>
        </article>)}</div>}
      {!loading && pages>1 && <div className="lum-project-pagination">
        <button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trang trước</button>
        <span>Trang {page+1}/{pages}</span>
        <button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>Trang sau</button>
      </div>}
    </section>
  </main>
  {dialog && <div className="lum-project-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="lum-project-modal" role="dialog" aria-modal="true" aria-label={dialog==='create'?'Tạo dự án':dialog==='rename'?'Đổi tên dự án':'Xóa dự án'}>
      <div className="lum-project-modal-head"><h2>{dialog==='create'?'Tạo dự án mới':dialog==='rename'?'Đổi tên dự án':'Xóa dự án?'}</h2><button onClick={close} disabled={busy}><X size={19}/></button></div>
      {dialog==='delete'?<><p>Bạn có chắc muốn xóa <strong>{selected?.name}</strong>? Thao tác có thể xóa dữ liệu liên quan và không thể hoàn tác.</p>{error&&<p className="lum-project-alert">{error}</p>}
        <div className="lum-project-modal-buttons"><button onClick={close} disabled={busy}>Hủy</button><button className="destructive" onClick={()=>void remove()} disabled={busy}>{busy?'Đang xóa...':'Xóa vĩnh viễn'}</button></div></>
      : <form onSubmit={e=>void save(e)} className="lum-project-modal-form">
          <label>Tên dự án<input required autoFocus maxLength={150} value={name} onChange={e=>setName(e.target.value)}/></label>
          {dialog==='create'&&<div className="lum-project-size">
            <label>Chiều rộng (px)<input type="number" min={1} max={12000} required value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
            <label>Chiều cao (px)<input type="number" min={1} max={12000} required value={height} onChange={e=>setHeight(Number(e.target.value))}/></label>
          </div>}
          {error&&<p className="lum-project-alert">{error}</p>}
          <div className="lum-project-modal-buttons"><button type="button" onClick={close} disabled={busy}>Hủy</button><button className="save" type="submit" disabled={busy}>{busy?'Đang lưu...':dialog==='create'?'Tạo và mở Editor':'Lưu tên'}</button></div>
        </form>}
    </div></div>}
  </div>;
}
