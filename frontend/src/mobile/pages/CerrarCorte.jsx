import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Lock, AlertTriangle, Check, CheckCircle2,
  Package, Layers, Receipt, DollarSign, ChevronUp, ChevronDown,
  AlertOctagon, Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';
import { PantallaBloqueada } from '../components/PantallaBloqueada';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Cerrar registro · preview + confirmar (mockup 41-42).
 *
 *   GET  /api/registros/:id/preview-cierre  → preview con costos y validaciones
 *   POST /api/registros/:id/cierre-produccion → ejecuta cierre
 *
 * Reemplaza el sheet simple que estaba en RegistroDetalle.
 */
export const MobileCerrarCorte = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeCerrar = puede(user, ACCIONES.CERRAR_OP);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [observacion, setObservacion] = useState('');
  const [qtyManual, setQtyManual] = useState(null); // override de qty terminada
  const [verDesglose, setVerDesglose] = useState({ mp: false, serv: false, otros: false });

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/registros/${registroId}/preview-cierre`);
        setPreview(res.data);
        setQtyManual(Number(res.data?.qty_terminada || 0));
      } catch (e) {
        const det = e?.response?.data?.detail || 'Error al cargar el preview de cierre';
        setError(typeof det === 'string' ? det : String(det));
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  const confirmar = async () => {
    setErrorEnvio('');
    if (!preview?.puede_cerrar) {
      return setErrorEnvio('Hay validaciones pendientes. Revisa los errores arriba.');
    }
    if (!window.confirm(`¿Cerrar este corte definitivamente?\n\nQty: ${qtyManual} prendas · Costo unit: S/ ${preview.costo_unitario_final?.toFixed(2)}`)) {
      return;
    }
    setEnviando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/cierre-produccion`, {
        empresa_id: 7,
        qty_terminada: Number(qtyManual),
        observacion_cierre: observacion.trim() || null,
      });
      navigate(`/m/registros/${registroId}`, { replace: true });
    } catch (e) {
      const det = e?.response?.data?.detail || 'Error al cerrar el corte';
      setErrorEnvio(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  if (!puedeCerrar) {
    return <PantallaBloqueada titulo="Cerrar registro" mensaje="Solo el administrador puede cerrar un corte." />;
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Cerrar corte</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#b91c1c' }}>
          <AlertTriangle size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
          <p style={{ fontSize: 14 }}>{error || 'No se pudo cargar el preview.'}</p>
        </div>
      </>
    );
  }

  const res = preview.resultado_final || {};
  const sumaRes = Number(res.normal || 0) + Number(res.recuperado || 0)
    + Number(res.liquidacion || 0) + Number(res.merma || 0);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', paddingBottom: 76,
    }}>
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{preview.n_corte}</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Cerrar corte</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Validaciones */}
        {!preview.puede_cerrar && preview.errores_validacion?.length > 0 && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 12, padding: 12, color: '#b91c1c',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 13 }}>
              <AlertOctagon size={16} /> No se puede cerrar todavía
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.5 }}>
              {preview.errores_validacion.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Resumen costo total */}
        <div className="m-card" style={{
          background: 'var(--m-brand)', color: 'white',
          borderColor: 'transparent', padding: 18, textAlign: 'center',
        }}>
          <div style={{
            fontSize: 11, opacity: 0.85, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            Costo total del corte
          </div>
          <div style={{
            fontSize: 32, fontWeight: 800, marginTop: 6,
            fontFamily: 'ui-monospace, monospace', lineHeight: 1.1,
          }}>
            S/ {fmtMoneda(preview.costo_total)}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 16,
            marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.25)',
            fontSize: 12,
          }}>
            <div>
              <div style={{ opacity: 0.75, fontSize: 10 }}>Qty terminada</div>
              <div style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                {Number(preview.qty_terminada || 0).toLocaleString('es-PE')}
              </div>
            </div>
            <div>
              <div style={{ opacity: 0.75, fontSize: 10 }}>Costo unitario</div>
              <div style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                S/ {fmtMoneda(preview.costo_unitario_final)}
              </div>
            </div>
          </div>
        </div>

        {/* Desglose de costos */}
        <div>
          <div className="m-label-xs" style={{ marginBottom: 6 }}>Desglose</div>
          <SeccionCosto
            icon={<Package size={18} />} bg="#ecfdf5" iconColor="#059669"
            label="Materia prima"
            monto={preview.costo_mp}
            abierta={verDesglose.mp}
            onToggle={() => setVerDesglose(s => ({ ...s, mp: !s.mp }))}
          >
            <Mini label="Salidas de MP usadas en este corte" />
          </SeccionCosto>
          <SeccionCosto
            icon={<Layers size={18} />} bg="#dbeafe" iconColor="#2563eb"
            label="Servicios de producción"
            monto={preview.costo_servicios}
            abierta={verDesglose.serv}
            onToggle={() => setVerDesglose(s => ({ ...s, serv: !s.serv }))}
          >
            <Mini label="Suma de movimientos de costura, lavandería, etc." />
          </SeccionCosto>
          <SeccionCosto
            icon={<Receipt size={18} />} bg="#fef3c7" iconColor="#b45309"
            label="Otros costos"
            monto={preview.costo_otros}
            abierta={verDesglose.otros}
            onToggle={() => setVerDesglose(s => ({ ...s, otros: !s.otros }))}
          >
            <Mini label="Costos extra agregados al registro" />
          </SeccionCosto>
          {Number(preview.costo_cif || 0) > 0 && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 12, padding: 12, marginTop: 6,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#e2e8f0',
                color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <DollarSign size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>CIF (overhead)</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Prorrateo del mes · {preview.cif_detalle?.proporcion_pct?.toFixed(1)}%
                </div>
              </div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
                S/ {fmtMoneda(preview.costo_cif)}
              </div>
            </div>
          )}
        </div>

        {/* Resultado físico final */}
        <div>
          <div className="m-label-xs" style={{ marginBottom: 6 }}>Resultado físico</div>
          <div style={{
            background: 'white', border: '1px solid #e5e7eb',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <FilaResultado
              icon={<CheckCircle2 size={16} style={{ color: '#15803d' }} />}
              label="Normal (a almacén)" value={Number(res.normal || 0)}
            />
            <FilaResultado
              icon={<CheckCircle2 size={16} style={{ color: '#0f766e' }} />}
              label="Recuperado de arreglo" value={Number(res.recuperado || 0)}
            />
            <FilaResultado
              icon={<AlertTriangle size={16} style={{ color: '#b45309' }} />}
              label="Liquidación" value={Number(res.liquidacion || 0)}
            />
            <FilaResultado
              icon={<AlertOctagon size={16} style={{ color: '#b91c1c' }} />}
              label="Merma" value={Number(res.merma || 0)}
            />
            {Number(res.fallado_pendiente || 0) > 0 && (
              <FilaResultado
                icon={<AlertTriangle size={16} style={{ color: '#dc2626' }} />}
                label="Fallado pendiente" value={Number(res.fallado_pendiente || 0)}
                warn
              />
            )}
            <div style={{
              padding: 10, background: '#f8fafc',
              borderTop: '1px solid #e5e7eb',
              display: 'flex', justifyContent: 'space-between',
              fontSize: 13, fontWeight: 700,
            }}>
              <span>Suma</span>
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{sumaRes} pzs</span>
            </div>
          </div>
        </div>

        {/* Qty terminada editable */}
        <div>
          <div className="m-label-xs" style={{ marginBottom: 6 }}>
            Cantidad terminada (a ingresar a PT)
          </div>
          <input
            type="number" min={0} value={qtyManual ?? ''}
            onChange={(e) => setQtyManual(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="m-input"
            style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Por defecto: suma de tallas. Puedes ajustar si hubo discrepancia física.
          </div>
        </div>

        {/* Observación */}
        <div>
          <div className="m-label-xs" style={{ marginBottom: 6 }}>Observación del cierre</div>
          <textarea
            rows={2}
            className="m-input"
            placeholder="Notas del cierre (opcional)..."
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            style={{ padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>

        {/* PT info */}
        {preview.pt_item && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: 10, fontSize: 11, color: '#475569',
            display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5,
          }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Las prendas se cargarán como ingreso del item PT:
              <strong> {preview.pt_item.codigo} · {preview.pt_item.nombre}</strong>
            </span>
          </div>
        )}

        {errorEnvio && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c',
            borderRadius: 10, padding: 10, fontSize: 13,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{errorEnvio}</span>
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
          style={{ flex: 1, borderColor: '#cbd5e1', color: '#475569', minHeight: 48 }}
        >
          Cancelar
        </button>
        <button
          className="m-btn m-btn-primary"
          disabled={enviando || !preview.puede_cerrar || !qtyManual || qtyManual <= 0}
          onClick={confirmar}
          style={{ flex: 2, minHeight: 48 }}
        >
          {enviando
            ? <><Loader2 className="m-spin" size={18} /> Cerrando...</>
            : <><Lock size={18} /> Confirmar cierre</>}
        </button>
      </div>
    </div>
  );
};

/* ──────── Sub-componentes ──────── */

const SeccionCosto = ({ icon, bg, iconColor, label, monto, abierta, onToggle, children }) => (
  <div style={{
    background: 'white', border: '1px solid #e5e7eb',
    borderRadius: 12, overflow: 'hidden', marginBottom: 6,
  }}>
    <button
      onClick={onToggle}
      style={{
        width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 12,
        background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: bg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontWeight: 700,
        color: '#0f172a', fontSize: 14, marginRight: 4,
      }}>
        S/ {fmtMoneda(monto)}
      </div>
      {abierta ? <ChevronUp size={16} style={{ color: '#cbd5e1' }} />
               : <ChevronDown size={16} style={{ color: '#cbd5e1' }} />}
    </button>
    {abierta && (
      <div style={{ padding: 10, borderTop: '1px solid #f1f5f9' }}>
        {children}
      </div>
    )}
  </div>
);

const Mini = ({ label }) => (
  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
    {label}
  </div>
);

const FilaResultado = ({ icon, label, value, warn = false }) => (
  <div style={{
    padding: 10, display: 'flex', alignItems: 'center', gap: 10,
    borderBottom: '1px solid #f1f5f9',
    background: warn ? '#fef2f2' : 'transparent',
  }}>
    {icon}
    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: warn ? '#b91c1c' : '#0f172a' }}>
      {label}
    </span>
    <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>
      {value.toLocaleString('es-PE')}
    </strong>
  </div>
);

function fmtMoneda(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default MobileCerrarCorte;
