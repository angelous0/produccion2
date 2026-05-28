import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Plus, AlertTriangle, Package,
  Save, X, QrCode, Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Detalle de un ingreso de MP con gestión de rollos (mockup 38).
 *   GET  /api/inventario-ingresos/:id/rollos → lista de rollos
 *   POST /api/rollos                          → crear rollo (solo si item controla rollos)
 *
 * Endpoint /inventario-ingresos no devuelve uno por id, así que filtramos
 * desde la lista completa al cargar.
 */
export const MobileIngresoDetalle = () => {
  const { id: ingresoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCrear = puede(user, ACCIONES.AGREGAR_ROLLOS);

  const [ingreso, setIngreso] = useState(null);
  const [rollos, setRollos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetNuevoRollo, setSheetNuevoRollo] = useState(false);

  const cargar = async () => {
    try {
      const [listaRes, rolRes] = await Promise.all([
        axios.get(`${API}/inventario-ingresos`),
        axios.get(`${API}/inventario-ingresos/${ingresoId}/rollos`).catch(() => ({ data: [] })),
      ]);
      const lista = Array.isArray(listaRes.data) ? listaRes.data : [];
      setIngreso(lista.find(x => x.id === ingresoId) || null);
      setRollos(Array.isArray(rolRes.data) ? rolRes.data : []);
    } catch {
      setIngreso(null);
      setRollos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [ingresoId]);

  const totalMetros = useMemo(
    () => rollos.reduce((s, r) => s + Number(r.metros_iniciales || 0), 0),
    [rollos],
  );
  const totalDisponible = useMemo(
    () => rollos.reduce((s, r) => s + Number(r.metros_saldo || 0), 0),
    [rollos],
  );

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!ingreso) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Ingreso no encontrado</div>
        </div>
      </>
    );
  }

  const controlaRollos = !!ingreso.item_control_por_rollos
    || (typeof ingreso.control_por_rollos !== 'undefined' && !!ingreso.control_por_rollos);

  return (
    <div style={{ paddingBottom: puedeCrear ? 76 : 0 }}>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            Ingreso · {fmtFecha(ingreso.fecha)}
          </div>
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ingreso.item_nombre || '—'}
          </div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Card de info del ingreso */}
        <div className="m-card" style={{
          background: 'var(--m-brand-soft)', borderColor: 'transparent',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'white', color: 'var(--m-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Package size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, color: '#64748b', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.04em',
            }}>
              Recibido
            </div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: 'var(--m-brand)',
              fontFamily: 'ui-monospace, monospace', lineHeight: 1.1,
            }}>
              {fmtCant(ingreso.cantidad)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Disponible: <strong>{fmtCant(ingreso.cantidad_disponible)}</strong>
            </div>
          </div>
        </div>

        {/* Detalles */}
        <div className="m-card" style={{ padding: 14 }}>
          {ingreso.proveedor && <Row label="Proveedor" value={ingreso.proveedor} />}
          {ingreso.numero_documento && <Row label="N° Documento" value={ingreso.numero_documento} mono />}
          {ingreso.linea_negocio_nombre && <Row label="Línea de negocio" value={ingreso.linea_negocio_nombre} />}
          {Number(ingreso.costo_unitario || 0) > 0 && (
            <Row label="Costo unitario" value={`S/ ${Number(ingreso.costo_unitario).toFixed(2)}`} mono />
          )}
          {ingreso.estado_facturacion && (
            <Row label="Facturación" value={ingreso.estado_facturacion} />
          )}
          {ingreso.observaciones && (
            <div style={{
              marginTop: 8, padding: 8, background: '#f8fafc',
              borderRadius: 8, fontSize: 12, color: '#475569',
              fontStyle: 'italic',
            }}>
              "{ingreso.observaciones}"
            </div>
          )}
        </div>

        {/* Rollos */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <span className="m-label-xs">
              Rollos ({rollos.length})
            </span>
            {rollos.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--m-brand)' }}>
                {fmtCant(totalDisponible)} / {fmtCant(totalMetros)} disponibles
              </span>
            )}
          </div>

          {rollos.length === 0 ? (
            <div className="m-card" style={{
              textAlign: 'center', padding: 24, color: '#64748b',
            }}>
              <Layers size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 13, margin: 0 }}>
                Aún no hay rollos cargados en este ingreso.
              </p>
              {puedeCrear && (
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Toca <strong>Agregar rollo</strong> abajo para empezar.
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rollos.map(r => <RolloCard key={r.id} rollo={r} />)}
            </div>
          )}
        </div>
      </div>

      {/* Footer fijo con botón agregar rollo */}
      {puedeCrear && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'white', borderTop: '1px solid #e5e7eb',
          padding: '10px 12px', zIndex: 50,
        }}>
          <button
            onClick={() => setSheetNuevoRollo(true)}
            className="m-btn m-btn-primary"
            style={{ width: '100%', minHeight: 48 }}
          >
            <Plus size={18} /> Agregar rollo
          </button>
        </div>
      )}

      {/* Sheet de agregar rollo */}
      {sheetNuevoRollo && (
        <NuevoRolloSheet
          ingreso={ingreso}
          siguienteNumero={rollos.length + 1}
          onClose={() => setSheetNuevoRollo(false)}
          onGuardado={async () => { setSheetNuevoRollo(false); await cargar(); }}
        />
      )}
    </div>
  );
};

/* ──────── Card de rollo ──────── */
const RolloCard = ({ rollo }) => {
  const usado = Number(rollo.metros_iniciales || 0) - Number(rollo.metros_saldo || 0);
  const pct = rollo.metros_iniciales > 0
    ? (usado / Number(rollo.metros_iniciales)) * 100 : 0;
  const agotado = Number(rollo.metros_saldo || 0) <= 0;

  return (
    <div className="m-card" style={{ padding: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: agotado ? '#fee2e2' : 'var(--m-brand-soft)',
          color: agotado ? '#b91c1c' : 'var(--m-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <QrCode size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {rollo.numero_rollo || rollo.codigo || `Rollo ${rollo.id?.slice(0, 6)}`}
          </div>
          {rollo.lote && (
            <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
              Lote: {rollo.lote}
            </div>
          )}
          <div style={{
            marginTop: 4, fontSize: 11, color: '#64748b',
            display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
          }}>
            {rollo.color && <span>· {rollo.color}</span>}
            {rollo.tono && <span>· {rollo.tono}</span>}
            {rollo.ancho && <span>· ancho {rollo.ancho}</span>}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 999,
          background: agotado ? '#fee2e2' : '#dcfce7',
          color: agotado ? '#b91c1c' : '#15803d',
          textTransform: 'uppercase', letterSpacing: '.02em',
        }}>
          {agotado ? 'AGOTADO' : (rollo.estado || 'ACTIVO')}
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 12, marginBottom: 4,
      }}>
        <span style={{ color: '#64748b' }}>
          {fmtCant(rollo.metros_saldo)} de {fmtCant(rollo.metros_iniciales)} disponibles
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          {pct.toFixed(0)}% usado
        </span>
      </div>
      <div style={{
        height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(100, pct)}%`,
          background: agotado ? '#dc2626' : 'var(--m-brand)',
        }} />
      </div>
    </div>
  );
};

/* ──────── Sheet: nuevo rollo ──────── */
const NuevoRolloSheet = ({ ingreso, siguienteNumero, onClose, onGuardado }) => {
  const [codigo, setCodigo] = useState(`R-${String(siguienteNumero).padStart(3, '0')}`);
  const [lote, setLote] = useState('');
  const [metros, setMetros] = useState('');
  const [ancho, setAncho] = useState('');
  const [tono, setTono] = useState('');
  const [costoMetro, setCostoMetro] = useState(String(ingreso?.costo_unitario || ''));
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async () => {
    setError('');
    if (!metros || Number(metros) <= 0) return setError('Indica los metros iniciales del rollo.');
    setEnviando(true);
    try {
      await axios.post(`${API}/rollos`, {
        item_id: ingreso.item_id,
        ingreso_id: ingreso.id,
        codigo_rollo: codigo.trim(),
        lote: lote.trim() || null,
        tono: tono.trim() || null,
        ancho: ancho ? Number(ancho) : null,
        metros_iniciales: Number(metros),
        costo_unitario_metro: costoMetro ? Number(costoMetro) : 0,
        observaciones: observaciones.trim(),
      });
      onGuardado();
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al crear el rollo';
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

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
          padding: '12px 16px 24px', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 14px' }} />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Nuevo rollo</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Para {ingreso?.item_nombre}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>Código del rollo</Label>
            <input
              value={codigo} onChange={(e) => setCodigo(e.target.value)}
              className="m-input"
              style={{ fontSize: 14, fontFamily: 'ui-monospace, monospace' }}
              placeholder="R-001"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Metros</Label>
              <input
                type="number" step="any" min={0}
                value={metros}
                onChange={(e) => setMetros(e.target.value)}
                placeholder="0"
                className="m-input"
                style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}
              />
            </div>
            <div>
              <Label sub="opcional">Ancho</Label>
              <input
                type="number" step="any" min={0}
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                placeholder="0"
                className="m-input"
                style={{ fontSize: 14, textAlign: 'right' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label sub="opcional">Lote</Label>
              <input
                value={lote} onChange={(e) => setLote(e.target.value)}
                className="m-input" style={{ fontSize: 14 }}
                placeholder="LT-2026-01"
              />
            </div>
            <div>
              <Label sub="opcional">Tono</Label>
              <input
                value={tono} onChange={(e) => setTono(e.target.value)}
                className="m-input" style={{ fontSize: 14 }}
                placeholder="Tono A"
              />
            </div>
          </div>

          <div>
            <Label sub="opcional">Costo por metro S/</Label>
            <input
              type="number" step="any" min={0}
              value={costoMetro}
              onChange={(e) => setCostoMetro(e.target.value)}
              placeholder="0.00"
              className="m-input"
              style={{ fontSize: 14, textAlign: 'right' }}
            />
          </div>

          <div>
            <Label sub="opcional">Observaciones</Label>
            <textarea
              rows={2} value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="m-input"
              style={{ padding: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              placeholder="Notas del rollo..."
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

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              onClick={onClose}
              className="m-btn m-btn-outline"
              style={{ flex: 1, minHeight: 46 }}
            >Cancelar</button>
            <button
              onClick={enviar}
              disabled={enviando || !metros || Number(metros) <= 0}
              className="m-btn m-btn-primary"
              style={{ flex: 1.5, minHeight: 46 }}
            >
              {enviando
                ? <><Loader2 className="m-spin" size={16} /> Guardando...</>
                : <><Save size={16} /> Agregar rollo</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ──────── Helpers ──────── */
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

const Row = ({ label, value, mono = false }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13,
  }}>
    <span style={{ color: '#64748b' }}>{label}</span>
    <strong style={{
      color: '#0f172a',
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
    }}>{value}</strong>
  </div>
);

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

export default MobileIngresoDetalle;
