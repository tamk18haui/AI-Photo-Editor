import { ArrowRight, CircleUserRound, LayoutGrid } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import Brand from '../components/Brand';

export default function SiteHeader() {
  return <header className="site-header"><Brand/><nav className="header-nav" aria-label="Điều hướng"><NavLink to="/">Khám phá</NavLink><NavLink to="/projects">Dự án của tôi</NavLink><NavLink to="/editor/1">AI Studio</NavLink></nav><div className="header-actions"><Link to="/projects" className="button subtle"><LayoutGrid size={16}/> Kho ảnh</Link><Link to="/editor/1" className="button primary"><ArrowRight size={17}/> Mở Studio</Link><Link to="/login" className="circle-link" aria-label="Đăng nhập"><CircleUserRound size={21}/></Link></div></header>;
}
