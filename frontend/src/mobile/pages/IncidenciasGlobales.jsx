import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Search, AlertTriangle, PauseCircle, CheckCircle2,
  Package, Clock, User,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista global de incidencias del sistema.
 * Endpoint: GET /api/incidencias?estado=&search=&limit=&offset=
 */
const CHIPS = [
  { key: 'abiertas',    label: 'Abiertas' },
  { key: 'paralizadas', label: '⛔ Paralizadas' },
  { key: 'resueltas',   label: 'Resueltas' },
  { key: 'todas',       label: 'Todas' },
];

export const MobileIncidenciasGlobales = () => {
  const navigate = useNavigate();
  const [estado, setEstado] = useState('abiertas');
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({ abiertas: 0, paralizadas: 0, resueltas_mes: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Cargar incidencias
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ estado, limit: '100' });
      if (searchDeb) params.set('search', searchDeb);
      const res = await axios.get(`${API}/incidencias?${params}`);
      setItems(res.data?.items || []);
      setKpis(res.data?.kpis || { abiertas: 0, paralizadas: 0, resueltas_mes: 0 });
      setTotal(res.data?.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [estado, searchDeb]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Producción</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Incidencias{!loading && ` · ${total}`}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* KPIs sumario */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <Kpi value={kpis.paralizadas} label="Paralizadas" color="#dc2626" />
          <Kpi value={kpis.abiertas} label="Abiertas" color="#b45309" />
          <Kpi value={kpis.resueltas_mes} label="Resueltas (30d)" color="#15803d" />
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8',
          }} />
          <input
            className="m-input"
            style={{ paddingLeft: 36 }}
            placeholder="Buscar por motivo, comentario o corte..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Chips de estado */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {CHIPS.map(c => (
            <button
              key={c.key}
              onClick={() => setEstado(c.key)}
              className={`m-chip ${estado === c.key ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
            <CheckCircle2 size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {searchDeb
                ? `Sin resultados para "${searchDeb}"`
                : estado === 'abiertas' ? 'No hay incidencias abiertas'
                : estado === 'paralizadas' ? 'No hay paralizaciones activas'
                : estado === 'resueltas' ? 'No hay incidencias resueltas'
                : 'No hay incidencias'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => <IncidenciaCard key={it.id} it={it} />)}
          </div>
        )}
      </div>
    </>
  );
};

const Kpi = ({ value, label, color }) => (
  <div className="m-card" style={{ padding: 10, textAlign: 'center' }}>
    <div style={{
      fontFamily: 'ui-monospace, monospace', fontWeight: 800,
      fontSize: 18, lineHeight: 1, color,
    }}>
      {value}
    </div>
    <div style={{
      fontSize: 9, color: '#64748b', textTransform: 'uppercase',
      fontWeight: 700, letterSpacing: '.04em', marginTop: 4,
    }}>
      {label}
    </div>
  </div>
);

/* ──────── Card de una incidencia ──────── */
const IncidenciaCard = ({ it }) => {
  const resuelta = it.estado === 'RESUELTA';
  const paraliza = it.paraliza && !resuelta;
  const avances = Number(it.avances_count || 0);

  return (
    <Link
      to={`/m/incidencias/${it.id}`}
      className="m-card"
      style={{
        padding: 12, textDecoration: 'none', color: 'inherit',
        ...(paraliza ? {
          border: '2px solid #fca5a5', background: '#fef2f2',
        } : {}),
        ...(resuelta ? { opacity: 0.78 } : {}),
      }}
    >
      {/* Fila 1: pills de estado de la incidencia + estado del corte */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {paraliza && (
            <span className="m-pill m-pill-red" style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <PauseCircle size={9} /> PARALIZA
            </span>
          )}
          {resuelta ? (
            <span className="m-pill m-pill-green" style={{ fontSize: 9 }}>✓ RESUELTA</span>
          ) : (
            <span className="m-pill m-pill-amber" style={{ fontSize: 9 }}>ABIERTA</span>
          )}
          {/* Estado del registro/corte donde está estancado */}
          {it.registro_estado && (
            <span
              className={`m-pill ${estadoRegistroPillClass(it.registro_estado)}`}
              style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              title="Estado actual del corte"
            >
              <Package size={9} /> {it.registro_estado}
            </span>
          )}
        </div>
      </div>

      {/* Motivo */}
      <div style={{
        fontWeight: 700, fontSize: 13,
        textDecoration: resuelta ? 'line-through' : 'none',
        color: resuelta ? '#64748b' : '#0f172a',
      }}>
        {it.motivo_nombre || 'Incidencia'}
      </div>

      {/* Comentario */}
      {it.comentario && (
        <div style={{
          fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4,
          overflow: 'hidden', display: '-webkit-box',
          WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
        }}>
          "{it.comentario}"
        </div>
      )}

      {/* Tiempo paralizado (destacado en rojo) — solo si paraliza */}
      {paraliza && it.paralizacion_inicio && (
        <div style={{
          marginTop: 8, padding: '6px 10px',
          background: '#fee2e2', border: '1px solid #fca5a5',
          borderRadius: 8, color: '#b91c1c',
          fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Clock size={12} />
          {fmtTiempoParalizado(it.paralizacion_inicio)}
        </div>
      )}

      {/* Footer con datos del corte + reportero + avances */}
      <div style={{
        marginTop: 8, paddingTop: 8,
        borderTop: `1px solid ${paraliza ? '#fecaca' : '#f1f5f9'}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {/* Línea 1: corte y modelo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {it.registro_n_corte && (
            <span style={{
              fontSize: 10, fontFamily: 'ui-monospace, monospace',
              fontWeight: 700, color: '#0f172a',
            }}>
              {it.registro_n_corte}
            </span>
          )}
          {it.registro_modelo && (
            <>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>·</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>{it.registro_modelo}</span>
            </>
          )}

          {/* Badge de avances · siempre visible · derecha */}
          <span style={{
            marginLeft: 'auto',
            background: avances > 0 ? (paraliza ? '#fef3c7' : '#dbeafe') : '#f1f5f9',
            color: avances > 0 ? (paraliza ? '#b45309' : '#1d4ed8') : '#94a3b8',
            fontSize: 9, fontWeight: 700, padding: '2px 7px',
            borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            💬 {avances} avance{avances !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Línea 2: reportero + tiempo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          fontSize: 10, color: '#64748b',
        }}>
          <User size={10} style={{ color: '#94a3b8' }} />
          <span>Reportada por <strong style={{ color: '#0f172a' }}>{it.usuario || 'desconocido'}</strong></span>
          <span style={{ color: '#94a3b8' }}>·</span>
          <span>{fmtRelativa(it.fecha_hora)}</span>
        </div>
      </div>
    </Link>
  );
};

/**
 * Calcula tiempo paralizado desde `paralizacion_inicio` (ISO).
 * Formato amigable: "Paralizado 3 días 4h" / "Paralizado 5h 20min" / "Paralizado 12 min".
 */
function fmtTiempoParalizado(iso) {
  if (!iso) return 'Paralizado';
  const inicio = new Date(iso);
  if (isNaN(inicio.getTime())) return 'Paralizado';
  const ahora = new Date();
  const diffMs = ahora - inicio;
  if (diffMs < 0) return 'Paralizado';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `Paralizado ${mins} min`;
  const horas = Math.floor(mins / 60);
  const minsRest = mins % 60;
  if (horas < 24) return `Paralizado ${horas}h ${minsRest}min`;
  const dias = Math.floor(horas / 24);
  const horasRest = horas % 24;
  if (dias === 1) return `Paralizado 1 día ${horasRest}h`;
  return `Paralizado ${dias} días ${horasRest}h`;
}

/**
 * Clase de pill según el estado del corte (Costura, Acabado, etc.)
 * Reutilizamos la convención del resto del móvil.
 */
function estadoRegistroPillClass(estado = '') {
  const e = (estado || '').toLowerCase();
  if (e === 'cerrada') return 'm-pill-green';
  if (e === 'anulada') return 'm-pill-red';
  if (e.includes('para corte')) return 'm-pill-gray';
  if (e.includes('costura')) return 'm-pill-blue';
  if (e.includes('lavado') || e.includes('lavander')) return 'm-pill-amber';
  if (e.includes('bordado') || e.includes('estampado')) return 'm-pill-purple';
  if (e.includes('acabado')) return 'm-pill-amber';
  if (e.includes('paraliz')) return 'm-pill-red';
  if (e.includes('almac') || e.includes('tienda')) return 'm-pill-green';
  return 'm-pill-gray';
}

function fmtRelativa(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const ahora = new Date();
  const diffMs = ahora - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'hace segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} día${diffD !== 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

export default MobileIncidenciasGlobales;
