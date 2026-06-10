import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, QrCode, MessageSquare, MoreVertical,
  ArrowDownToLine, Plus, AlertTriangle, AlertOctagon,
  List, Grid, Package, Layers, FlaskConical, AlertCircle, DollarSign,
  ChevronRight, Lock, Loader2, Copy, Ban, Check, X, ChevronDown,
  ArrowRight, SkipForward,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { puede, ACCIONES } from '../utils/permisos';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MobileRegistroDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [registro, setRegistro] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sheets
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [accion, setAccion] = useState(null); // 'cerrar' | 'anular'
  const [cambiarEstadoAbierto, setCambiarEstadoAbierto] = useState(false);

  // Permiso para cambiar estados (viene del JSON _operativos)
  const puedeCambiarEstado =
    user?.rol === 'admin' ||
    user?.permisos?._operativos?.acciones_produccion?.cambiar_estados === true;

  // Cerrar/Anular OP son acciones destructivas — solo roles con el permiso
  // explícito las ven en el menú "⋮" (antes se mostraban a cualquier usuario).
  const puedeCerrarOP = puede(user, ACCIONES.CERRAR_OP);
  const puedeAnularOP = puede(user, ACCIONES.ANULAR_OP);

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
              {/* Sprint 44b: ficha técnica como chips (marca/tipo/entalle/tela/hilo/hilo específico) */}
              <DetallesModelo registro={registro} />
            </div>
            <div>
              {puedeCambiarEstado && !inactiva ? (
                <button
                  onClick={() => setCambiarEstadoAbierto(true)}
                  className={`m-pill ${estadoPillClass(registro.estado)}`}
                  style={{
                    border: '1.5px dashed currentColor',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Tocá para cambiar el estado"
                >
                  {registro.estado || '—'}
                  <ChevronDown size={11} />
                </button>
              ) : (
                <span className={`m-pill ${estadoPillClass(registro.estado)}`}>{registro.estado || '—'}</span>
              )}
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
          puedeCerrar={puedeCerrarOP}
          puedeAnular={puedeAnularOP}
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

      {/* Bottom sheet: Cambiar estado del corte */}
      {cambiarEstadoAbierto && (
        <CambiarEstadoSheet
          registro={registro}
          user={user}
          onClose={() => setCambiarEstadoAbierto(false)}
          onDone={async (movIdParaAbrir) => {
            setCambiarEstadoAbierto(false);
            await fetchRegistro();
            // Sprint 44b: si se creó o falta completar un movimiento, llevar al detalle
            if (movIdParaAbrir) {
              navigate(`/m/registros/${registro.id}/movimientos/${movIdParaAbrir}`);
            }
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
const MenuOpcionesSheet = ({ registro, onClose, onCerrar, onAnular, inactiva, puedeCerrar, puedeAnular }) => {
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

      {!inactiva && (puedeCerrar || puedeAnular) && (
        <>
          <div className="m-label-xs" style={{ marginTop: 10, padding: '0 4px' }}>Acciones</div>
          {puedeCerrar && (
            <ActionRow
              icon={<Lock size={18} style={{ color: '#475569' }} />}
              label="Cerrar OP"
              sub="Marca como CERRADA y libera reservas"
              onClick={onCerrar}
            />
          )}
          {puedeAnular && (
            <ActionRow
              icon={<Ban size={18} style={{ color: '#b91c1c' }} />}
              label="Anular OP"
              sub="Marca como ANULADA · no reversible"
              onClick={onAnular}
              danger
            />
          )}
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
const SheetShell = ({ children, onClose }) => createPortal(
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
        padding: '12px 20px 24px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '90vh', overflowY: 'auto',
      }}
    >
      <div style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '0 auto 12px' }} />
      {children}
    </div>
  </div>,
  document.body
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

/* ═══════════════════════════════════════════════════════════════════════════
   CambiarEstadoSheet · 3 fases (select → confirm | error)
   ───────────────────────────────────────────────────────────────────────────
   1) Cargar estados disponibles + permisos + movimientos abiertos.
   2) Filtrar lo que puede asignar el usuario y marcar el "siguiente" lógico.
   3) Al elegir un estado:
        - si requiere etapa anterior cerrada y no lo está → fase "error"
        - si destino es "estado activo" (Corte/Costura/Atraque/Lavandería/Acabado)
          → fase "confirm" con detalle de movimiento que se va a crear
        - si destino es "Para X" o "Almacén PT/Tienda" → fase "confirm" sin movimiento
   4) Confirmar: PUT /registros/:id + opcional POST /movimientos-produccion.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Una etapa "activa" (que crea movimiento al entrar) es la que tiene `servicio_id`
 * asociado en la ruta del modelo. Las etapas de espera ("Para X") y los estados
 * finales ("Tienda", "Almacén PT" sin servicio) no tienen servicio_id y no crean
 * movimiento. Esta lógica viene de la configuración real de la ruta — no
 * hardcodeamos nombres.
 */
function etapaCreaMovimiento(etapa) {
  return !!etapa?.servicio_id;
}

const CambiarEstadoSheet = ({ registro, user, onClose, onDone }) => {
  // Fase interna: 'select' | 'confirm' | 'error'
  const [fase, setFase] = useState('select');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);          // { estados, etapas_completas, estado_actual, usa_ruta }
  const [movimientos, setMovimientos] = useState([]);
  const [destinoElegido, setDestinoElegido] = useState(null); // string del estado destino
  const [bloqueo, setBloqueo] = useState(null);    // { mensaje, movimientoAbierto }
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Permisos del usuario
  const esAdmin = user?.rol === 'admin';
  const estadosPermitidos = user?.permisos?._operativos?.estados_permitidos || [];

  // ─── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [estRes, movRes] = await Promise.all([
          axios.get(`${API}/registros/${registro.id}/estados-disponibles`),
          axios.get(`${API}/movimientos-produccion?registro_id=${registro.id}&limit=200`),
        ]);
        setData(estRes.data || null);
        const items = movRes.data?.items || movRes.data || [];
        setMovimientos(Array.isArray(items) ? items : []);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro.id]);

  // ─── Cálculos derivados ─────────────────────────────────────────────────
  const todosLosEstados = data?.estados || [];
  const etapasCompletas = data?.etapas_completas || [];
  const estadoActual = data?.estado_actual || registro.estado;

  // Sprint 44: datos nuevos del backend
  const siguientesDirectos = data?.siguientes_directos || [];
  const siguientesSalto    = data?.siguientes_salto    || [];
  const otrosAdelante      = data?.otros_adelante      || [];
  const otrosAtras         = data?.otros_atras         || [];
  const esFinal            = data?.es_final            || false;

  // Filtro por permisos (los nuevos endpoints devuelven etapas, no strings)
  const puedeUsar = (nombreEstado) => esAdmin || estadosPermitidos.includes(nombreEstado);

  const sigDirPermitidos = siguientesDirectos.filter(e => puedeUsar(e.nombre));
  const sigSaltoPermitidos = siguientesSalto.filter(e => puedeUsar(e.nombre));

  // Identificar siguiente lógico (mantenido por compatibilidad con código antiguo)
  const siguienteLogico = useMemo(() => {
    if (siguientesDirectos.length > 0) return siguientesDirectos[0].nombre;
    if (!todosLosEstados.length || !estadoActual) return null;
    const idx = todosLosEstados.indexOf(estadoActual);
    if (idx === -1 || idx >= todosLosEstados.length - 1) return null;
    return todosLosEstados[idx + 1];
  }, [siguientesDirectos, todosLosEstados, estadoActual]);

  // Estados que el usuario puede asignar (legacy, ya no se usa en la UI nueva pero
  // se conserva por si algún otro componente lo consume).
  const estadosVisibles = useMemo(() => {
    if (esAdmin) return todosLosEstados;
    return todosLosEstados.filter(e => estadosPermitidos.includes(e));
  }, [todosLosEstados, estadosPermitidos, esAdmin]);

  const estadosNoVisibles = useMemo(() => {
    return todosLosEstados.filter(e => !estadosVisibles.includes(e) && e !== estadoActual);
  }, [todosLosEstados, estadosVisibles, estadoActual]);

  // Etapa de la ruta correspondiente al estado destino
  const etapaDestino = useMemo(() => {
    if (!destinoElegido || !etapasCompletas.length) return null;
    return etapasCompletas.find(e => e.nombre === destinoElegido);
  }, [destinoElegido, etapasCompletas]);

  // ¿El destino es una etapa con servicio asociado? Si sí, crea movimiento.
  // Esto se basa en la ruta del modelo (no en nombres hardcoded).
  const destinoCreaMovimiento = etapaCreaMovimiento(etapaDestino);

  // Alias retro-compatible para no romper el resto del código:
  const destinoEsActivo = destinoCreaMovimiento;
  const servicioDestino = etapaDestino;

  // ─── Lógica al elegir un destino ────────────────────────────────────────
  const elegirDestino = (estado) => {
    setDestinoElegido(estado);
    setError('');
    // Validar: si hay etapa anterior con movimiento abierto, bloquear.
    const idxDestino = todosLosEstados.indexOf(estado);
    if (idxDestino > 0 && etapasCompletas.length) {
      // Recorremos las etapas anteriores en la ruta
      const idxEnEtapas = etapasCompletas.findIndex(e => e.nombre === estado);
      if (idxEnEtapas > 0) {
        for (let i = idxEnEtapas - 1; i >= 0; i--) {
          const et = etapasCompletas[i];
          const sid = et.servicio_id;
          if (!sid) continue;
          // ¿Hay movimientos de este servicio?
          const movs = movimientos.filter(m => m.servicio_id === sid);
          if (movs.length === 0) continue;
          // ¿Alguno está abierto (sin fecha_fin)?
          const abierto = movs.find(m => m.fecha_inicio && !m.fecha_fin);
          if (abierto) {
            setBloqueo({
              etapaAbierta: et.nombre,
              movimientoAbierto: abierto,
              destinoIntentado: estado,
            });
            setFase('error');
            return;
          }
        }
      }
    }
    // Sin bloqueo → pasar a confirmar
    setFase('confirm');
  };

  // ─── Confirmar el cambio ────────────────────────────────────────────────
  const confirmar = async () => {
    if (!destinoElegido) return;
    setError('');
    setEnviando(true);

    // Movimiento abierto del servicio destino (si existe)
    const movExistente = (destinoEsActivo && servicioDestino?.servicio_id)
      ? movimientos.find(m =>
          m.servicio_id === servicioDestino.servicio_id &&
          m.fecha_inicio && !m.fecha_fin
        )
      : null;

    try {
      // 1) Cambiar el estado del registro
      const payload = { ...registro, estado: destinoElegido };
      await axios.put(`${API}/registros/${registro.id}`, payload);

      // 2) Si destino activo Y no hay movimiento, crear uno nuevo y abrirlo
      let movIdParaAbrir = null;
      if (destinoEsActivo && servicioDestino?.servicio_id && !movExistente) {
        const totalPzs = Object.values(registro.tallas || {}).reduce(
          (s, n) => s + (Number(n) || 0), 0
        );
        const resp = await axios.post(`${API}/movimientos-produccion`, {
          registro_id: registro.id,
          servicio_id: servicioDestino.servicio_id,
          cantidad_enviada: totalPzs || 0,
          fecha_inicio: new Date().toISOString().slice(0, 10),
          observaciones: observacion || `Auto-creado al pasar a ${destinoElegido}`,
        });
        movIdParaAbrir = resp.data?.id || null;
      }

      // 3) Si el movimiento existe pero le falta data, también abrimos su detalle
      if (movExistente) {
        const faltaPersona = !movExistente.persona_id;
        const faltaFecha = !movExistente.fecha_inicio;
        if (faltaPersona || faltaFecha) {
          movIdParaAbrir = movExistente.id;
        }
      }

      onDone(movIdParaAbrir);
    } catch (e) {
      const det = e?.response?.data?.detail;
      setError(typeof det === 'string' ? det : 'No se pudo cambiar el estado');
    } finally {
      setEnviando(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SheetShell onClose={onClose}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Loader2 className="m-spin" size={28} style={{ color: '#94a3b8' }} />
        </div>
      </SheetShell>
    );
  }

  // ── FASE: SELECT (Sprint 44 · rediseño v2) ──────────────────────────────
  if (fase === 'select') {
    const noTieneOpciones = sigDirPermitidos.length === 0 && sigSaltoPermitidos.length === 0;
    const hayBifurcacion = sigDirPermitidos.length > 0 && sigSaltoPermitidos.length > 0;

    // Helper: subtítulo del botón según si es estado de espera o de proceso
    const subtituloBoton = (etapa) => {
      if (!etapa) return '';
      const creaMov = etapaCreaMovimiento(etapa);
      const nombre = etapa.nombre || '';
      // Estados de espera (típicamente "Para X") no crean movimiento
      if (!creaMov) return 'Queda en espera, sin movimiento';
      return `Crea movimiento de ${nombre} con fecha de hoy`;
    };

    const tituloPregunta = hayBifurcacion ? '¿Hacia dónde va?' : '¿Avanzar el corte?';

    return (
      <SheetShell onClose={onClose}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{tituloPregunta}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
          {registro.n_corte} · {registro.modelo_nombre || registro.modelo_manual?.nombre_modelo || '—'}
        </div>

        {/* Mini timeline de la ruta */}
        {etapasCompletas.length > 0 && (
          <RutaTimeline
            etapas={etapasCompletas}
            estadoActual={estadoActual}
            siguientes={[...sigDirPermitidos, ...sigSaltoPermitidos].map(e => e.nombre)}
          />
        )}

        {/* Texto contextual */}
        <div style={{
          background: '#f8fafc', borderRadius: 10, padding: '8px 10px',
          marginTop: 10, fontSize: 12, color: '#475569',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
            Actual
          </span>
          <span className={`m-pill ${estadoPillClass(estadoActual)}`} style={{ fontSize: 10 }}>
            {estadoActual || '—'}
          </span>
        </div>

        {/* Caso: ya está al final de la ruta */}
        {esFinal && (
          <div style={{
            marginTop: 14, padding: 14,
            background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10,
            color: '#14532d', fontSize: 13,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Check size={20} style={{ flexShrink: 0, marginTop: 1, color: '#15803d' }} />
            <div>
              <div style={{ fontWeight: 700 }}>Corte terminado</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>
                Llegó al final de la ruta. Solo admin puede modificar el estado.
              </div>
            </div>
          </div>
        )}

        {/* Caso: sin permisos para los siguientes (no admin y sin permiso al sgte) */}
        {!esFinal && noTieneOpciones && (
          <div style={{
            marginTop: 14, padding: 14,
            background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10,
            color: '#92400e', fontSize: 13,
          }}>
            Tu rol no puede asignar el siguiente estado. Pedile a un admin.
          </div>
        )}

        {/* Acción principal: botón gigante (1 directo) */}
        {!esFinal && sigDirPermitidos.length === 1 && !hayBifurcacion && (
          <button
            onClick={() => elegirDestino(sigDirPermitidos[0].nombre)}
            style={{
              width: '100%', marginTop: 14,
              background: 'var(--m-brand)', color: 'white',
              border: 0, borderRadius: 12, padding: 14,
              display: 'flex', alignItems: 'center', gap: 12,
              textAlign: 'left', cursor: 'pointer',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(255,255,255,.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ArrowRight size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {tituloAccionDirecta(sigDirPermitidos[0])}
              </div>
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                {subtituloBoton(sigDirPermitidos[0])}
              </div>
            </div>
            <ChevronRight size={18} style={{ opacity: 0.8 }} />
          </button>
        )}

        {/* Bifurcación: 2 botones lado a lado */}
        {!esFinal && hayBifurcacion && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            {sigDirPermitidos.map(etapa => (
              <button
                key={etapa.nombre}
                onClick={() => elegirDestino(etapa.nombre)}
                style={{
                  background: 'var(--m-brand)', color: 'white',
                  border: 0, borderRadius: 12, padding: 12,
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <ArrowRight size={14} />
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{etapa.nombre}</span>
                </div>
                <div style={{ fontSize: 10, opacity: 0.9, lineHeight: 1.3 }}>
                  Sigue la ruta normal
                </div>
              </button>
            ))}
            {sigSaltoPermitidos.map(etapa => (
              <button
                key={etapa.nombre}
                onClick={() => elegirDestino(etapa.nombre)}
                style={{
                  background: '#7c3aed', color: 'white',
                  border: 0, borderRadius: 12, padding: 12,
                  textAlign: 'left', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <SkipForward size={14} />
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{etapa.nombre}</span>
                </div>
                <div style={{ fontSize: 10, opacity: 0.9, lineHeight: 1.3 }}>
                  Saltea etapa opcional
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Otros estados (plegable) */}
        {(otrosAdelante.length > 0 || otrosAtras.length > 0) && (
          <OtrosEstadosPlegable
            otrosAdelante={otrosAdelante}
            otrosAtras={otrosAtras}
            esAdmin={esAdmin}
            puedeUsar={puedeUsar}
            onElegir={elegirDestino}
          />
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
  }

  // ── FASE: CONFIRM ────────────────────────────────────────────────────────
  if (fase === 'confirm') {
    const totalPzs = Object.values(registro.tallas || {}).reduce((s, n) => s + (Number(n) || 0), 0);

    // Sprint 44b: detectar si ya existe un movimiento abierto del servicio destino.
    // Si existe → no creamos otro, solo cambiamos el estado y avisamos.
    const movExistente = (destinoEsActivo && servicioDestino?.servicio_id)
      ? movimientos.find(m =>
          m.servicio_id === servicioDestino.servicio_id &&
          m.fecha_inicio && !m.fecha_fin
        )
      : null;

    const necesitaCompletarMov = movExistente && (
      !movExistente.fecha_inicio || !movExistente.persona_id
    );

    return (
      <SheetShell onClose={onClose}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
            margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={26} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Pasar a {destinoElegido}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
            {registro.n_corte}
          </div>
        </div>

        <div className="m-label-xs" style={{ marginBottom: 8 }}>Esto va a suceder</div>

        {/* Cambio de estado */}
        <div className="m-card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Check size={18} style={{ color: 'var(--m-brand)', marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>Estado cambia</div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className={`m-pill ${estadoPillClass(estadoActual)}`} style={{ fontSize: 9 }}>{estadoActual}</span>
                <ChevronRight size={11} style={{ color: '#94a3b8' }} />
                <span className={`m-pill ${estadoPillClass(destinoElegido)}`} style={{ fontSize: 9 }}>{destinoElegido}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Movimiento: tres casos posibles */}
        {destinoEsActivo && servicioDestino?.servicio_id && !movExistente && (
          // Caso 1: NO existe → se crea uno nuevo
          <div className="m-card" style={{
            background: 'var(--m-brand-soft)', borderColor: '#5eead4',
            padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Plus size={18} style={{ color: 'var(--m-brand)', marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--m-brand)' }}>
                  Se crea movimiento de {destinoElegido}
                </div>
                <div style={{ marginTop: 6, color: '#475569', lineHeight: 1.6 }}>
                  Servicio: <strong>{destinoElegido}</strong><br/>
                  Fecha inicio: <strong>hoy</strong><br/>
                  Cantidad enviada: <strong>{totalPzs || 0} prendas</strong>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: '#0f766e', fontStyle: 'italic' }}>
                  Después te llevamos a completar fecha y persona.
                </div>
              </div>
            </div>
          </div>
        )}

        {destinoEsActivo && movExistente && (
          // Caso 2 y 3: YA existe un movimiento abierto del servicio
          <div className="m-card" style={{
            background: necesitaCompletarMov ? '#fef3c7' : '#dcfce7',
            borderColor: necesitaCompletarMov ? '#fcd34d' : '#86efac',
            padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {necesitaCompletarMov
                ? <AlertCircle size={18} style={{ color: '#b45309', marginTop: 1, flexShrink: 0 }} />
                : <Check size={18} style={{ color: '#15803d', marginTop: 1, flexShrink: 0 }} />}
              <div style={{ flex: 1, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: necesitaCompletarMov ? '#92400e' : '#14532d' }}>
                  Ya existe un movimiento de {destinoElegido}
                </div>
                <div style={{ marginTop: 6, color: '#475569', lineHeight: 1.6 }}>
                  Fecha inicio: <strong>{movExistente.fecha_inicio || '— pendiente'}</strong><br/>
                  Persona: <strong>{movExistente.persona_nombre || movExistente.persona || '— pendiente'}</strong><br/>
                  Cantidad enviada: <strong>{movExistente.cantidad_enviada ?? '—'} prendas</strong>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: necesitaCompletarMov ? '#92400e' : '#15803d', fontWeight: 600 }}>
                  {necesitaCompletarMov
                    ? '⚠ Faltan datos. Solo cambiamos el estado y te llevamos a completar el movimiento.'
                    : '✓ Movimiento ya completo. Solo cambiamos el estado del corte.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Observación opcional */}
        <div style={{ marginTop: 10 }}>
          <div className="m-label-xs" style={{ marginBottom: 4 }}>
            Observación (opcional)
          </div>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej: arranco con todas las prendas"
            rows={2}
            style={{
              width: '100%', padding: 10, fontSize: 13,
              border: '1px solid #d1d5db', borderRadius: 10,
              fontFamily: 'inherit', resize: 'none',
            }}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
            borderRadius: 10, padding: 10, fontSize: 12, marginTop: 10,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            onClick={() => setFase('select')}
            className="m-btn m-btn-outline"
            style={{ flex: 1 }}
          >
            <X size={16} /> Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={enviando}
            className="m-btn m-btn-primary"
            style={{ flex: 1.5 }}
          >
            {enviando
              ? <><Loader2 className="m-spin" size={16} /> Aplicando…</>
              : <><Check size={16} /> Confirmar</>}
          </button>
        </div>
      </SheetShell>
    );
  }

  // ── FASE: ERROR (etapa anterior abierta) ────────────────────────────────
  if (fase === 'error' && bloqueo) {
    const mov = bloqueo.movimientoAbierto;
    const enviado = Number(mov?.cantidad_enviada || 0);
    const recibido = Number(mov?.cantidad_recibida || 0);
    const pendiente = Math.max(0, enviado - recibido);
    return (
      <SheetShell onClose={onClose}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#fee2e2', color: '#dc2626',
            margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={26} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            No se puede pasar a {bloqueo.destinoIntentado}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
            {registro.n_corte}
          </div>
        </div>

        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', color: '#7f1d1d',
          borderRadius: 12, padding: 12, fontSize: 12, marginBottom: 12,
        }}>
          <strong>El movimiento de {bloqueo.etapaAbierta} sigue abierto.</strong>
          <div style={{ marginTop: 6, lineHeight: 1.5, color: '#991b1b' }}>
            No podés pasar el corte a {bloqueo.destinoIntentado} sin antes cerrar el
            movimiento de {bloqueo.etapaAbierta}. Cerralo desde la lista de movimientos
            cuando termine.
          </div>
        </div>

        {/* Detalle del movimiento abierto */}
        <div className="m-label-xs" style={{ marginBottom: 6 }}>Movimiento pendiente</div>
        <div className="m-card" style={{ borderColor: '#fcd34d', padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {bloqueo.etapaAbierta} · {mov?.persona_nombre || '—'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                Inicio: {mov?.fecha_inicio || '—'}
              </div>
            </div>
            <span className="m-pill m-pill-blue" style={{ fontSize: 9 }}>en curso</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
            marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', textAlign: 'center',
          }}>
            <div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14 }}>{enviado}</div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>enviado</div>
            </div>
            <div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14, color: '#15803d' }}>{recibido}</div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>recibido</div>
            </div>
            <div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 14, color: '#b45309' }}>{pendiente}</div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>pendiente</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            onClose();
            navigateToMov(registro.id, mov.id);
          }}
          className="m-btn m-btn-primary"
          style={{ width: '100%' }}
        >
          <Check size={16} /> Ir a cerrar movimiento
        </button>
        <button
          onClick={() => setFase('select')}
          className="m-btn m-btn-outline"
          style={{ width: '100%', marginTop: 8 }}
        >
          Volver a estados
        </button>
      </SheetShell>
    );
  }

  return null;
};

/**
 * Helper para navegar al detalle del movimiento abierto (usado desde la fase error).
 * Lo definimos como function suelta para evitar dependencia circular con useNavigate.
 */
function navigateToMov(registroId, movId) {
  window.location.href = `/m/registros/${registroId}/movimientos/${movId}`;
}

/* ──────── Sprint 44 · sub-componentes del CambiarEstadoSheet ──────── */

/**
 * Agrupa etapas consecutivas del mismo servicio (típicamente "Para X" + "X")
 * en un solo "paso" del timeline. Etapas sin servicio_id quedan como pasos
 * independientes (ej. Tienda, Almacén PT).
 *
 * Para cada grupo identifica si el estado actual cae dentro y en qué sub-fase:
 *   - 'espera': estado tipo "Para X" (avance 0%, sin movimiento iniciado)
 *   - 'proceso': estado tipo "X" (movimiento iniciado)
 */
function agruparEtapasPorServicio(etapas) {
  const grupos = [];
  let cur = null;
  for (const e of etapas) {
    const sid = e.servicio_id || null;
    if (sid && cur && cur.servicio_id === sid) {
      cur.etapas.push(e);
    } else {
      cur = { servicio_id: sid, etapas: [e] };
      grupos.push(cur);
    }
  }
  // Nombre corto del grupo (el del estado "de proceso", o el primero si no existe)
  for (const g of grupos) {
    const proc = g.etapas.find(x => !/^para\s+/i.test(x.nombre || ''));
    g.nombreCorto = (proc?.nombre) || g.etapas[0]?.nombre || '—';
    g.obligatorio = !g.etapas.some(x => x.obligatorio === false);
  }
  return grupos;
}

/**
 * Mini timeline horizontal de la ruta · v2 agrupado por servicio.
 * Cada dot representa un servicio (no un estado), reduciendo de ~15 puntos
 * a ~8 cuando la ruta tiene espera+proceso por servicio.
 */
const RutaTimeline = ({ etapas, estadoActual, siguientes = [] }) => {
  const grupos = useMemo(() => agruparEtapasPorServicio(etapas), [etapas]);

  // ¿En qué grupo cae el actual y en qué sub-fase?
  let idxActual = -1;
  let fase = null;     // 'espera' | 'proceso' | null
  grupos.forEach((g, gi) => {
    const idxDentro = g.etapas.findIndex(e => e.nombre === estadoActual);
    if (idxDentro >= 0) {
      idxActual = gi;
      const e = g.etapas[idxDentro];
      fase = /^para\s+/i.test(e.nombre || '') ? 'espera' : 'proceso';
    }
  });

  const nombresSgte = new Set(siguientes || []);

  return (
    <div style={{
      marginTop: 12,
      background: '#f8fafc', borderRadius: 10, padding: '10px 8px',
    }}>
      <div style={{
        fontSize: 9, color: '#64748b', textTransform: 'uppercase',
        fontWeight: 700, letterSpacing: '.04em', marginBottom: 8, paddingLeft: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Ruta del modelo</span>
        {fase && (
          <span style={{
            textTransform: 'none', fontSize: 9, color: fase === 'proceso' ? '#0f766e' : '#b45309',
            background: fase === 'proceso' ? '#ccfbf1' : '#fef3c7',
            padding: '1px 6px', borderRadius: 999, fontWeight: 700, letterSpacing: 0,
          }}>
            {fase === 'proceso' ? 'En proceso' : 'En espera'}
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', position: 'relative',
        overflowX: 'auto', paddingBottom: 4,
        scrollbarWidth: 'none',
      }}>
        {grupos.map((g, i) => {
          const esActual = i === idxActual;
          const esPasado = idxActual >= 0 && i < idxActual;
          const tieneSgte = g.etapas.some(e => nombresSgte.has(e.nombre));
          const esOpcional = g.obligatorio === false;
          const noUltimo = i < grupos.length - 1;

          let dotBg = 'white', dotBorder = '#cbd5e1', dotShadow = 'none', labelColor = '#64748b', labelWeight = 600;
          let lineColor = esPasado ? '#15803d' : '#e5e7eb';
          if (esPasado) { dotBg = '#15803d'; dotBorder = '#15803d'; labelColor = '#15803d'; labelWeight = 700; }
          if (esActual) {
            dotBg = '#0f766e'; dotBorder = '#0f766e';
            dotShadow = '0 0 0 4px rgba(15,118,110,.18)';
            labelColor = '#0f766e'; labelWeight = 800;
          }
          if (tieneSgte && !esActual && !esPasado) {
            dotBorder = '#0f766e';
            labelColor = '#0f766e'; labelWeight = 700;
          }
          if (esOpcional && !esPasado && !esActual && !tieneSgte) {
            dotBg = '#fef3c7'; dotBorder = '#fde68a'; labelColor = '#92400e';
          }

          return (
            <div key={(g.servicio_id || g.nombreCorto) + i} style={{
              minWidth: 64, display: 'flex', flexDirection: 'column',
              alignItems: 'center', position: 'relative', flexShrink: 0,
            }}>
              {noUltimo && (
                <div style={{
                  position: 'absolute', top: 11, left: '50%', right: '-50%',
                  height: 2, background: lineColor, zIndex: 0,
                }} />
              )}
              <div style={{
                position: 'relative', zIndex: 1,
                width: 22, height: 22, borderRadius: '50%',
                background: dotBg, border: `2px solid ${dotBorder}`,
                boxShadow: dotShadow,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white',
              }}>
                {esPasado && <Check size={12} />}
              </div>
              <div style={{
                fontSize: 10, color: labelColor, fontWeight: labelWeight,
                marginTop: 4, textAlign: 'center', lineHeight: 1.2,
                padding: '0 2px', maxWidth: 70,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={g.nombreCorto}>
                {g.nombreCorto}
              </div>
              {esOpcional && !esPasado && (
                <div style={{ fontSize: 8, color: '#92400e', marginTop: 1 }}>opcional</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Sección "Otros estados" plegable. Estados separados en hacia adelante /
 * hacia atrás. Solo aparecen si hay al menos uno. Los que el rol no puede
 * usar se ven deshabilitados.
 */
const OtrosEstadosPlegable = ({ otrosAdelante, otrosAtras, esAdmin, puedeUsar, onElegir }) => {
  const [open, setOpen] = useState(false);
  const count = otrosAdelante.length + otrosAtras.length;
  if (count === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'transparent', border: 0,
          padding: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontSize: 11, color: '#64748b', fontWeight: 600,
        }}
      >
        Otros estados ({count}) {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div style={{ marginTop: 4 }}>
          {!esAdmin && (
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
              padding: 8, fontSize: 11, color: '#92400e',
              display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8,
            }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Tu rol puede ver estos estados pero quizás no asignarlos. Los que no podés tocar se ven en gris.</span>
            </div>
          )}

          {otrosAdelante.length > 0 && (
            <>
              <div className="m-label-xs" style={{ marginBottom: 6 }}>Hacia adelante</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {otrosAdelante.map(e => (
                  <EstadoChipBtn
                    key={'a-' + e.nombre}
                    etapa={e}
                    habilitado={puedeUsar(e.nombre)}
                    onClick={() => onElegir(e.nombre)}
                    tag="Salta"
                    tagBg="#fef3c7"
                    tagFg="#b45309"
                  />
                ))}
              </div>
            </>
          )}

          {otrosAtras.length > 0 && (
            <>
              <div className="m-label-xs" style={{ marginBottom: 6 }}>Hacia atrás (re-trabajo)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {otrosAtras.map(e => (
                  <EstadoChipBtn
                    key={'b-' + e.nombre}
                    etapa={e}
                    habilitado={puedeUsar(e.nombre)}
                    onClick={() => onElegir(e.nombre)}
                    tag="Atrás"
                    tagBg="#fee2e2"
                    tagFg="#b91c1c"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const EstadoChipBtn = ({ etapa, habilitado, onClick, tag, tagBg, tagFg }) => (
  <button
    onClick={habilitado ? onClick : undefined}
    disabled={!habilitado}
    style={{
      background: 'white', border: '1px solid #e5e7eb',
      borderRadius: 8, padding: '8px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: habilitado ? 'pointer' : 'not-allowed',
      opacity: habilitado ? 1 : 0.5,
      textAlign: 'left',
    }}
  >
    <span style={{ fontSize: 12, fontWeight: 600 }}>{etapa.nombre}</span>
    <span style={{
      padding: '2px 6px', borderRadius: 999,
      background: tagBg, color: tagFg,
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    }}>
      {tag}
    </span>
  </button>
);

/**
 * Sprint 44b: chips compactos con la ficha técnica del modelo del corte.
 * Marca y Tipo son siempre visibles (aunque estén vacíos, salen con "—" en gris)
 * para que el usuario sepa que ese dato falta en el modelo.
 * El resto (Entalle, Tela, Hilo, Hilo específico) se muestra solo si tiene valor.
 */
const DetallesModelo = ({ registro }) => {
  const mm = registro?.modelo_manual || {};

  // Marca y Tipo: siempre visibles
  const marca = registro.marca_nombre || mm.marca_texto || null;
  const tipo  = registro.tipo_nombre  || mm.tipo_texto  || null;

  // El resto: solo si tienen valor
  const opcionales = [
    { label: 'Entalle',   value: registro.entalle_nombre || mm.entalle_texto },
    { label: 'Tela',      value: registro.tela_nombre    || mm.tela_texto },
    { label: 'Hilo',      value: registro.hilo_nombre    || mm.hilo_texto },
    { label: 'Hilo esp.', value: registro.hilo_especifico_nombre || mm.hilo_especifico_texto },
  ].filter(it => it.value);

  const renderChip = (label, value, missing = false) => (
    <span
      key={label}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 4,
        padding: '3px 8px', borderRadius: 999,
        background: missing ? '#f8fafc' : '#f1f5f9',
        border: `1px solid ${missing ? '#f1f5f9' : '#e2e8f0'}`,
        fontSize: 11, color: missing ? '#94a3b8' : '#0f172a',
        ...(missing ? { borderStyle: 'dashed' } : {}),
      }}
    >
      <span style={{
        fontSize: 9, color: missing ? '#cbd5e1' : '#64748b',
        textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em',
      }}>
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>
        {value || '—'}
      </span>
    </span>
  );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {renderChip('Marca', marca, !marca)}
      {renderChip('Tipo',  tipo,  !tipo)}
      {opcionales.map(it => renderChip(it.label, it.value))}
    </div>
  );
};

/**
 * Devuelve el título de la acción según si el estado destino es "espera"
 * (tipo "Para X") o "proceso" ("X"). Para X → "Marcar listo para X". Para
 * proceso → "Empezar X".
 */
function tituloAccionDirecta(etapa) {
  if (!etapa) return '';
  const nombre = etapa.nombre || '';
  const creaMov = etapaCreaMovimiento(etapa);
  if (creaMov) return `Empezar ${nombre}`;
  // Estado de espera (tipo "Para X")
  return `Pasar a ${nombre}`;
}

export default MobileRegistroDetalle;
