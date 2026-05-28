import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, ArrowUpRight, Search,
  AlertTriangle, FlaskConical, AlertOctagon, Wrench,
  RotateCcw, Sliders, Trash2, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPOS = [
  { key: '',            label: 'Todas',       Icon: ArrowUpRight, color: '#475569' },
  { key: 'MERMA',       label: 'Merma',       Icon: Trash2,       color: '#b91c1c' },
  { key: 'MUESTRA',     label: 'Muestra',     Icon: FlaskConical, color: '#a16207' },
  { key: 'DAÑO',        label: 'Daño',        Icon: AlertOctagon, color: '#dc2626' },
  { key: 'USO_INTERNO', label: 'Uso interno', Icon: Wrench,       color: '#1d4ed8' },
  { key: 'DEVOLUCION',  label: 'Devolución',  Icon: RotateCcw,    color: '#15803d' },
  { key: 'AJUSTE',      label: 'Ajuste',      Icon: Sliders,      color: '#7e22ce' },
  { key: 'OTRO',        label: 'Otro',        Icon: MoreHorizontal, color: '#64748b' },
];

/**
 * Salidas libres de MP — lista (mockup 39).
 *   GET /api/salidas-libres?tipo_salida=...&limit=...
 */
export const MobileSalidasLibres = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.CREAR_SALIDA_LIBRE);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (filtro) params.set('tipo_salida', filtro);
        const res = await axios.get(`${API}/salidas-libres?${params}`);
        const lista = res.data?.items || [];
        setItems(lista);
        setTotal(Number(res.data?.total || lista.length));
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [filtro]);

  const filtrados = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it => {
      const blob = `${it.item_nombre || ''} ${it.item_codigo || ''} ${it.tipo_salida || ''} ${it.destino || ''} ${it.motivo || ''}`.toLowerCase();
      return blob.includes(s);
    });
  }, [items, search]);

  return (
    <div>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Inventario</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Salidas libres · {loading ? '…' : total}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8',
          }} />
          <input
            className="m-input"
            style={{ paddingLeft: 40 }}
            placeholder="Buscar item, tipo, destino..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
        }}>
          {TIPOS.map(t => (
            <button
              key={t.key}
              onClick={() => setFiltro(t.key)}
              className={`m-chip ${filtro === t.key ? 'active' : ''}`}
              style={{ fontSize: 12, minHeight: 32, whiteSpace: 'nowrap' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader2 className="m-spin" size={24} style={{ color: '#94a3b8' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="m-card" style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
            <ArrowUpRight size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {search ? `Sin resultados para "${search}"` : 'Sin salidas libres registradas'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtrados.map(s => <SalidaCard key={s.id} salida={s} />)}
          </div>
        )}
      </div>

      {puedeCrear && (
        <Link
          to="/m/salidas-libres/nueva"
          aria-label="Nueva salida libre"
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

const SalidaCard = ({ salida }) => {
  const cfg = TIPOS.find(t => t.key === salida.tipo_salida) || TIPOS[0];
  const Icon = cfg.Icon;
  return (
    <div className="m-card" style={{
      display: 'flex', gap: 10, padding: 12, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${cfg.color}20`, color: cfg.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {salida.linea_negocio_nombre && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 700, color: 'var(--m-brand)',
            background: 'var(--m-brand-soft)',
            padding: '1px 8px', borderRadius: 999,
            marginBottom: 4,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--m-brand)', flexShrink: 0,
            }} />
            {salida.linea_negocio_nombre}
          </div>
        )}
        <div style={{
          fontSize: 13, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {salida.item_nombre || '—'}
        </div>
        {salida.item_codigo && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
            {salida.item_codigo}
          </div>
        )}
        <div style={{
          marginTop: 6, fontSize: 11, color: '#64748b',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        }}>
          <span style={{
            background: `${cfg.color}15`, color: cfg.color,
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.02em',
          }}>
            {cfg.label}
          </span>
          <span>
            <strong style={{ color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
              {fmtCant(salida.cantidad)}
            </strong>
            {salida.unidad_medida ? ` ${salida.unidad_medida}` : ''}
          </span>
          {salida.destino && <span>· {salida.destino}</span>}
        </div>
        {salida.motivo && (
          <div style={{
            fontSize: 11, color: '#475569', marginTop: 4, fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            "{salida.motivo}"
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          {fmtFecha(salida.fecha)}
          {salida.created_by_nombre && ` · por ${salida.created_by_nombre}`}
        </div>
      </div>
    </div>
  );
};

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

export default MobileSalidasLibres;
