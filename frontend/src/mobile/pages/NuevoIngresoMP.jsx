import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Save, Search, AlertTriangle, Package,
  ChevronDown, X, Info, Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Nuevo ingreso de MP — cabecera (mockup 37).
 *
 *   POST /api/inventario-ingresos
 *   body: { item_id, cantidad, costo_unitario, proveedor, numero_documento,
 *           observaciones, rollos: [], empresa_id, linea_negocio_id }
 *
 * En este sprint NO incluye rollos (eso es Sprint 36).
 * Si más tarde se necesita gestión de rollos, se entra desde el detalle.
 */
export const MobileNuevoIngresoMP = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.CREAR_INGRESO_MP);

  // Catálogos
  const [items, setItems] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);

  // Form state
  const [item, setItem] = useState(null);
  const [busquedaItem, setBusquedaItem] = useState('');
  const [pickerItem, setPickerItem] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [costoUnit, setCostoUnit] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [nDoc, setNDoc] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [lineaNegocioId, setLineaNegocioId] = useState(null);
  const [pickerLinea, setPickerLinea] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Sugerencia de costo del último ingreso
  const [ultimoCosto, setUltimoCosto] = useState(null);

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

  // Cuando elijo item, busco último costo como sugerencia
  useEffect(() => {
    if (!item?.id) { setUltimoCosto(null); return; }
    (async () => {
      try {
        const res = await axios.get(`${API}/inventario-ingresos/ultimo-costo/${item.id}`);
        const c = res.data?.costo_unitario;
        if (typeof c === 'number' && c > 0) {
          setUltimoCosto(c);
          if (!costoUnit) setCostoUnit(String(c));
        } else {
          setUltimoCosto(null);
        }
      } catch {
        setUltimoCosto(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const lineaNombre = useMemo(() => {
    const l = lineas.find(x => Number(x.id) === Number(lineaNegocioId));
    return l ? l.nombre : null;
  }, [lineas, lineaNegocioId]);

  const total = useMemo(() => {
    const c = Number(cantidad) || 0;
    const u = Number(costoUnit) || 0;
    return c * u;
  }, [cantidad, costoUnit]);

  const formularioValido = item && Number(cantidad) > 0;

  const enviar = async () => {
    setError('');
    if (!item) return setError('Elige un item del inventario.');
    if (!cantidad || Number(cantidad) <= 0) return setError('La cantidad debe ser mayor a 0.');
    setEnviando(true);
    try {
      const body = {
        item_id: item.id,
        cantidad: Number(cantidad),
        costo_unitario: Number(costoUnit) || 0,
        proveedor: proveedor.trim(),
        numero_documento: nDoc.trim(),
        observaciones: observaciones.trim(),
        empresa_id: 7,
        linea_negocio_id: lineaNegocioId ? Number(lineaNegocioId) : null,
        rollos: [],
      };
      await axios.post(`${API}/inventario-ingresos`, body);
      navigate('/m/ingresos', { replace: true });
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear el ingreso';
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
          <div style={{ flex: 1, fontWeight: 600 }}>Nuevo ingreso</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          <Lock size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>
            Solo admin / supervisor de inventario puede registrar ingresos.
          </p>
        </div>
      </>
    );
  }

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
          <div style={{ fontWeight: 600, fontSize: 16 }}>Nuevo ingreso</div>
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
              placeholder="Elegir item..."
              onClick={() => setPickerItem(true)}
            />
          )}
        </div>

        {/* Cantidad + costo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label>Cantidad recibida</Label>
            <input
              type="number" step="any" min={0}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className="m-input"
              style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}
            />
            {item?.unidad && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>
                {item.unidad}
              </div>
            )}
          </div>
          <div>
            <Label sub="opcional">Costo unitario S/</Label>
            <input
              type="number" step="any" min={0}
              value={costoUnit}
              onChange={(e) => setCostoUnit(e.target.value)}
              placeholder="0.00"
              className="m-input"
              style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}
            />
            {ultimoCosto !== null && Number(costoUnit) !== ultimoCosto && (
              <button
                onClick={() => setCostoUnit(String(ultimoCosto))}
                style={{
                  fontSize: 10, color: 'var(--m-brand)', fontWeight: 700,
                  background: 'none', border: 0, padding: '4px 0',
                  cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                Último: S/ {ultimoCosto.toFixed(2)}
              </button>
            )}
          </div>
        </div>

        {/* Total estimado */}
        {total > 0 && (
          <div style={{
            background: 'var(--m-brand-soft)', borderRadius: 10,
            padding: 10, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', fontSize: 13,
          }}>
            <span style={{ color: 'var(--m-brand)', fontWeight: 600 }}>
              Valor total del ingreso
            </span>
            <strong style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 16, color: 'var(--m-brand)',
            }}>
              S/ {total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
        )}

        {/* Línea de negocio (heredada del item, no editable) */}
        <div>
          <Label sub={item?.linea_negocio_id ? 'del item' : (item ? 'opcional' : 'requiere item')}>
            Línea de negocio
          </Label>
          {item?.linea_negocio_id ? (
            // Heredada del item → readonly
            <div style={{
              padding: '10px 12px', minHeight: 48,
              background: '#f1f5f9', border: '1px solid #e2e8f0',
              borderRadius: 10, display: 'flex', alignItems: 'center',
              gap: 8, fontSize: 14, fontWeight: 600, color: '#475569',
            }}>
              <Lock size={14} style={{ color: '#94a3b8' }} />
              <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {lineaNombre || '—'}
              </span>
            </div>
          ) : (
            <CascadeBtn
              value={lineaNombre}
              placeholder={item ? 'Elegir línea...' : 'Elige un item primero'}
              onClick={() => item && setPickerLinea(true)}
            />
          )}
          {item?.linea_negocio_id && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Se hereda del item. Para cambiarla, edita la línea desde el catálogo de inventario.
            </div>
          )}
        </div>

        {/* Proveedor */}
        <div>
          <Label sub="opcional">Proveedor</Label>
          <input
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Nombre del proveedor"
            className="m-input"
            style={{ fontSize: 14 }}
          />
        </div>

        {/* N° documento */}
        <div>
          <Label sub="opcional">N° de documento</Label>
          <input
            value={nDoc}
            onChange={(e) => setNDoc(e.target.value)}
            placeholder="Factura / guía / N°..."
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

        {/* Aviso de rollos */}
        <div style={{
          background: '#dbeafe', border: '1px solid #93c5fd',
          borderRadius: 10, padding: 10, fontSize: 11, color: '#1d4ed8',
          display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Si el ingreso son rollos individuales, primero crea el ingreso y luego
            entra al detalle para agregar cada rollo con su QR.
          </span>
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

      {/* Footer fijo */}
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
            ? <><Loader2 className="m-spin" size={18} /> Creando...</>
            : <><Save size={18} /> Registrar ingreso</>}
        </button>
      </div>

      {/* Picker de item */}
      {pickerItem && (
        <PickerSheet
          titulo="Elegir item"
          items={items}
          renderItem={(it) => {
            const lineaItem = lineas.find(l => Number(l.id) === Number(it.linea_negocio_id));
            const lineaNombreItem = lineaItem?.nombre || it.linea_negocio_nombre;
            return (
              <div style={{ minWidth: 0 }}>
                {/* Línea como tag fina arriba */}
                {lineaNombreItem ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, color: 'var(--m-brand)',
                    background: 'var(--m-brand-soft)',
                    padding: '1px 8px', borderRadius: 999,
                    marginBottom: 4,
                    maxWidth: '100%',
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--m-brand)', flexShrink: 0,
                    }} />
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {lineaNombreItem}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, color: '#94a3b8',
                    background: '#f1f5f9',
                    padding: '1px 8px', borderRadius: 999,
                    marginBottom: 4,
                  }}>
                    Sin línea
                  </div>
                )}
                <div style={{
                  fontSize: 14, fontWeight: 600, color: '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {it.nombre}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                  {it.codigo ? `${it.codigo} · ` : ''}Stock: {fmtCant(it.stock_actual)} {it.unidad || ''}
                </div>
              </div>
            );
          }}
          matchFn={(it, q) => {
            const lineaItem = lineas.find(l => Number(l.id) === Number(it.linea_negocio_id));
            const haystack = `${it.nombre || ''} ${it.codigo || ''} ${lineaItem?.nombre || ''}`.toLowerCase();
            return haystack.includes(q);
          }}
          onPick={(it) => {
            setItem(it);
            // Auto-heredar la línea de negocio del item (no se puede cambiar
            // manualmente — viene del catálogo del item).
            if (it.linea_negocio_id) {
              setLineaNegocioId(it.linea_negocio_id);
            } else {
              setLineaNegocioId(null);
            }
            setPickerItem(false);
          }}
          onClose={() => setPickerItem(false)}
        />
      )}

      {/* Picker de línea */}
      {pickerLinea && (
        <PickerSheet
          titulo="Línea de negocio"
          items={lineas.map(l => ({ id: l.id, nombre: l.nombre }))}
          renderItem={(l) => (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{l.nombre}</div>
          )}
          matchFn={(l, q) => (l.nombre || '').toLowerCase().includes(q)}
          onPick={(l) => { setLineaNegocioId(l.id); setPickerLinea(false); }}
          onClose={() => setPickerLinea(false)}
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

const PickerSheet = ({ titulo, items, renderItem, matchFn, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it => matchFn(it, s));
  }, [items, q, matchFn]);

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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>{titulo}</div>
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
          {filtrados.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Sin resultados.
            </div>
          ) : (
            filtrados.slice(0, 80).map(it => (
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
                {renderItem(it)}
              </button>
            ))
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

export default MobileNuevoIngresoMP;
