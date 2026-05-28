import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

/**
 * Pantalla full cuando el usuario no tiene permiso para acceder.
 * Muestra header con back + un card central con candado y mensaje.
 *
 *   <PantallaBloqueada titulo="Reportar incidencia" mensaje="Tu rol no permite reportar incidencias." />
 */
export const PantallaBloqueada = ({ titulo = 'Sin permiso', mensaje = 'Tu rol no permite acceder a esta acción.' }) => {
  const navigate = useNavigate();
  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, fontWeight: 600 }}>{titulo}</div>
      </div>
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#fef3c7', color: '#92400e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Lock size={28} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Sin permiso</div>
        <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{mensaje}</div>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ marginTop: 24, minWidth: 140 }}
        >
          Volver
        </button>
      </div>
    </>
  );
};

export default PantallaBloqueada;
