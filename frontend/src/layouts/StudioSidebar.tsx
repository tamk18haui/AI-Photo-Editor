import { Compass, FolderHeart, ImagePlus, SlidersHorizontal, Sparkles, UserRound } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import Brand from '../components/Brand';

type Props = { onOpen: () => void };
export default function StudioSidebar({ onOpen }: Props) {
  return <aside className="studio-sidebar"><div><Brand/><button className="button primary wide side-open" onClick={onOpen}><ImagePlus size={18}/> Mở ảnh mới</button><nav className="side-nav"><NavLink to="/editor/1"><SlidersHorizontal size={18}/> Bảng công cụ AI</NavLink><NavLink to="/"><Compass size={18}/> Khám phá & Home</NavLink><NavLink to="/projects"><FolderHeart size={18}/> Kho ảnh & Dự án</NavLink></nav></div><div className="sidebar-bottom"><div className="info-chip"><Sparkles size={16}/> Bản dựng giao diện MVP</div><Link to="/login" className="side-account"><span className="avatar"><UserRound size={18}/></span><span><strong>Tài khoản</strong><small>Đăng nhập để đồng bộ</small></span></Link></div></aside>;
}
