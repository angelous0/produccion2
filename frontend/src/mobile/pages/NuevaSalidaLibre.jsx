import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, Search, AlertTriangle, Package,
  ChevronDown, X, Lock, Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPOS = [
  { value: 'MERMA',       label: 'Merma',        desc: 'Material defectuoso o no aprovechable' },
  { value: 'MUESTRA',     label: 'Muestra',      desc: 'Muestra a cliente o prueba' },
  { value: 'DAÑO',        label: 'Daño',         desc: 'Por accidente o manipulación' },
  { value: 'USO_INTERNO', label: 'Uso interno',  desc: 'Para uso de la empresa, no producción' },
  { value: 'DEVOLUCION',  label: 'Devolución',   desc: 'Devuelto a proveedor' },
  { value: 'AJUSTE',      label: 'Ajuste',       desc: 'Corrección de inventario' },
  { value: 'OTRO',        label: 'Otro',         desc: 'Cualquier otro motivo' },
];

/**
 * Nueva salida libre — mockup 40.
 *   POST /api/salidas-libres
 *   body: { item_id, cantidad, tipo_salida, motivo?, destino?, fecha?,
 *           linea_negocio_id?, observaciones? }
 */
export const MobileNuevaSalidaLibre = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = user?.rol === 'admin' || user?.rol === 'supervisor_inventario';

  // Catálogos
  const [items, setItems] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);

  // Form state
  const [item, setItem] = useState(null);
  const [pickerItem, setPickerItem] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('MERMA');
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fecha, setFecha] = useState(hoyISO());

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [invRes, linRes] = await Promise.all([
          axios.get(`${API}/inventario?all=true`).catch(() => ({ data: [] })),
          axios.get(`${API}/lineas-negocio`).catch(() => ({ data: [] })),
        ]);
        const lista = Array.isArray(invRes.data) ? invRes.data
          : (Array.isArray(invRes.data?.items) ? invRes.data.items : []);
        setItems(lista);
        setLineas(Array.isArray(linRes.data) ? linRes.data : []);
      } finally {
        setLoadingCat(false);
      }
    })();
  }, []);

  const lineaItem = useMemo(() => {
    if (!item) return null;
    return lineas.find(l => Number(l.id) === Number(item.linea_negocio_id));
  }, [item, lineas]);

  const stockSuficiente = item ? Number(item.stock_actual || 0) >= Number(cantidad || 0) : true;

  const enviar = async () => {
    setError('');
    if (!item) return setError('Elige un item.');
    if (!cantidad || Number(cantidad) <= 0) return setError('Cantidad debe ser mayor a 0.');
    if (!tipo) return setError('Elige un tipo de salida.');
    if (!stockSuficiente) return setError(`Stock insuficiente. Disponible: ${item.stock_actual}`);

    setEnviando(true);
    try {
      const body = {
        item_id: item.id,
        cantidad: Number(cantidad),
        tipo_salida: tipo,
        motivo: motivo.trim() || null,
        destino: destino.trim() || null,
        fecha: fecha || null,
        linea_negocio_id: item.linea_negocio_id ? Number(item.linea_negocio_id) : null,
        observaciones: observaciones.trim() || null,
      };
      await axios.post(`${API}/salidas-libres`, body);
      navigate('/m/salidas-libres', { replace: true });
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear la salida';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  if (!puedeCrear) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Nueva salida</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          <Lock size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>
            Solo admin / supervisor de inventario puede registrar salidas libres.
          </p>
        </div>
      </>
    );
  }

  const formularioValido = item && Number(cantidad) > 0 && tipo && stockSuficiente;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', paddingBottom: 76,
    }}>
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Inventario</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Nueva salida libre</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Item */}
        <div>
          <Label>Item</Label>
          {item ? (
            <div style={{
              padding: 12, background: 'var(--m-brand-soft)',
              borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <Package size={18} style={{ color: 'var(--m-brand)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {lineaItem && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, color: 'var(--m-brand)',
                    background: 'white',
                    padding: '1px 8px', borderRadius: 999,
                    marginBottom: 4,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--m-brand)', flexShrink: 0,
                    }} />
                    {lineaItem.nombre}
                  </div>
                )}
                <div style={{
                  fontWeight: 700, color: 'var(--m-brand)', fontSize: 13,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.nombre}
                </div>
                {item.codigo && (
                  <div style={{ fontSize: 11, color: '#475569', fontFamily: 'ui-monospace, monospace' }}>
                    {item.codigo}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Stock actual: <strong>{fmtCant(item.stock_actual)}</strong> {item.unidad || ''}
                </div>
              </div>
              <button
                onClick={() => setItem(null)}
                style={{
                  background: 'white', border: 0, borderRadius: '50%',
                  width: 26, height: 26, cursor: 'pointer', color: '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Cambiar"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <CascadeBtn
              value={null}
              placeholder={loadingCat ? 'Cargando...' : 'Elegir item...'}
              onClick={() => !loadingCat && setPickerItem(true)}
            />
          )}
        </div>

        {/* Cantidad */}
        <div>
          <Label sub={item?.unidad}>Cantidad a sacar</Label>
          <input
            type="number" step="any" min={0}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
            className="m-input"
            style={{
              fontSize: 18, fontWeight: 800, textAlign: 'right',
              ...(item && !stockSuficiente && {
                borderColor: '#fca5a5', background: '#fef2f2',
              }),
            }}
          />
          {item && Number(cantidad) > 0 && (
            <div style={{
              fontSize: 11, color: stockSuficiente ? '#64748b' : '#b91c1c',
              marginTop: 4, textAlign: 'right',
            }}>
              {stockSuficiente
                ? `Quedará ${fmtCant(Number(item.stock_actual) - Number(cantidad))} ${item.unidad || ''}`
                : `⚠ Excede stock disponible (${fmtCant(item.stock_actual)})`}
            </div>
          )}
        </div>

        {/* Tipo de salida */}
        <div>
          <Label>Tipo de salida</Label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}>
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                style={{
                  padding: 10, borderRadius: 10,
                  background: tipo === t.value ? 'var(--m-brand-soft)' : 'white',
                  border: `1.5px solid ${tipo === t.value ? 'var(--m-brand)' : '#e5e7eb'}`,
                  color: tipo === t.value ? 'var(--m-brand)' : '#475569',
                  cursor: 'pointer', textAlign: 'left',
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tipo && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
              {TIPOS.find(t => t.value === tipo)?.desc}
            </div>
          )}
        </div>

        {/* Destino */}
        <div>
          <Label sub="opcional">Destino</Label>
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="A dónde va (área, persona, cliente...)"
            className="m-input"
            style={{ fontSize: 14 }}
          />
        </div>

        {/* Motivo */}
        <div>
          <Label sub="opcional">Motivo</Label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Detalle breve del motivo"
            className="m-input"
            style={{ fontSize: 14 }}
          />
        </div>

        {/* Fecha */}
        <div>
          <Label>Fecha</Label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="m-input"
            style={{ fontSize: 14 }}
          />
        </div>

        {/* Observaciones */}
        <div>
          <Label sub="opcional">Observaciones</Label>
          <textarea
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas internas..."
            className="m-input"
            style={{ padding: 10, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 10, padding: 10, fontSize: 13,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid #e5e7eb',
        padding: '10px 12px', display: 'flex', gap: 8, zIndex: 50,
      }}>
        <button
          onClick={() => navigate(-1)}
          className="m-btn m-btn-outline"
          style={{ flex: 1, minHeight: 48, borderColor: '#cbd5e1', color: '#475569' }}
        >
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          disabled={enviando || !formularioValido}
          onClick={enviar}
          style={{ flex: 2, minHeight: 48 }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Registrando...</>
            : <><Save size={18} /> Registrar salida</>}
        </button>
      </div>

      {pickerItem && (
        <ItemPicker
          items={items}
          lineas={lineas}
          onPick={(it) => { setItem(it); setPickerItem(false); }}
          onClose={() => setPickerItem(false)}
        />
      )}
    </div>
  );
};

/* ──────── Sub-componentes ──────── */
const Label = ({ children, sub }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  }}>
    <span style={{
      fontSize: 11, fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: '.04em',
    }}>{children}</span>
    {sub && <span style={{ fontSize: 10, color: '#94a3b8' }}>{sub}</span>}
  </div>
);

const CascadeBtn = ({ value, placeholder, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%', padding: '10px 12px',
      background: 'white', border: '1px solid #d1d5db',
      borderRadius: 10, minHeight: 48,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer', fontSize: 14, textAlign: 'left',
    }}
  >
    <span style={{
      fontWeight: value ? 600 : 400,
      color: value ? '#0f172a' : '#94a3b8',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value || placeholder}
    </span>
    <ChevronDown size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
  </button>
);

const ItemPicker = ({ items, lineas, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(it => {
      const lineaItem = lineas.find(l => Number(l.id) === Number(it.linea_negocio_id));
      const blob = `${it.nombre || ''} ${it.codigo || ''} ${lineaItem?.nombre || ''}`.toLowerCase();
      return !s || blob.includes(s);
    });
  }, [items, q, lineas]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', width: '100%',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: '12px 16px 20px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Elegir item</div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8',
          }} />
          <input
            className="m-input" autoFocus
            placeholder="Buscar..."
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 14 }}
          />
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: '#f8fafc',
          borderRadius: 8, maxHeight: '60vh',
        }}>
          {filtrados.slice(0, 80).map(it => {
            const lineaItem = lineas.find(l => Number(l.id) === Number(it.linea_negocio_id));
            return (
              <button
                key={it.id}
                onClick={() => onPick(it)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'transparent', border: 0,
                  borderBottom: '1px solid #f1f5f9',
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                {lineaItem ? (
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
                    {lineaItem.nombre}
                  </div>
                ) : (
                  <div style={{
                    display: 'inline-flex',
                    fontSize: 10, fontWeight: 700, color: '#94a3b8',
                    background: '#f1f5f9',
                    padding: '1px 8px', borderRadius: 999,
                    marginBottom: 4,
                  }}>
                    Sin línea
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {it.nombre}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                  {it.codigo ? `${it.codigo} · ` : ''}Stock: {fmtCant(it.stock_actual)} {it.unidad || ''}
                </div>
              </button>
            );
          })}
          {filtrados.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Sin resultados.
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="m-btn m-btn-outline"
          style={{ marginTop: 10, minHeight: 44 }}
        >Cerrar</button>
      </div>
    </div>
  );
};

function fmtCant(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default MobileNuevaSalidaLibre;
