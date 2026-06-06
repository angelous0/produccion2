import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, AlertTriangle, ChevronRight, AlertOctagon,
  Clock, CheckCircle2, Send, DollarSign,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Tablero global de fallados/arreglos para el supervisor de acabado.
 *
 * Reusa el endpoint que ya usa el supervisor en web:
 *   GET /api/fallados/tablero
 *
 * Grupos: sin_asignar | vencidos | por_vencer | en_proceso | resueltos_hoy
 * Cada card linkea al detalle de arreglos del corte: /m/registros/:id/arreglos
 * (para "sin_asignar" linkea a la misma pantalla, donde el supervisor decide
 * tipo Tela vs Servicio).
 */
export const MobileFalladosTablero = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ grupos: {}, kpis: {} });
  const [error, setError] = useState(null);
  const [grupo, setGrupo] = useState('vencidos'); // chip activo

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    axios.get(`${API}/fallados/tablero`)
      .then(res => {
        if (cancel) return;
        setData(res.data || { grupos: {}, kpis: {} });
        setError(null);
        // Si no hay vencidos, sugerir el primer grupo con contenido
        const k = res.data?.kpis || {};
        if ((k.vencidos?.n_arreglos || 0) === 0) {
          if ((k.por_vencer?.n_arreglos || 0) > 0) setGrupo('por_vencer');
          else if ((k.sin_asignar?.n_arreglos || 0) > 0) setGrupo('sin_asignar');
          else if ((k.en_proceso?.n_arreglos || 0) > 0) setGrupo('en_proceso');
        }
      })
      .catch(err => {
        if (cancel) return;
        setError(err.response?.data?.detail || err.message || 'Error al cargar');
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const items = useMemo(() => {
    return data.grupos?.[grupo] || [];
  }, [data, grupo]);

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #b45309 0%, #9a3412 100%)',
        color: 'white', padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'transparent', border: 0, color: 'white', padding: 4, cursor: 'pointer',
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Acabado y calidad</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Fallados pendientes</div>
        </div>
        <Link to="/m/cobro" style={{
          background: 'rgba(255,255,255,0.15)', color: 'white',
          padding: '6px 10px', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
          textDecoration: 'none',
        }}>
          <DollarSign size={14} /> Cobro
        </Link>
      </div>

      {/* KPIs */}
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <KpiMini
          n={data.kpis?.sin_asignar?.n_arreglos || 0}
          label="Sin asign."
          color="#475569"
        />
        <KpiMini
          n={data.kpis?.vencidos?.n_arreglos || 0}
          label="Vencidos"
          color="#dc2626"
        />
        <KpiMini
          n={data.kpis?.por_vencer?.n_arreglos || 0}
          label="Por venc."
          color="#b45309"
        />
        <KpiMini
          n={data.kpis?.en_proceso?.n_arreglos || 0}
          label="En proc."
          color="#0f766e"
        />
      </div>

      {/* Chips de grupo */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <Chip active={grupo === 'sin_asignar'} onClick={() => setGrupo('sin_asignar')} color="#64748b">
          Sin asignar <Badge>{data.kpis?.sin_asignar?.prendas || 0} pzs</Badge>
        </Chip>
        <Chip active={grupo === 'vencidos'} onClick={() => setGrupo('vencidos')} color="#dc2626">
          Vencidos <Badge>{data.kpis?.vencidos?.prendas || 0} pzs</Badge>
        </Chip>
        <Chip active={grupo === 'por_vencer'} onClick={() => setGrupo('por_vencer')} color="#b45309">
          Por vencer <Badge>{data.kpis?.por_vencer?.prendas || 0} pzs</Badge>
        </Chip>
        <Chip active={grupo === 'en_proceso'} onClick={() => setGrupo('en_proceso')} color="#0f766e">
          En proceso <Badge>{data.kpis?.en_proceso?.prendas || 0} pzs</Badge>
        </Chip>
      </div>

      {/* Body */}
      <div style={{ padding: '0 12px 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Loader2 className="m-spin" size={32} style={{ color: '#b45309' }} />
          </div>
        ) : error ? (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
            padding: 12, borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : items.length === 0 ? (
          <EmptyState grupo={grupo} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grupo === 'sin_asignar'
              ? items.map(it => <SinAsignarCard key={it.registro_id} item={it} />)
              : items.map(it => <ArregloCard key={it.arreglo_id} item={it} grupo={grupo} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//   Card de arreglo (vencidos, por_vencer, en_proceso)
// ════════════════════════════════════════════════════════════════════════════
const ArregloCard = ({ item, grupo }) => {
  const diasInfo = calcDias(item.fecha_limite);
  const tonoFecha = grupo === 'vencidos' ? '#dc2626' : grupo === 'por_vencer' ? '#b45309' : '#0f172a';
  return (
    <Link
      to={`/m/registros/${item.registro_id}/arreglos`}
      className="m-card"
      style={{
        display: 'block', textDecoration: 'none', color: 'inherit',
        padding: 12,
        borderLeft: grupo === 'vencidos' ? '3px solid #dc2626'
          : grupo === 'por_vencer' ? '3px solid #b45309' : undefined,
      }}
    >
      {/* Línea 1: chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{
          background: item.tipo_arreglo === 'tela' ? '#dbeafe' : '#fef3c7',
          color: item.tipo_arreglo === 'tela' ? '#1e40af' : '#92400e',
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
          textTransform: 'uppercase',
        }}>
          {item.tipo_arreglo === 'tela' ? 'Tela' : item.servicio || 'Servicio'}
        </span>
        {item.marcado_para_cobro && (
          <span style={{
            background: '#fef9c3', color: '#a16207',
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
          }}>P/COBRO</span>
        )}
        {item.cobrado && (
          <span style={{
            background: '#dcfce7', color: '#166534',
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
          }}>COBRADO</span>
        )}
        {item.num_prorrogas > 0 && (
          <span style={{
            background: '#f1f5f9', color: '#475569',
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
          }}>{item.num_prorrogas} prórroga{item.num_prorrogas > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Línea 2: modelo + persona */}
      <div style={{
        fontWeight: 600, fontSize: 14, lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.modelo || '—'}
      </div>

      {/* Línea 3: n_corte · marca · persona */}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{item.n_corte}</span>
        {item.marca && <><span>·</span><span>{item.marca}</span></>}
        {item.persona && <><span>·</span><span>{item.persona}</span></>}
      </div>

      {/* Línea 4: pendiente + fecha */}
      <div style={{
        marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Pendiente
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
            {item.pendiente} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>de {item.cantidad}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Límite
          </div>
          <div style={{
            fontSize: 12, fontWeight: 700, marginTop: 2, color: tonoFecha,
            display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
          }}>
            <Clock size={11} />
            {fmtFechaCorta(item.fecha_limite)}
            {diasInfo.txt && (
              <span style={{ fontSize: 10, opacity: 0.85 }}>· {diasInfo.txt}</span>
            )}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: '#cbd5e1', flexShrink: 0 }} />
      </div>
    </Link>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//   Card de "sin asignar" (fallado Tela esperando decisión)
// ════════════════════════════════════════════════════════════════════════════
const SinAsignarCard = ({ item }) => (
  <Link
    to={`/m/registros/${item.registro_id}/arreglos`}
    className="m-card"
    style={{
      display: 'block', textDecoration: 'none', color: 'inherit',
      padding: 12, borderLeft: '3px solid #64748b',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{
        background: '#f1f5f9', color: '#334155',
        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
        textTransform: 'uppercase',
      }}>
        Tela · sin asignar
      </span>
    </div>
    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>
      {item.modelo || '—'}
    </div>
    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{item.n_corte}</span>
      {item.marca && <> · {item.marca}</>}
    </div>
    <div style={{
      marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
          Pendiente de asignar
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
          {item.pendiente_sin_asignar} pzs
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        color: '#0f766e', fontSize: 12, fontWeight: 700,
      }}>
        <Send size={14} /> Asignar
        <ChevronRight size={14} />
      </div>
    </div>
  </Link>
);

// ════════════════════════════════════════════════════════════════════════════
//   Helpers UI
// ════════════════════════════════════════════════════════════════════════════
const Chip = ({ active, onClick, children, color = '#0f766e' }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? color : 'white',
      color: active ? 'white' : '#334155',
      border: `1px solid ${active ? color : '#e2e8f0'}`,
      borderRadius: 999, padding: '6px 12px',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
    }}
  >
    {children}
  </button>
);

const Badge = ({ children }) => (
  <span style={{
    background: 'rgba(255,255,255,0.18)',
    padding: '1px 6px', borderRadius: 999,
    fontSize: 10, fontWeight: 700,
  }}>
    {children}
  </span>
);

const KpiMini = ({ n, label, color }) => (
  <div className="m-card" style={{ padding: 8, textAlign: 'center' }}>
    <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
      {n}
    </div>
    <div style={{ fontSize: 8.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
      {label}
    </div>
  </div>
);

const EmptyState = ({ grupo }) => {
  const msg = {
    sin_asignar: { icon: '✅', titulo: 'Sin fallados pendientes', sub: 'Todos los fallados de tela ya fueron asignados.' },
    vencidos: { icon: '🎉', titulo: 'No hay vencidos', sub: 'Los arreglos están dentro de plazo.' },
    por_vencer: { icon: '👌', titulo: 'No hay próximos a vencer', sub: 'Nada vence en los próximos 3 días.' },
    en_proceso: { icon: '📭', titulo: 'No hay arreglos en proceso', sub: 'No hay arreglos abiertos hoy.' },
  }[grupo] || { icon: '—', titulo: 'Sin datos', sub: '' };
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{msg.icon}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{msg.titulo}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{msg.sub}</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//   Utils
// ════════════════════════════════════════════════════════════════════════════
function fmtFechaCorta(s) {
  if (!s) return '—';
  try {
    const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
}

function calcDias(fechaLimite) {
  if (!fechaLimite) return { txt: '' };
  try {
    const d = new Date(fechaLimite + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { txt: 'hoy' };
    if (diff > 0) return { txt: `en ${diff}d` };
    return { txt: `${Math.abs(diff)}d atrás` };
  } catch {
    return { txt: '' };
  }
}

export default MobileFalladosTablero;
