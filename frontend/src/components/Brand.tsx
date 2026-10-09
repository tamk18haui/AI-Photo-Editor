import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Brand() {
  return <Link className="brand" to="/"><span className="brand-symbol"><Sparkles size={19}/></span><span>Lumina<span className="brand-purple">Studio</span></span></Link>;
}
