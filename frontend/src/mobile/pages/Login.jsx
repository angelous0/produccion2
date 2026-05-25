import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Box, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const MobileLogin = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/m';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', maxHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, #0f766e 0%, #0d5f5a 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'auto',
    }}>
      {/* En desktop, centramos a 420px y con bordes para look mobile */}
      <div
        className="m-login-shell"
        style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          padding: '40px 32px 24px',
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Centro vertical: logo + form */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          {/* Logo redondo */}
          <div style={{
            width: 80, height: 80, borderRadius: 24,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <Box size={40} strokeWidth={1.5} />
          </div>

          <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}>ERP Producción</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 32, textAlign: 'center' }}>Vista operario</div>

          {/* Form */}
          <form onSubmit={onSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{
                fontSize: 11, opacity: 0.85, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.05em',
              }}>Usuario</label>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej: juan.perez"
                style={{
                  marginTop: 6, width: '100%',
                  fontSize: 17, minHeight: 48,
                  borderRadius: 12, padding: '0 14px',
                  border: 'none', outline: 'none',
                  background: 'white', color: '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: 11, opacity: 0.85, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.05em',
              }}>Contraseña</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  marginTop: 6, width: '100%',
                  fontSize: 17, minHeight: 48,
                  borderRadius: 12, padding: '0 14px',
                  border: 'none', outline: 'none',
                  background: 'white', color: '#0f172a',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.25)',
                border: '1px solid rgba(252, 165, 165, 0.6)',
                borderRadius: 12, padding: '10px 14px',
                fontSize: 13,
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              style={{
                marginTop: 8, minHeight: 48,
                background: 'white', color: '#0f766e',
                fontWeight: 700, fontSize: 16,
                border: 'none', borderRadius: 12,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: loading ? 'wait' : 'pointer',
                opacity: (loading || !username.trim() || !password) ? 0.7 : 1,
              }}
            >
              {loading ? <Loader2 size={18} className="m-spin" /> : null}
              Ingresar
            </button>
          </form>

          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 16, textAlign: 'center' }}>
            ¿Tu dispositivo es solo tuyo?<br />
            <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>
              Configura un PIN rápido
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 11, opacity: 0.55, paddingTop: 16 }}>
          ERP Producción · v2.4.0
        </div>
      </div>
    </div>
  );
};

export default MobileLogin;
