import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, History, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BellNotificaciones } from './components/BellNotificaciones';
import './styles.css';

export const MobileLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Iniciales del usuario para avatar
  const iniciales = (user?.nombre_completo || user?.username || '??')
    .split(' ')
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="m-app">
      <div className="m-header">
        <button
          className="m-h-icon"
          onClick={() => navigate('/m/yo')}
          style={{
            background: 'rgba(255,255,255,0.2)',
            fontWeight: 700,
            fontSize: 12,
          }}
          aria-label="Mi perfil"
        >
          {iniciales}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Hola,</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {user?.nombre_completo || user?.username || 'Operario'}
          </div>
        </div>
        <BellNotificaciones />
      </div>

      <main className="m-content">
        <Outlet />
      </main>

      <nav className="m-tabbar">
        <NavLink to="/m" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <Home size={20} />
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/m/registros" className={({ isActive }) => (isActive ? 'active' : '')}>
          <ClipboardList size={20} />
          <span>Registros</span>
        </NavLink>
        <NavLink to="/m/historial" className={({ isActive }) => (isActive ? 'active' : '')}>
          <History size={20} />
          <span>Historial</span>
        </NavLink>
        <NavLink to="/m/yo" className={({ isActive }) => (isActive ? 'active' : '')}>
          <User size={20} />
          <span>Yo</span>
        </NavLink>
      </nav>
    </div>
  );
};
