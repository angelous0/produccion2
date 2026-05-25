import { useNavigate, Link } from 'react-router-dom';
import { Lock, KeyRound, Bell, LogOut, Type, ChevronRight, Receipt, Package, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const MobileMiPerfil = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const iniciales = (user?.nombre_completo || user?.username || '??')
    .split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div>
      <div className="m-header">
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>Yo</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Avatar grande */}
        <div className="m-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--m-brand)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 20,
          }}>{iniciales}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{user?.nombre_completo || user?.username}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{user?.email || '—'}</div>
          </div>
        </div>

        {/* Rol + permisos */}
        <div className="m-card" style={{ padding: 0 }}>
          <Row label="Rol" right={<span className="m-pill m-pill-blue">{user?.rol || '—'}</span>} />
          <Row label="Usuario" right={<span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{user?.username}</span>} />
        </div>

        {/* Acciones */}
        <div className="m-card" style={{ padding: 0 }}>
          <ActionRow icon={<Lock size={18} />} label="Cambiar contraseña" />
          <ActionRow icon={<KeyRound size={18} />} label="PIN rápido" />
          <ActionRow icon={<Type size={18} />} label="Tamaño de fuente" right="Mediano" />
          <ActionRow
            icon={<Bell size={18} />}
            label="Notificaciones"
            to="/m/notificaciones"
            right={<ChevronRight size={16} style={{ color: '#cbd5e1' }} />}
          />
          {user?.rol === 'admin' && (
            <ActionRow
              icon={<Receipt size={18} />}
              label="Cobro de arreglos"
              to="/m/cobro"
              right={<ChevronRight size={16} style={{ color: '#cbd5e1' }} />}
            />
          )}
          {(user?.rol === 'admin' || user?.rol === 'supervisor_inventario') && (
            <>
              <ActionRow
                icon={<Package size={18} />}
                label="Ingresos de MP"
                to="/m/ingresos"
                right={<ChevronRight size={16} style={{ color: '#cbd5e1' }} />}
              />
              <ActionRow
                icon={<ArrowUpRight size={18} />}
                label="Salidas libres"
                to="/m/salidas-libres"
                right={<ChevronRight size={16} style={{ color: '#cbd5e1' }} />}
              />
            </>
          )}
        </div>

        <button
          className="m-btn m-btn-outline"
          style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
          onClick={onLogout}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingTop: 8 }}>
          ERP Producción · v2.4.0
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, right }) => (
  <div style={{
    padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid #f1f5f9',
  }}>
    <span style={{ fontSize: 14 }}>{label}</span>
    {right}
  </div>
);

const ActionRow = ({ icon, label, right, to, onClick }) => {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#64748b' }}>{icon}</span>
        <span style={{ fontSize: 14 }}>{label}</span>
      </div>
      {right
        ? (typeof right === 'string'
            ? <span style={{ fontSize: 13, color: '#64748b' }}>{right}</span>
            : right)
        : null}
    </>
  );
  const style = {
    padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid #f1f5f9', width: '100%',
    background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
    textDecoration: 'none', color: 'inherit',
  };
  if (to) return <Link to={to} style={style}>{inner}</Link>;
  return <button style={style} onClick={onClick}>{inner}</button>;
};

export default MobileMiPerfil;
