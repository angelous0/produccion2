import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, Package, Search, ChevronRight,
  AlertCircle, Check, Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Ingresos de Materia Prima — lista (mockup 36).
 *
 *   GET  /api/inventario-ingresos → lista enriquecida
 *
 * Filtros chip por estado de facturación: Todos · Pendiente · Parcial · Completo.
 * Búsqueda por nombre/código de ítem o proveedor.
 * FAB "+" para crear nuevo ingreso (solo admin/supervisor).
 */
export const MobileIngresosMP = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = user?.rol === 'admin' || user?.rol === 'supervisor_inventario';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // todos | pendiente | parcial | completo
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/inventario-ingresos`);
        setItems(Array.isArray(res.data) ? res.data : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(it => {
      if (filtro !== 'todos' && (it.estado_facturacion || '').toLowerCase() !== filtro) return false;
      if (!s) return true;
      const blob = `${it.item_nombre || ''} ${it.item_codigo || ''} ${it.proveedor || ''} ${it.numero_documento || ''}`.toLowerCase();
      return blob.includes(s);
    });
  }, [items, filtro, search]);

  const totales = useMemo(() => {
    const t = { todos: items.length, PENDIENTE: 0, PARCIAL: 0, COMPLETO: 0 };
    for (const it of items) {
      const e = (it.estado_facturacion || '').toUpperCase();
      if (t[e] !== undefined) t[e]++;
    }
    return t;
  }, [items]);

  return (
    <div>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Inventario</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Ingresos · {loading ? '…' : items.length}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Buscador */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8',
          }} />
          <input
            className="m-input"
            style={{ paddingLeft: 40 }}
            placeholder="Buscar item, proveedor, documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { key: 'todos',     label: 'Todos',      n: totales.todos },
            { key: 'pendiente', label: 'Pendiente',  n: totales.PENDIENTE },
            { key: 'parcial',   label: 'Parcial',    n: totales.PARCIAL },
            { key: 'completo',  label: 'Completo',   n: totales.COMPLETO },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`m-chip ${filtro === f.key ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
            >
              {f.label}
              <span style={{
                marginLeft: 6,
                background: filtro === f.key ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                color: filtro === f.key ? 'white' : '#475569',
                padding: '1px 7px', borderRadius: 999, fontWeight: 700,
              }}>{f.n}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
            <Package size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {search ? `Sin resultados para "${search}"` : 'No hay ingresos para este filtro'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(it => <IngresoCard key={it.id} ingreso={it} />)}
          </div>
        )}
      </div>

      {/* FAB para crear nuevo (solo admin/supervisor) */}
      {puedeCrear && (
        <Link
          to="/m/ingresos/nuevo"
          aria-label="Nuevo ingreso"
          style={{
            position: 'fixed', right: 18, bottom: 78, zIndex: 40,
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--m-brand)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -4px rgba(15, 118, 110, 0.5)',
            textDecoration: 'none',
          }}
        >
          <Plus size={26} strokeWidth={2.6} />
        </Link>
      )}
    </div>
  );
};

/* ──────── Card de un ingreso ──────── */
const IngresoCard = ({ ingreso }) => {
  const estado = (ingreso.estado_facturacion || '').toUpperCase();
  const cfg = estadoFactCfg(estado);
  const StateIcon = cfg.Icon;

  return (
    <Link
      to={`/m/ingresos/${ingreso.id}`}
      className="m-card"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Package size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ingreso.item_nombre || '—'}
        </div>
        {ingreso.item_codigo && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
            {ingreso.item_codigo}
          </div>
        )}
        <div style={{
          marginTop: 6, fontSize: 11, color: '#64748b',
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span><strong style={{ color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
            {fmtCant(ingreso.cantidad)}
          </strong> recibido</span>
          {Number(ingreso.cantidad_disponible || 0) > 0 && (
            <span>· <strong style={{ color: '#15803d', fontFamily: 'ui-monospace, monospace' }}>
              {fmtCant(ingreso.cantidad_disponible)}
            </strong> disponible</span>
          )}
        </div>
        <div style={{
          marginTop: 4, fontSize: 11, color: '#64748b',
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {ingreso.proveedor && <span>{ingreso.proveedor}</span>}
          {ingreso.numero_documento && (
            <span style={{ fontFamily: 'ui-monospace, monospace', color: '#94a3b8' }}>
              · {ingreso.numero_documento}
            </span>
          )}
          {ingreso.rollos_count > 0 && (
            <span style={{
              background: '#dbeafe', color: '#1d4ed8',
              padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
            }}>
              {ingreso.rollos_count} rollo{ingreso.rollos_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{
          marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: '#94a3b8',
        }}>
          <span>{fmtFecha(ingreso.fecha)}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.fg,
            padding: '2px 8px', borderRadius: 999,
            fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
          }}>
            <StateIcon size={10} />
            {estado || 'SIN ESTADO'}
          </span>
        </div>
      </div>
    </Link>
  );
};

function estadoFactCfg(e) {
  switch (e) {
    case 'COMPLETO':  return { bg: '#dcfce7', fg: '#15803d', Icon: Check };
    case 'PARCIAL':   return { bg: '#fef3c7', fg: '#b45309', Icon: AlertCircle };
    case 'PENDIENTE': return { bg: '#dbeafe', fg: '#1d4ed8', Icon: Clock };
    default:          return { bg: '#f1f5f9', fg: '#475569', Icon: Clock };
  }
}

function fmtCant(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default MobileIngresosMP;
