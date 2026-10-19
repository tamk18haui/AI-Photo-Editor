import { ArrowRight, LayoutGrid } from 'lucide-react';
import AccountMenu from '../components/AccountMenu';
import { Link, NavLink } from 'react-router-dom';
import Brand from '../components/Brand';

export default function SiteHeader() {
  return <header className="site-header"><Brand/><nav className="header-nav" aria-label="Điều hướng"><NavLink to="/">Khám phá</NavLink><NavLink to="/projects">Dự án của tôi</NavLink><NavLink to="/projects">AI Studio</NavLink></nav><div className="header-actions"><Link to="/projects" className="button subtle"><LayoutGrid size={16}/> Kho ảnh</Link><Link to="/projects" className="button primary"><ArrowRight size={17}/> Mở Studio</Link><AccountMenu/></div></header>;
}
