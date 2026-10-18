import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { authApi } from '../services/authApi';
import { authSession } from '../services/authSession';

type CredentialResponse = { credential?: string };
type Gis = { accounts: { id: {
  initialize(config: { client_id: string; callback: (result: CredentialResponse) => void }): void;
  renderButton(target: HTMLElement, options: Record<string, unknown>): void;
} } };
declare global { interface Window { google?: Gis } }

// Google GIS requires a WEB OAuth Client ID (public), not a client secret or Gmail App Password.
export default function GoogleAuthButton({ onDone, onError, mode = 'login' }: {
  onDone: () => void;
  onError: (message: string) => void;
  mode?: 'login' | 'link';
}) {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  const mountRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef({ onDone, onError, mode });
  callbackRef.current = { onDone, onError, mode };
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let script: HTMLScriptElement | null = null;
    const initialize = () => {
      if (!active || !window.google?.accounts.id || !mountRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          if (!credential) {
            callbackRef.current.onError('Google không trả về mã đăng nhập. Vui lòng thử lại.');
            return;
          }
          try {
            if (callbackRef.current.mode === 'link') {
              await authApi.linkGoogle(credential);
            } else {
              const response = await authApi.google(credential);
              if (!response.accessToken) throw new Error('No access token from backend');
              authSession.save(response);
            }
            callbackRef.current.onDone();
          } catch (error: unknown) {
            const code = axios.isAxiosError(error) ? (error.response?.data as { code?: string } | undefined)?.code : undefined;
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const message = code === 'GOOGLE_ACCOUNT_LINK_REQUIRED'
              ? 'Email này đã đăng ký bằng mật khẩu. Hãy đăng nhập bằng mật khẩu, mở avatar và chọn "Liên kết Google".'
              : code === 'GOOGLE_EMAIL_MISMATCH'
              ? 'Email Google khác email tài khoản Lumina đang đăng nhập.'
              : code === 'GOOGLE_ALREADY_LINKED'
              ? 'Tài khoản Google đã được liên kết trước đó.'
              : code === 'GOOGLE_UNVERIFIED_EMAIL'
              ? 'Email Google chưa được xác minh.'
              : code === 'GOOGLE_INVALID_CREDENTIAL' || status === 401
              ? 'Mã đăng nhập Google không hợp lệ hoặc đã hết hạn. Hãy thử lại.'
              : status === 404 || status === 503
              ? 'Backend chưa bật Google Login. Kiểm tra GOOGLE_AUTH_ENABLED và GOOGLE_CLIENT_ID.'
              : status === 409
              ? 'Không thể liên kết tài khoản này. Kiểm tra email đã sử dụng.'
              : !status
              ? 'Không kết nối được Backend. Kiểm tra cổng 8080.'
              : 'Google Login thất bại. Mã HTTP: ' + status;
            callbackRef.current.onError(message);
          }
        },
      });
      mountRef.current.replaceChildren();
      window.google.accounts.id.renderButton(mountRef.current, {
        type: 'standard', theme: 'outline', size: 'large',
        text: mode === 'link' ? 'continue_with' : 'signin_with', width: 300,
      });
      setState('ready');
    };
    if (window.google?.accounts.id) {
      initialize();
    } else {
      script = document.querySelector<HTMLScriptElement>('script[data-lumina-gis]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.dataset.luminaGis = '1';
        document.head.appendChild(script);
      }
      script.addEventListener('load', initialize);
      script.addEventListener('error', () => { if (active) setState('error'); }, { once: true });
      // If another component loaded it while this one mounted.
      if (window.google?.accounts.id) initialize();
    }
    return () => {
      active = false;
      script?.removeEventListener('load', initialize);
    };
  }, [clientId, mode]);

  if (!clientId) return <p role="status" className="lum-auth-hint">Đăng nhập Google chưa cấu hình OAuth Client ID.</p>;
  return <div aria-label={mode === 'link' ? 'Liên kết tài khoản Google' : 'Đăng nhập Google'}>
    <div ref={mountRef} />
    {state === 'loading' && <small>Đang tải Google Login...</small>}
    {state === 'error' && <p role="alert">Không tải được Google. Kiểm tra mạng hoặc tiện ích chặn script.</p>}
  </div>;
}
