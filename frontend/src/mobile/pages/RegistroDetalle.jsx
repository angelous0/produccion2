import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, QrCode, MessageSquare, MoreVertical,
  ArrowDownToLine, Plus, AlertTriangle, AlertOctagon,
  List, Grid, Package, Layers, FlaskConical, AlertCircle, DollarSign,
  ChevronRight, Lock, Loader2, Copy, Ban, Check, X,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MobileRegistroDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [registro, setRegistro] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sheets
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [accion, setAccion] = useState(null); // 'cerrar' | 'anular'

  const fetchRegistro = async () => {
    try {
      const res = await axios.get(`${API}/registros/${id}`);
      setRegistro(res.data);
    } catch {
      setRegistro(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRegistro(); }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (!registro) {
    return (
      <div>
        <div className="m-header">
          <button className="m-h-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, fontWeight: 600 }}>Registro no encontrado</div>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <p>No se pudo cargar el registro.</p>
          <Link to="/m/registros" style={{ color: 'var(--m-brand)', fontWeight: 600 }}>← Volver a registros</Link>
        </div>
      </div>
    );
  }

  const totalPzs = Object.values(registro.tallas || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) ||
    (Array.isArray(registro.tallas) ? registro.tallas.reduce((s, t) => s + (Number(t.cantidad) || 0), 0) : 0);

  const cerrada = registro.estado === 'CERRADA';
  const anulada = registro.estado === 'ANULADA';
  const inactiva = cerrada || anulada;

  return (
    <div>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Registro</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {registro.n_corte}
          </div>
        </div>
        <Link
          to={`/m/registros/${registro.id}/qr`}
          className="m-h-icon"
          aria-label="QR del corte"
          title="Identificación del corte"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <QrCode size={18} />
        </Link>
        <Link
          to={`/m/registros/${registro.id}/chat`}
          className="m-h-icon"
          aria-label="Chat"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <MessageSquare size={18} />
        </Link>
        <button
          className="m-h-icon"
          aria-label="Más opciones"
          onClick={() => setMenuAbierto(true)}
        >
          <MoreVertical size={18} />
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Aviso si está cerrada/anulada */}
        {inactiva && (
          <div style={{
            background: cerrada ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${cerrada ? '#86efac' : '#fca5a5'}`,
            color: cerrada ? '#15803d' : '#b91c1c',
            borderRadius: 12, padding: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 13,
          }}>
            {cerrada ? <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <Ban size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div>
              <strong>OP {registro.estado}.</strong>{' '}
              {cerrada
                ? 'No se aceptan nuevos movimientos ni descargas.'
                : 'Este registro fue anulado.'}
            </div>
          </div>
        )}

        {/* Hero card del modelo */}
        <div className="m-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>
                {registro.modelo_nombre || registro.modelo_manual?.nombre_modelo || '—'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {registro.marca_nombre || registro.modelo_manual?.marca_texto || ''}
                {registro.tipo_nombre ? ` · ${registro.tipo_nombre}` : ''}
              </div>
            </div>
            <div>
              <span className={`m-pill ${estadoPillClass(registro.estado)}`}>{registro.estado || '—'}</span>
              {registro.urgente && (
                <span className="m-pill m-pill-red" style={{ marginLeft: 4 }}><AlertOctagon size={10} /> URG</span>
              )}
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
            marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', textAlign: 'center',
          }}>
            <KpiMini label="prendas" value={totalPzs || '—'} />
            <KpiMini label="curva" value={registro.curva || '—'} small />
            <KpiMini label="lote" value={registro.lote || registro.n_corte?.slice(-3) || '—'} />
            <KpiMini label="entrega" value={fmtFecha(registro.fecha_entrega_final)} small />
          </div>
        </div>

        {/* 4 acciones rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <QuickAction
            icon={<ArrowDownToLine size={16} />} label="Descarga MP"
            bg="var(--m-brand-soft)" color="var(--m-brand)"
            to={inactiva ? null : `/m/registros/${registro.id}/descarga-mp`}
            disabled={inactiva}
          />
          <QuickAction
            icon={<Plus size={16} />} label="Movimiento"
            bg="#dbeafe" color="#2563eb"
            to={inactiva ? null : `/m/registros/${registro.id}/nuevo-movimiento`}
            disabled={inactiva}
          />
          <QuickAction
            icon={<AlertTriangle size={16} />} label="Incidencia"
            bg="#fef3c7" color="#b45309"
            to={inactiva ? null : `/m/registros/${registro.id}/nueva-incidencia`}
            disabled={inactiva}
          />
          <QuickAction
            icon={<AlertOctagon size={16} />} label="Fallado"
            bg="#fee2e2" color="#dc2626"
            to={inactiva ? null : `/m/registros/${registro.id}/nuevo-fallado`}
            disabled={inactiva}
          />
        </div>

        {/* Lista de secciones */}
        <div className="m-label-xs" style={{ marginTop: 4 }}>Secciones del registro</div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          <SectionRow icon={<List size={18} />} bg="#f1f5f9" iconColor="#475569"
            title="Tallas" meta={registro.curva ? `Curva ${registro.curva}` : 'Distribución por talla'}
            to={`/m/registros/${registro.id}/tallas`} />
          <SectionRow icon={<Grid size={18} />} bg="#faf5ff" iconColor="#9333ea"
            title="Matriz colores" meta="Talla × color · asignar"
            to={`/m/registros/${registro.id}/matriz-colores`} />
          <SectionRow icon={<Package size={18} />} bg="#ecfdf5" iconColor="#059669"
            title="Materiales · Requerimiento MP" meta="Ver BOM y descargas"
            to={`/m/registros/${registro.id}/materiales`} />
          <SectionRow icon={<Lock size={18} />} bg="#f0fdfa" iconColor="#0f766e"
            title="Reservas de MP" meta="Lotes reservados y liberación"
            to={`/m/registros/${registro.id}/reservas`} />
          <SectionRow icon={<Layers size={18} />} bg="#dbeafe" iconColor="#2563eb"
            title="Movimientos de producción" meta="Avance por servicio"
            to={`/m/registros/${registro.id}/movimientos`} />
          <SectionRow icon={<FlaskConical size={18} />} bg="#fef9c3" iconColor="#a16207"
            title="Muestras a lavandería" meta="Envíos parciales de prueba"
            to={`/m/registros/${registro.id}/muestras-lavanderia`} />
          <SectionRow icon={<AlertOctagon size={18} />} bg="#fee2e2" iconColor="#dc2626"
            title="Arreglos" meta="Fallados y entregas"
            to={`/m/registros/${registro.id}/arreglos`} />
          <SectionRow icon={<AlertCircle size={18} />} bg="#fef3c7" iconColor="#b45309"
            title="Incidencias" meta="Activas y cerradas"
            to={`/m/registros/${registro.id}/incidencias`} />
          <SectionRow icon={<DollarSign size={18} />} bg="#f1f5f9" iconColor="#475569"
            title="Costos por servicio" meta="MP + servicios + total"
            to={`/m/registros/${registro.id}/costos`} last />
        </div>

        {/* Cerrar registro */}
        {!inactiva && (
          <Link
            to={`/m/registros/${registro.id}/cerrar`}
            className="m-btn m-btn-outline"
            style={{
              borderColor: '#cbd5e1', color: '#64748b', marginTop: 8,
              textDecoration: 'none',
            }}
          >
            <Lock size={16} />
            Cerrar registro
          </Link>
        )}
      </div>

      {/* Bottom sheet: Más opciones */}
      {menuAbierto && (
        <MenuOpcionesSheet
          registro={registro}
          onClose={() => setMenuAbierto(false)}
          onCerrar={() => {
            setMenuAbierto(false);
            navigate(`/m/registros/${registro.id}/cerrar`);
          }}
          onAnular={() => { setMenuAbierto(false); setAccion('anular'); }}
          inactiva={inactiva}
        />
      )}

      {/* Bottom sheet: Cerrar / Anular */}
      {accion && (
        <ConfirmarAccionSheet
          registro={registro}
          accion={accion}
          onClose={() => setAccion(null)}
          onDone={async () => {
            setAccion(null);
            await fetchRegistro();
          }}
        />
      )}
    </div>
  );
};

const KpiMini = ({ label, value, small = false }) => (
  <div>
    <div style={{ fontWeight: 700, fontSize: small ? 13 : 16 }}>{value}</div>
    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
  </div>
);

const QuickAction = ({ icon, label, bg, color, to, disabled = false }) => {
  const inner = (
    <>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: disabled ? '#f1f5f9' : bg, color: disabled ? '#cbd5e1' : color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <span style={{
        fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.2,
        color: disabled ? '#94a3b8' : 'inherit',
      }}>{label}</span>
    </>
  );
  const style = {
    background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
    padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', color: 'inherit',
    opacity: disabled ? 0.6 : 1,
  };
  if (to && !disabled) return <Link to={to} style={style}>{inner}</Link>;
  return <button style={style} disabled={disabled}>{inner}</button>;
};

const SectionRow = ({ icon, bg, iconColor, title, meta, last = false, to }) => {
  const inner = (
    <>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: bg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{meta}</div>
      </div>
      <ChevronRight size={18} style={{ color: '#cbd5e1' }} />
    </>
  );
  const style = {
    width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 12,
    background: 'transparent', border: 0, borderBottom: last ? 0 : '1px solid #f1f5f9',
    cursor: 'pointer', textAlign: 'left',
    textDecoration: 'none', color: 'inherit',
  };
  if (to) return <Link to={to} style={style}>{inner}</Link>;
  return <button style={style}>{inner}</button>;
};

/* ═════════════════════ Bottom sheet: Más opciones ═════════════════════ */
const MenuOpcionesSheet = ({ registro, onClose, onCerrar, onAnular, inactiva }) => {
  const [copiado, setCopiado] = useState(false);

  const copiarCorte = async () => {
    try {
      await navigator.clipboard.writeText(registro.n_corte || '');
      setCopiado(true);
      setTimeout(() => { setCopiado(false); onClose(); }, 800);
    } catch { /* silent */ }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 12, padding: '0 4px' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Opciones del registro</div>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
          {registro.n_corte}
        </div>
      </div>

      <Link
        to={`/m/registros/${registro.id}/qr`}
        onClick={onClose}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <ActionRow icon={<QrCode size={18} style={{ color: '#0f766e' }} />}
          label="Ver identificación del corte" />
      </Link>

      <ActionRow
        icon={copiado ? <Check size={18} style={{ color: '#15803d' }} /> : <Copy size={18} style={{ color: '#475569' }} />}
        label={copiado ? 'N° de corte copiado' : 'Copiar N° de corte'}
        onClick={copiarCorte}
      />

      {!inactiva && (
        <>
          <div className="m-label-xs" style={{ marginTop: 10, padding: '0 4px' }}>Acciones</div>
          <ActionRow
            icon={<Lock size={18} style={{ color: '#475569' }} />}
            label="Cerrar OP"
            sub="Marca como CERRADA y libera reservas"
            onClick={onCerrar}
          />
          <ActionRow
            icon={<Ban size={18} style={{ color: '#b91c1c' }} />}
            label="Anular OP"
            sub="Marca como ANULADA · no reversible"
            onClick={onAnular}
            danger
          />
        </>
      )}

      <button
        onClick={onClose}
        className="m-btn m-btn-outline"
        style={{ width: '100%', marginTop: 14, borderColor: '#cbd5e1', color: '#64748b' }}
      >
        Cancelar
      </button>
    </SheetShell>
  );
};

/* ═════════════════════ Bottom sheet: Cerrar / Anular ═════════════════════ */
const ConfirmarAccionSheet = ({ registro, accion, onClose, onDone }) => {
  const esCerrar = accion === 'cerrar';
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const ejecutar = async () => {
    setError('');
    setEnviando(true);
    try {
      const url = esCerrar
        ? `${API}/registros/${registro.id}/cerrar`
        : `${API}/registros/${registro.id}/anular`;
      const res = await axios.post(url);
      setResultado(res.data);
    } catch (e) {
      const det = e?.response?.data?.detail || `Error al ${esCerrar ? 'cerrar' : 'anular'} la OP`;
      setError(typeof det === 'string' ? det : String(det));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SheetShell onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: esCerrar ? '#dcfce7' : '#fee2e2',
          color: esCerrar ? '#15803d' : '#b91c1c',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          {esCerrar ? <Lock size={26} /> : <Ban size={26} />}
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, textAlign: 'center' }}>
          {esCerrar ? '¿Cerrar esta OP?' : '¿Anular esta OP?'}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
          {esCerrar ? (
            <>
              El registro pasará a <strong>CERRADA</strong>.<br/>
              Se liberarán automáticamente las reservas pendientes y no podrás
              registrar más movimientos sobre este corte.
            </>
          ) : (
            <>
              El registro pasará a <strong>ANULADA</strong>.<br/>
              Esta acción <strong>no revierte</strong> descargas ni movimientos
              ya realizados. Úsala solo si la OP nunca debió crearse.
            </>
          )}
        </div>
        <div style={{
          marginTop: 14, padding: 10, background: '#f8fafc',
          borderRadius: 10, fontSize: 12, textAlign: 'center',
        }}>
          <span style={{ color: '#64748b' }}>Corte: </span>
          <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{registro.n_corte}</strong>
        </div>
      </div>

      {resultado ? (
        <div style={{
          background: '#dcfce7', color: '#15803d',
          border: '1px solid #86efac', borderRadius: 12,
          padding: 12, fontSize: 13, marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Check size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>{resultado.message}</strong>
            {typeof resultado.reservas_liberadas_total !== 'undefined' && (
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Reservas liberadas: <strong>{resultado.reservas_liberadas_total}</strong>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          border: '1px solid #fca5a5', borderRadius: 12,
          padding: 12, fontSize: 13, marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {resultado ? (
        <button
          onClick={onDone}
          className="m-btn m-btn-primary"
          style={{ width: '100%' }}
        >
          Listo
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="m-btn m-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            <X size={16} /> Cancelar
          </button>
          <button
            className="m-btn m-btn-primary"
            style={{
              flex: 1.5,
              background: esCerrar ? 'var(--m-brand)' : '#b91c1c',
            }}
            disabled={enviando}
            onClick={ejecutar}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={16} /> Procesando...</>
              : esCerrar
                ? <><Lock size={16} /> Sí, cerrar OP</>
                : <><Ban size={16} /> Sí, anular OP</>
            }
          </button>
        </div>
      )}
    </SheetShell>
  );
};

/* ═════════════════════ Helpers ═════════════════════ */
const SheetShell = ({ children, onClose }) => (
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
        padding: '12px 20px 24px', maxHeight: '90vh', overflowY: 'auto',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
      {children}
    </div>
  </div>
);

const ActionRow = ({ icon, label, sub, onClick, danger = false }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 12,
      width: '100%', padding: '12px 4px',
      background: 'transparent', border: 0, borderBottom: '1px solid #f8fafc',
      textAlign: 'left', cursor: 'pointer',
      color: danger ? '#b91c1c' : '#0f172a',
    }}
  >
    <div style={{ flexShrink: 0 }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  </button>
);

function estadoPillClass(estado = '') {
  const e = (estado || '').toLowerCase();
  if (e === 'cerrada') return 'm-pill-green';
  if (e === 'anulada') return 'm-pill-red';
  if (e.includes('para corte')) return 'm-pill-gray';
  if (e.includes('costura')) return 'm-pill-blue';
  if (e.includes('lavado') || e.includes('lavandería') || e.includes('lavanderia')) return 'm-pill-amber';
  if (e.includes('bordado') || e.includes('estampado')) return 'm-pill-purple';
  if (e.includes('acabado')) return 'm-pill-amber';
  if (e.includes('paraliz')) return 'm-pill-red';
  if (e.includes('almacén') || e.includes('almacen') || e.includes('tienda')) return 'm-pill-green';
  return 'm-pill-gray';
}

function fmtFecha(d) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
  } catch { return '—'; }
}

export default MobileRegistroDetalle;
