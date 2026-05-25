import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, DollarSign, Package, Layers,
  Receipt, ChevronDown, ChevronUp, Lock,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Costos del registro (MP + servicios + otros) usando el resumen del backend:
 *   GET /api/costo-lote/:id/detalle
 *
 * Pantalla de consulta, no edita.
 */
export const MobileCostosRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seccion, setSeccion] = useState(null); // 'mp' | 'serv' | 'otros'

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/costo-lote/${registroId}/detalle`);
        setData(res.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [registroId]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Costos</div>
        </div>
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
          No se pudieron cargar los costos del registro.
        </div>
      </>
    );
  }

  const resumen = data.resumen || {};
  const detMP = data.detalle_mp || [];
  const detServ = data.detalle_servicios || [];
  const detOtros = data.detalle_otros || [];

  const toggle = (k) => setSeccion(seccion === k ? null : k);

  return (
    <>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {data.modelo || 'Costos'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {data.n_corte}
            {data.cerrado && ' · CERRADO'}
            {' · Costos'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total grande */}
        <div className="m-card" style={{
          background: 'var(--m-brand)', color: 'white',
          borderColor: 'transparent', padding: 18, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {data.cerrado ? 'Costo total (cerrado)' : 'Costo total (estimado)'}
          </div>
          <div style={{
            fontSize: 32, fontWeight: 800, marginTop: 6,
            fontFamily: 'ui-monospace, monospace', lineHeight: 1.1,
          }}>
            S/ {fmtMoneda(resumen.costo_total)}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 16,
            marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.25)',
            fontSize: 12,
          }}>
            <div>
              <div style={{ opacity: 0.75, fontSize: 10 }}>Prendas</div>
              <div style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                {Number(data.cantidad_prendas || 0).toLocaleString('es-PE')}
              </div>
            </div>
            <div>
              <div style={{ opacity: 0.75, fontSize: 10 }}>C. unitario</div>
              <div style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                S/ {fmtMoneda(data.costo_unitario)}
              </div>
            </div>
          </div>
          {data.cerrado && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 10, padding: '4px 10px', background: 'rgba(255,255,255,0.15)',
              borderRadius: 999, fontSize: 10, fontWeight: 700,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              <Lock size={11} /> Snapshot al cierre
            </div>
          )}
        </div>

        {/* Desglose */}
        <div className="m-label-xs" style={{ marginTop: 4 }}>Desglose</div>

        <SeccionCosto
          icon={<Package size={18} />} bg="#ecfdf5" iconColor="#059669"
          label="Materia prima" monto={resumen.costo_mp}
          itemsCount={detMP.length}
          abierta={seccion === 'mp'} onToggle={() => toggle('mp')}
        >
          {detMP.length === 0
            ? <Vacio msg="Sin descargas de MP registradas." />
            : detMP.map((it, i) => (
                <LineaCosto
                  key={i}
                  titulo={it.item || '—'}
                  sub={`${it.codigo ? it.codigo + ' · ' : ''}${fmtNum(it.cantidad)} und · ${fmtFecha(it.fecha)}`}
                  monto={it.costo}
                />
              ))}
        </SeccionCosto>

        <SeccionCosto
          icon={<Layers size={18} />} bg="#dbeafe" iconColor="#2563eb"
          label="Servicios de producción" monto={resumen.costo_servicios}
          itemsCount={detServ.length}
          abierta={seccion === 'serv'} onToggle={() => toggle('serv')}
        >
          {detServ.length === 0
            ? <Vacio msg="Sin movimientos de servicio registrados." />
            : detServ.map((s, i) => (
                <LineaCosto
                  key={i}
                  titulo={`${s.servicio || '—'}${s.persona ? ` · ${s.persona}` : ''}`}
                  sub={`${s.recibidas || 0}/${s.enviadas || 0} pzs · tarifa S/ ${fmtMoneda(s.tarifa)} · ${fmtFecha(s.fecha_inicio)}`}
                  monto={s.costo}
                />
              ))}
        </SeccionCosto>

        <SeccionCosto
          icon={<Receipt size={18} />} bg="#fef3c7" iconColor="#b45309"
          label="Otros costos" monto={resumen.costo_otros}
          itemsCount={detOtros.length}
          abierta={seccion === 'otros'} onToggle={() => toggle('otros')}
        >
          {detOtros.length === 0
            ? <Vacio msg="Sin otros costos cargados." />
            : detOtros.map((o, i) => (
                <LineaCosto
                  key={i}
                  titulo={o.descripcion || '—'}
                  sub={`${o.proveedor || 'Sin proveedor'} · ${fmtFecha(o.fecha)}`}
                  monto={o.monto}
                />
              ))}
        </SeccionCosto>

        {Number(resumen.costo_cif || 0) > 0 && (
          <div className="m-card" style={{
            background: '#f8fafc', borderColor: '#e2e8f0',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: '#e2e8f0',
              color: '#475569',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DollarSign size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>CIF (overhead)</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Costo indirecto de fabricación
              </div>
            </div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#475569' }}>
              S/ {fmtMoneda(resumen.costo_cif)}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const SeccionCosto = ({
  icon, bg, iconColor, label, monto, itemsCount,
  abierta, onToggle, children,
}) => (
  <div style={{
    background: 'white', border: '1px solid #e5e7eb',
    borderRadius: 12, overflow: 'hidden',
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {itemsCount} item{itemsCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontWeight: 700,
          color: '#0f172a', fontSize: 14,
        }}>
          S/ {fmtMoneda(monto)}
        </div>
      </div>
      {abierta ? <ChevronUp size={18} style={{ color: '#cbd5e1' }} /> : <ChevronDown size={18} style={{ color: '#cbd5e1' }} />}
    </button>
    {abierta && (
      <div style={{ borderTop: '1px solid #f1f5f9' }}>
        {children}
      </div>
    )}
  </div>
);

const LineaCosto = ({ titulo, sub, monto }) => (
  <div style={{
    padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10,
    borderBottom: '1px solid #f8fafc',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 13, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {titulo}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
    <div style={{
      fontFamily: 'ui-monospace, monospace', fontWeight: 700,
      color: '#0f172a', fontSize: 13, flexShrink: 0,
    }}>
      S/ {fmtMoneda(monto)}
    </div>
  </div>
);

const Vacio = ({ msg }) => (
  <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
    {msg}
  </div>
);

function fmtMoneda(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-PE');
}
function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}`;
  }
  return s;
}

export default MobileCostosRegistro;
