import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  AlertOctagon, ChevronRight, Loader2, AlertTriangle, Clock,
  Layers, Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MobileHome = () => {
  const { user } = useAuth();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Hasta 12 activos. Filtramos cerrados/anulados/tienda en backend.
        const res = await axios.get(`${API}/registros?limit=12&excluir_estados=Tienda,CERRADA,ANULADA`);
        setRegistros(res.data?.items || res.data || []);
      } catch {
        setRegistros([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const urgentes = useMemo(() => registros.filter(r => r.urgente), [registros]);
  const paralizados = useMemo(
    () => registros.filter(r => /paraliz/i.test(r.estado || '')),
    [registros],
  );

  const nombre = (user?.nombre_completo || user?.username || 'Operario')
    .split(' ')[0]; // solo primer nombre

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Saludo + hora */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
          {saludo()}, {nombre}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          {fechaHoy()}
        </div>
      </div>

      {/* Alerta urgentes / paralizados */}
      {(urgentes.length > 0 || paralizados.length > 0) && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {urgentes.length > 0 && (
            <AlertaInline
              icon={<AlertOctagon size={18} />}
              tone="rojo"
              titulo={`${urgentes.length} corte${urgentes.length !== 1 ? 's' : ''} urgente${urgentes.length !== 1 ? 's' : ''}`}
              sub="Tienen prioridad alta · revisa abajo"
            />
          )}
          {paralizados.length > 0 && (
            <AlertaInline
              icon={<AlertTriangle size={18} />}
              tone="ambar"
              titulo={`${paralizados.length} corte${paralizados.length !== 1 ? 's' : ''} paralizado${paralizados.length !== 1 ? 's' : ''}`}
              sub="Con incidencia que bloquea producción"
            />
          )}
        </div>
      )}

      {/* Atajos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <AtajoCard
          icon={<Layers size={22} />}
          label="Mis registros"
          sub={loading ? '...' : `${registros.length} activos`}
          to="/m/registros"
        />
        <AtajoCard
          icon={<Clock size={22} />}
          label="Historial"
          sub="Todos los cortes"
          to="/m/historial"
        />
      </div>

      {/* Registros activos */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <span className="m-label-xs">Registros activos ({registros.length})</span>
          <Link to="/m/registros" style={{
            fontSize: 12, fontWeight: 600, color: 'var(--m-brand)', textDecoration: 'none',
          }}>
            Ver todos →
          </Link>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: '#64748b' }}>
            <Loader2 className="m-spin" size={24} />
          </div>
        ) : registros.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>
            <Search size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No hay registros activos.</p>
            <Link to="/m/historial" style={{
              fontSize: 12, color: 'var(--m-brand)', fontWeight: 600,
              textDecoration: 'none', display: 'inline-block', marginTop: 8,
            }}>
              Ver historial completo →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Urgentes primero */}
            {[...urgentes, ...registros.filter(r => !r.urgente)]
              .slice(0, 8)
              .map(r => <RegistroCard key={r.id} registro={r} />)}
          </div>
        )}
      </div>
    </div>
  );
};

/* ──────── Tarjeta de atajo ──────── */
const AtajoCard = ({ icon, label, sub, to }) => (
  <Link
    to={to}
    style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: 14, background: 'white',
      border: '1px solid #e5e7eb', borderRadius: 14,
      textDecoration: 'none', color: 'inherit',
    }}
  >
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {icon}
    </div>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 11, color: '#64748b' }}>{sub}</div>
  </Link>
);

/* ──────── Banda de alerta ──────── */
const AlertaInline = ({ icon, tone, titulo, sub }) => {
  const cfg = tone === 'rojo'
    ? { bg: '#fef2f2', border: '#fca5a5', fg: '#b91c1c' }
    : { bg: '#fffbeb', border: '#fcd34d', fg: '#b45309' };
  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.fg,
      borderRadius: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{titulo}</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>{sub}</div>
      </div>
    </div>
  );
};

/* ──────── Card de un registro (reusable en Home, Lista, Historial) ──────── */
export const RegistroCard = ({ registro: r }) => {
  const pillClass = estadoPillClass(r.estado);
  const marca = r.marca_nombre || r.modelo_manual?.marca_texto || '';
  const modelo = r.modelo_nombre || r.modelo_manual?.nombre_modelo || '—';

  return (
    <Link
      to={`/m/registros/${r.id}`}
      className="m-card m-card-tap"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        ...(r.urgente && { borderColor: '#fca5a5' }),
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontWeight: 700, fontSize: 14,
          }}>{r.n_corte}</span>
          {r.estado && <span className={`m-pill ${pillClass}`}>{r.estado}</span>}
          {r.urgente && (
            <span className="m-pill m-pill-red">
              <AlertOctagon size={10} /> URGENTE
            </span>
          )}
        </div>
        <div style={{
          fontSize: 14, marginTop: 4, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {modelo}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 6, fontSize: 11, color: 'var(--m-muted)',
        }}>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%',
          }}>{marca || '—'}</span>
          <span style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}>
            {r.curva || '—'}
          </span>
        </div>
      </div>
      <ChevronRight size={18} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 4 }} />
    </Link>
  );
};

function estadoPillClass(estado = '') {
  const e = (estado || '').toLowerCase();
  if (e === 'cerrada') return 'm-pill-green';
  if (e === 'anulada') return 'm-pill-red';
  if (e.includes('para corte')) return 'm-pill-gray';
  if (e.includes('costura')) return 'm-pill-blue';
  if (e.includes('lavado') || e.includes('lavandería') || e.includes('lavanderia')) return 'm-pill-amber';
  if (e.includes('bordado') || e.includes('estampado')) return 'm-pill-purple';
  if (e.includes('acabado')) return 'm-pill-amber';
  if (e.includes('paraliz')) return 'm-pill-red';
  if (e.includes('almacén') || e.includes('almacen') || e.includes('tienda')) return 'm-pill-green';
  return 'm-pill-gray';
}

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default MobileHome;
