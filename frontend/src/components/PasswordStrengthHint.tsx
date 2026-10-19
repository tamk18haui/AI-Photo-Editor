import { CheckCircle2, Circle } from 'lucide-react';
import { getPasswordChecks } from '../utils/passwordPolicy';
import '../styles/password-strength.css';

type Props = { password: string; confirm?: string };

export default function PasswordStrengthHint({ password, confirm }: Props) {
  const rules = getPasswordChecks(password);
  const passed = rules.filter((rule) => rule.valid).length;
  const grade = password.length === 0 ? 'Chưa nhập' : passed === 5 ? 'Đạt yêu cầu' : passed >= 3 ? 'Cần bổ sung' : 'Chưa đạt';
  return (
    <div className="lum-password-checker" aria-label="Kiểm tra điều kiện mật khẩu">
      <div className="lum-password-checker-heading">
        <span>Điều kiện mật khẩu</span>
        <strong className={passed === 5 ? 'is-valid' : ''}>{grade}</strong>
      </div>
      <div className="lum-password-checker-track" aria-label={`${passed} trên 5 điều kiện đã đạt`}>
        <span style={{ width: `${passed * 20}%` }} className={passed === 5 ? 'is-valid' : ''} />
      </div>
      <ul className="lum-password-checker-list">
        {rules.map((rule) => (
          <li key={rule.id} className={rule.valid ? 'is-valid' : ''}>
            {rule.valid ? <CheckCircle2 size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
      {confirm !== undefined && confirm.length > 0 && (
        <p className={`lum-password-confirm ${password === confirm ? 'is-valid' : ''}`} role="status">
          {password === confirm ? '✓ Hai mật khẩu trùng nhau' : 'Hai mật khẩu chưa trùng nhau'}
        </p>
      )}
    </div>
  );
}
