import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Search, Plus, AlertCircle,
  Check, Clock, ArrowRight, Palette, Ruler, FlaskConical,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Lista global de muestras del sistema (v2 — Sprint 43).
 * Endpoint: GET /api/muestras?estado=&destino_tipo=&search=&limit=&offset=
 *
 * Default: muestra solo las que están "sin volver" (estado en_destino).
 * Diana entra por Home → Producción → "Envíos de muestra" → desde acá toca
 * "+ Nueva" para arrancar el flujo de creación (selector de corte).
 */
const CHIPS = [
  { key: 'sin_volver',         label: 'Sin volver' },
  { key: 'demoradas',          label: '⚠ Demoradas' },
  { key: 'devuelta',           label: 'Devueltas' },
  { key: 'paso_a_lavanderia',  label: '→ Lavandería' },
  { key: 'todas',              label: 'Todas' },
];

const DESTINOS = [
  { key: '',           label: 'Ambos' },
  { key: 'lavanderia', label: 'Lavandería' },
  { key: 'diseno',     label: 'Diseño' },
];

export const MobileEnviosDeMuestra = () => {
  const navigate = useNavigate();
  const [estado, setEstado] = useState('sin_volver');
  const [destinoTipo, setDestinoTipo] = useState('');
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [data, setData] = useState({ kpis: {}, items: [], total: 0, dias_demorada: 5 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSearchDeb(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ estado, limit: '100' });
      if (destinoTipo) params.set('destino_tipo', destinoTipo);
      if (searchDeb) params.set('search', searchDeb);
      const r = await axios.get(`${API}/muestras?${params}`);
      setData(r.data || { kpis: {}, items: [], total: 0 });
    } catch {
      setData({ kpis: {}, items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [estado, destinoTipo, searchDeb]);

  useEffect(() => { cargar(); }, [cargar]);

  const { kpis = {}, items = [], total = 0, dias_demorada = 5 } = data;

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Producción</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            Envíos de muestra{!loading && ` · ${total}`}
          </div>
        </div>
        <Link
          to="/m/envios-muestra/seleccionar-corte"
          className="m-h-icon"
          style={{ background: '#7c3aed', color: 'white', textDecoration: 'none' }}
          aria-label="Nueva"
        >
          <Plus size={18} />
        </Link>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <Kpi value={kpis.sin_volver || 0} label="Sin volver" color="#1d4ed8" />
          <Kpi value={kpis.demoradas || 0} label={`+${dias_demorada}d`} color="#b45309" />
          <Kpi value={kpis.cerradas || 0} label="Cerradas" color="#15803d" />
        </div>

        {/* Filtro destino */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="scrollbar-hide">
          {DESTINOS.map(d => (
            <button
              key={d.key}
              onClick={() => setDestinoTipo(d.key)}
              className={`m-chip ${destinoTipo === d.key ? 'active' : ''}`}
              style={{ fontSize: 11, minHeight: 28, whiteSpace: 'nowrap' }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8',
          }} />
          <input
            className="m-input"
            style={{ paddingLeft: 36 }}
            placeholder="Buscar corte, modelo o persona..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Chips estado */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }} className="scrollbar-hide">
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

        {/* Contenido */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
            <FlaskConical size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {searchDeb
                ? `Sin resultados para "${searchDeb}"`
                : estado === 'sin_volver' ? 'No hay muestras sin volver'
                : estado === 'demoradas' ? 'Sin demoradas — todo al día'
                : estado === 'devuelta' ? 'No hay devueltas registradas'
                : estado === 'paso_a_lavanderia' ? 'Ninguna pasó a Lavandería'
                : 'No hay muestras'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => <MuestraGlobalCard key={it.id} it={it} diasDemorada={dias_demorada} />)}
          </div>
        )}
      </div>
    </>
  );
};

/* ──────── Sub-componentes ──────── */

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

const MuestraGlobalCard = ({ it, diasDemorada }) => {
  const destinoTipo = it.destino_tipo || 'lavanderia';
  const estado = it.estado_muestra || 'en_destino';
  const dest = destinoCfg(destinoTipo);
  const cantTotal = Number(it.cantidad_total || 0);
  const cantDev = it.cantidad_devuelta != null ? Number(it.cantidad_devuelta) : null;
  const demorada = it.demorada === true;

  // Borde lateral según estado: amber si demorada, sino el color del destino o estado
  let borderColor = dest.color;
  if (demorada) borderColor = '#b45309';
  if (estado === 'devuelta') borderColor = '#16a34a';
  if (estado === 'paso_a_lavanderia') borderColor = '#c026d3';

  // Acción: tap → detalle del corte sección muestras
  const to = `/m/registros/${it.registro_id}/muestras-lavanderia`;

  return (
    <Link
      to={to}
      className="m-card"
      style={{
        textDecoration: 'none', color: 'inherit',
        borderLeft: `4px solid ${borderColor}`, paddingLeft: 12,
        display: 'block',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 800, fontSize: 13,
            }}>
              {it.n_corte}
            </span>
            <span style={{
              fontSize: 11, color: '#64748b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 160,
            }}>
              {it.modelo_nombre || '—'}
            </span>
          </div>
          <div style={{
            fontSize: 12, marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            <span style={{ color: '#64748b' }}>→</span>
            <span style={{ fontWeight: 700, color: dest.color }}>
              {it.persona_nombre || (destinoTipo === 'lavanderia' ? 'Lavandería' : 'Diseño')}
            </span>
            <span style={{
              padding: '1px 5px', borderRadius: 999,
              background: dest.softBg, color: dest.color,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            }}>
              {dest.label}
            </span>
            <span style={{ color: '#94a3b8' }}>·</span>
            {estado === 'devuelta' && cantDev != null ? (
              <span style={{
                fontFamily: 'ui-monospace, monospace',
                fontWeight: 700, color: '#15803d',
              }}>
                {cantDev}/{cantTotal} prd
              </span>
            ) : (
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontWeight: 700,
              }}>
                {cantTotal} prd
              </span>
            )}
            {destinoTipo === 'diseno' && it.motivo_diseno && estado === 'en_destino' && (
              <span style={{
                padding: '1px 5px', borderRadius: 999,
                background: dest.softBg, color: dest.color,
                fontSize: 9, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 2,
              }}>
                {motivoIcon(it.motivo_diseno)}
                {motivoLabel(it.motivo_diseno)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
            Enviada · {fmtFecha(it.fecha_envio)}
            {demorada && (
              <span style={{ color: '#b45309', fontWeight: 700, marginLeft: 6 }}>
                · ⚠ +{diasDemorada}d sin volver
              </span>
            )}
            {estado === 'paso_a_lavanderia' && it.lavanderia_posterior_nombre && (
              <span style={{ color: '#7c3aed', marginLeft: 6 }}>
                · pasó a {it.lavanderia_posterior_nombre}
              </span>
            )}
          </div>
        </div>
        <span style={estadoBadgeStyle(estado, demorada)}>
          {estadoBadgeLabel(estado, demorada)}
        </span>
      </div>
    </Link>
  );
};

/* ──────── Helpers ──────── */

function destinoCfg(tipo) {
  if (tipo === 'diseno')
    return { label: 'Diseño', color: '#7c3aed', softBg: '#f3e8ff' };
  return { label: 'Lavandería', color: '#0f766e', softBg: '#f0fdfa' };
}

function estadoBadgeStyle(estado, demorada) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 9, fontWeight: 700, padding: '3px 7px',
    borderRadius: 999, letterSpacing: '.02em',
    textTransform: 'uppercase', flexShrink: 0,
  };
  if (estado === 'devuelta')
    return { ...base, background: '#dcfce7', color: '#15803d' };
  if (estado === 'paso_a_lavanderia')
    return { ...base, background: '#f3e8ff', color: '#7c3aed' };
  if (estado === 'cerrada_en_lavanderia')
    return { ...base, background: '#ccfbf1', color: '#115e59' };
  if (demorada)
    return { ...base, background: '#fef3c7', color: '#92400e' };
  return { ...base, background: '#dbeafe', color: '#1d4ed8' };
}

function estadoBadgeLabel(estado, demorada) {
  if (estado === 'devuelta')                return 'Devuelta';
  if (estado === 'paso_a_lavanderia')       return '→ Lav.';
  if (estado === 'cerrada_en_lavanderia')   return 'Cerrada';
  if (demorada)                              return 'Demorada';
  return 'En destino';
}

function motivoLabel(m) {
  if (m === 'medidas') return 'Medidas';
  if (m === 'evaluacion') return 'Evaluación';
  if (m === 'consulta') return 'Consulta';
  return m || '';
}
function motivoIcon(m) {
  if (m === 'medidas')    return <Ruler size={9} />;
  if (m === 'evaluacion') return <Palette size={9} />;
  if (m === 'consulta')   return <AlertCircle size={9} />;
  return null;
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default MobileEnviosDeMuestra;
