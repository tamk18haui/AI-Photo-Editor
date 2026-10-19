import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { authApi } from '../services/authApi';
import { authSession } from '../services/authSession';

type CredentialResponse = { credential?: string };
type GoogleAccounts = {
  id: {
    initialize(config: {
      client_id: string;
      callback: (result: CredentialResponse) => void;
    }): void;
    renderButton(target: HTMLElement, options: Record<string, unknown>): void;
  };
};
declare global {
  interface Window { google?: { accounts: GoogleAccounts } }
}

type Props = {
  onDone: () => void;
  onError: (message: string) => void;
  mode?: 'login' | 'link';
};

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

export default function GoogleAuthButton({ onDone, onError, mode = 'login' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onDone, onError, mode });
  callbacks.current = { onDone, onError, mode };
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!CLIENT_ID) return;
    let active = true;
    let script: HTMLScriptElement | null = null;
    let initialized = false;

    const initialize = () => {
      if (!active || initialized || !mountRef.current || !window.google?.accounts.id) return;
      initialized = true;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async ({ credential }) => {
          if (!active) return;
          if (!credential) {
            callbacks.current.onError('Google không trả về thông tin đăng nhập. Vui lòng thử lại.');
            return;
          }
          try {
            if (callbacks.current.mode === 'link') {
              await authApi.linkGoogle(credential);
            } else {
              const response = await authApi.google(credential);
              if (!response.accessToken) throw new Error('Backend did not return an access token');
              authSession.save(response);
            }
            if (active) callbacks.current.onDone();
          } catch (error: unknown) {
            if (!active) return;
            const code = axios.isAxiosError(error)
              ? (error.response?.data as { code?: string } | undefined)?.code
              : undefined;
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const message =
              code === 'GOOGLE_ACCOUNT_LINK_REQUIRED'
                ? 'Email đã đăng ký bằng mật khẩu. Hãy đăng nhập bằng email rồi vào Tài khoản → Liên kết Google.'
                : code === 'GOOGLE_EMAIL_MISMATCH'
                ? 'Email Google không trùng email tài khoản Lumina.'
                : code === 'GOOGLE_ALREADY_LINKED'
                ? 'Tài khoản Google này đã được liên kết.'
                : code === 'GOOGLE_UNVERIFIED_EMAIL'
                ? 'Email Google chưa được xác minh.'
                : code === 'GOOGLE_INVALID_CREDENTIAL' || status === 401
                ? 'Google ID Token không hợp lệ hoặc hết hạn. Hãy thử lại.'
                : status === 404 || status === 503
                ? 'Backend chưa bật Google Login hoặc chưa cấu hình Client ID.'
                : status === 409
                ? 'Không thể liên kết tài khoản Google.'
                : !status && axios.isAxiosError(error)
                ? 'Không kết nối được Backend. Kiểm tra Spring Boot và Vite proxy.'
                : 'Đăng nhập Google thất bại. Kiểm tra tab Network của trình duyệt.';
            callbacks.current.onError(message);
          }
        },
      });
      mountRef.current.replaceChildren();
      window.google.accounts.id.renderButton(mountRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        locale: 'vi',
        width: 300,
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
        script.defer = true;
        script.dataset.luminaGis = '1';
        document.head.appendChild(script);
      }
      script.addEventListener('load', initialize);
      script.addEventListener('error', handleScriptError);
      // Handle a script that completed before we attached listeners.
      if (window.google?.accounts.id) initialize();
    }

    function handleScriptError() {
      if (active) setState('error');
    }

    return () => {
      active = false;
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', handleScriptError);
    };
  }, [mode]);

  if (!CLIENT_ID) {
    return (
      <p role="status" className="lum-auth-hint" style={{ justifyContent: 'center' }}>
        Đăng nhập Google đang được thiết lập.
      </p>
    );
  }
  return (
    <div
      aria-label={mode === 'link' ? 'Liên kết tài khoản Google' : 'Đăng nhập bằng Google'}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 44 }}
    >
      <div ref={mountRef} />
      {state === 'loading' && <small>Đang tải Google Login...</small>}
      {state === 'error' && (
        <p role="alert">Không tải được Google Identity Services. Kiểm tra kết nối hoặc tiện ích chặn quảng cáo.</p>
      )}
    </div>
  );
}
