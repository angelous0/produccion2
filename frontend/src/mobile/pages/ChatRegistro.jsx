import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Send, MessageSquare, Pin, PinOff,
  AlertTriangle, Clock, CheckCircle2, Reply, Trash2,
  Loader2, X, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Chat / conversación por registro.
 * Backend:
 *   GET    /api/registros/:id/conversacion
 *   POST   /api/registros/:id/conversacion   { autor, mensaje, mensaje_padre_id?, estado? }
 *   PATCH  /api/conversacion/:msgId          { estado?, fijado? }
 *   DELETE /api/conversacion/:msgId
 *
 * Estados: normal | importante | pendiente | resuelto
 */
const ESTADO_CFG = {
  normal:     { label: 'Normal',     border: '#e5e7eb', bg: 'white',    pill: null,                                  Icon: null },
  importante: { label: 'Importante', border: '#fca5a5', bg: '#fef2f2',  pill: { bg: '#fee2e2', fg: '#b91c1c' },      Icon: AlertTriangle },
  pendiente:  { label: 'Pendiente',  border: '#fcd34d', bg: '#fffbeb',  pill: { bg: '#fef3c7', fg: '#92400e' },      Icon: Clock },
  resuelto:   { label: 'Resuelto',   border: '#86efac', bg: '#f0fdf4',  pill: { bg: '#dcfce7', fg: '#15803d' },      Icon: CheckCircle2 },
};

export const MobileChatRegistro = () => {
  const { id: registroId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const autor = user?.nombre_completo || user?.username || 'Operario';

  const [registro, setRegistro] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [texto, setTexto] = useState('');
  const [estadoNuevo, setEstadoNuevo] = useState('normal');
  const [respondiendoA, setRespondiendoA] = useState(null); // mensaje raíz
  const [accionesDe, setAccionesDe] = useState(null);       // mensaje cuyo sheet está abierto

  const listRef = useRef(null);
  const textareaRef = useRef(null);

  const cargarRegistro = async () => {
    try {
      const res = await axios.get(`${API}/registros/${registroId}`);
      setRegistro(res.data);
    } catch { /* silent */ }
  };

  const cargarMensajes = async () => {
    try {
      const res = await axios.get(`${API}/registros/${registroId}/conversacion`);
      setMensajes(res.data || []);
    } catch {
      setMensajes([]);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([cargarRegistro(), cargarMensajes()]);
      setLoading(false);
    })();
  }, [registroId]);

  // Scroll al final cuando llegan nuevos mensajes
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [mensajes.length, loading]);

  const { raices, fijados, noFijados, repliesPor } = useMemo(() => {
    const raices = mensajes.filter(m => !m.mensaje_padre_id);
    const repliesPor = {};
    mensajes.filter(m => m.mensaje_padre_id).forEach(m => {
      if (!repliesPor[m.mensaje_padre_id]) repliesPor[m.mensaje_padre_id] = [];
      repliesPor[m.mensaje_padre_id].push(m);
    });
    const fijados = raices.filter(m => m.fijado);
    const noFijados = raices.filter(m => !m.fijado);
    return { raices, fijados, noFijados, repliesPor };
  }, [mensajes]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const body = {
        autor,
        mensaje: texto.trim(),
        estado: respondiendoA ? 'normal' : estadoNuevo,
      };
      if (respondiendoA) body.mensaje_padre_id = respondiendoA.id;
      await axios.post(`${API}/registros/${registroId}/conversacion`, body);
      setTexto('');
      if (!respondiendoA) setEstadoNuevo('normal');
      setRespondiendoA(null);
      await cargarMensajes();
    } catch {
      // silent
    } finally {
      setEnviando(false);
    }
  };

  const actualizarMensaje = async (id, data) => {
    try {
      await axios.patch(`${API}/conversacion/${id}`, data);
      await cargarMensajes();
    } catch { /* silent */ }
  };

  const eliminarMensaje = async (id) => {
    if (!window.confirm('¿Eliminar este mensaje?')) return;
    try {
      await axios.delete(`${API}/conversacion/${id}`);
      await cargarMensajes();
    } catch { /* silent */ }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <Loader2 className="m-spin" size={32} style={{ margin: '0 auto' }} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 0px)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="m-header" style={{ flexShrink: 0 }}>
        <button className="m-h-icon" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: 15, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.modelo_nombre || registro?.modelo_manual?.nombre_modelo || 'Chat'}
          </div>
          <div style={{
            fontSize: 11, opacity: 0.85, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {registro?.n_corte} · Chat · {mensajes.length} mensaje{mensajes.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Lista de mensajes */}
      <div
        ref={listRef}
        style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 12px 8px',
          background: '#f8fafc',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {raices.length === 0 && (
          <div style={{
            margin: 'auto', textAlign: 'center', color: '#94a3b8',
            padding: '40px 20px',
          }}>
            <MessageSquare size={36} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontSize: 13 }}>
              Aún no hay mensajes en este corte.<br/>
              Escribe el primero abajo.
            </p>
          </div>
        )}

        {fijados.length > 0 && (
          <>
            <div className="m-label-xs" style={{ color: '#1d4ed8', marginTop: 4 }}>
              📌 Fijados
            </div>
            {fijados.map(m => (
              <MensajeBurbuja
                key={m.id}
                msg={m}
                replies={repliesPor[m.id] || []}
                autor={autor}
                onActions={() => setAccionesDe(m)}
                onReplyAction={(r) => setAccionesDe(r)}
              />
            ))}
            <div style={{
              height: 1, background: '#e2e8f0',
              margin: '4px 0 6px', borderTop: '1px dashed #cbd5e1',
            }} />
          </>
        )}

        {noFijados.map(m => (
          <MensajeBurbuja
            key={m.id}
            msg={m}
            replies={repliesPor[m.id] || []}
            autor={autor}
            onActions={() => setAccionesDe(m)}
            onReplyAction={(r) => setAccionesDe(r)}
          />
        ))}
      </div>

      {/* Banner "Respondiendo a..." */}
      {respondiendoA && (
        <div style={{
          flexShrink: 0,
          padding: '8px 14px',
          background: '#e0f2fe', borderTop: '1px solid #7dd3fc',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#075985',
        }}>
          <Reply size={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>Respondiendo a {respondiendoA.autor}</div>
            <div style={{
              opacity: 0.85, fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {respondiendoA.mensaje}
            </div>
          </div>
          <button
            onClick={() => setRespondiendoA(null)}
            style={{
              background: 'transparent', border: 0, color: '#075985',
              cursor: 'pointer', padding: 4,
            }}
            aria-label="Cancelar respuesta"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Chips de estado (solo para mensaje raíz) */}
      {!respondiendoA && (
        <div style={{
          flexShrink: 0,
          padding: '8px 12px 0',
          background: 'white',
          display: 'flex', gap: 6, overflowX: 'auto',
        }}>
          {Object.keys(ESTADO_CFG).map(est => {
            const c = ESTADO_CFG[est];
            const Icon = c.Icon;
            const activo = estadoNuevo === est;
            return (
              <button
                key={est}
                onClick={() => setEstadoNuevo(est)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 999, fontSize: 11,
                  fontWeight: 700, whiteSpace: 'nowrap',
                  border: `1px solid ${activo ? (c.pill?.fg || '#0f766e') : '#e5e7eb'}`,
                  background: activo ? (c.pill?.bg || 'var(--m-brand-soft)') : 'white',
                  color: activo ? (c.pill?.fg || 'var(--m-brand)') : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {Icon && <Icon size={11} />}
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div style={{
        flexShrink: 0,
        padding: '8px 12px 12px',
        background: 'white', borderTop: '1px solid #e5e7eb',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder={respondiendoA ? 'Escribe tu respuesta...' : 'Escribe un mensaje...'}
          rows={1}
          style={{
            flex: 1, resize: 'none', minHeight: 40, maxHeight: 120,
            padding: '10px 12px', borderRadius: 12,
            border: '1px solid #d1d5db', fontSize: 14, lineHeight: 1.4,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 12,
            background: !texto.trim() || enviando ? '#cbd5e1' : 'var(--m-brand)',
            color: 'white', border: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: !texto.trim() || enviando ? 'not-allowed' : 'pointer',
          }}
          aria-label="Enviar"
        >
          {enviando ? <Loader2 className="m-spin" size={18} /> : <Send size={18} />}
        </button>
      </div>

      {/* Bottom sheet de acciones */}
      {accionesDe && (
        <AccionesSheet
          msg={accionesDe}
          esReply={!!accionesDe.mensaje_padre_id}
          onClose={() => setAccionesDe(null)}
          onResponder={() => {
            setRespondiendoA(accionesDe);
            setAccionesDe(null);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          onCambiarEstado={async (estado) => {
            await actualizarMensaje(accionesDe.id, { estado });
            setAccionesDe(null);
          }}
          onToggleFijar={async () => {
            await actualizarMensaje(accionesDe.id, { fijado: !accionesDe.fijado });
            setAccionesDe(null);
          }}
          onEliminar={async () => {
            await eliminarMensaje(accionesDe.id);
            setAccionesDe(null);
          }}
        />
      )}
    </div>
  );
};

/* ──────── Burbuja de mensaje + replies ──────── */
const MensajeBurbuja = ({ msg, replies, autor, onActions, onReplyAction }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <BurbujaCard msg={msg} esPropio={msg.autor === autor} onActions={onActions} />
      {replies.length > 0 && (
        <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {replies.map(r => (
            <BurbujaCard
              key={r.id}
              msg={r}
              esPropio={r.autor === autor}
              onActions={() => onReplyAction(r)}
              esReply
            />
          ))}
        </div>
      )}
    </div>
  );
};

const BurbujaCard = ({ msg, esPropio, onActions, esReply = false }) => {
  const cfg = ESTADO_CFG[msg.estado] || ESTADO_CFG.normal;
  const Icon = cfg.pill?.fg ? cfg.Icon : null;

  return (
    <div
      onClick={onActions}
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 12,
        padding: esReply ? '8px 10px' : '10px 12px',
        cursor: 'pointer',
        borderStyle: esReply ? 'dashed' : 'solid',
        position: 'relative',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'wrap', marginBottom: 2,
      }}>
        {esReply && <Reply size={11} style={{ color: '#94a3b8' }} />}
        {msg.fijado && <Pin size={11} style={{ color: '#1d4ed8' }} />}
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: esPropio ? 'var(--m-brand)' : '#0f172a',
        }}>
          {msg.autor}
          {esPropio && <span style={{ color: '#94a3b8', fontWeight: 400 }}> · tú</span>}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          {timeAgo(msg.created_at)}
        </span>
        {cfg.pill && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontWeight: 700, letterSpacing: '.02em',
            padding: '2px 6px', borderRadius: 999,
            background: cfg.pill.bg, color: cfg.pill.fg,
            textTransform: 'uppercase',
          }}>
            {Icon && <Icon size={9} />}
            {cfg.label}
          </span>
        )}
        <MoreHorizontal size={14} style={{
          marginLeft: 'auto', color: '#cbd5e1', flexShrink: 0,
        }} />
      </div>
      <p style={{
        margin: 0, fontSize: 13, lineHeight: 1.45,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.mensaje}
      </p>
    </div>
  );
};

/* ──────── Bottom sheet de acciones ──────── */
const AccionesSheet = ({
  msg, esReply, onClose,
  onResponder, onCambiarEstado, onToggleFijar, onEliminar,
}) => {
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
          padding: '12px 16px 24px',
        }}
      >
        <div style={{
          width: 40, height: 4, background: '#cbd5e1',
          borderRadius: 2, margin: '0 auto 12px',
        }} />
        <div style={{
          fontSize: 11, color: '#64748b',
          padding: '4px 8px 10px', borderBottom: '1px solid #f1f5f9',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <strong style={{ color: '#0f172a' }}>{msg.autor}:</strong>{' '}{msg.mensaje}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
          {!esReply && (
            <ActionRow
              icon={<Reply size={18} />}
              label="Responder"
              onClick={onResponder}
            />
          )}

          {!esReply && (
            <>
              <div className="m-label-xs" style={{ marginTop: 10, padding: '0 8px' }}>Cambiar estado</div>
              <ActionRow
                icon={<MessageSquare size={18} style={{ color: '#64748b' }} />}
                label="Normal"
                disabled={msg.estado === 'normal'}
                onClick={() => onCambiarEstado('normal')}
              />
              <ActionRow
                icon={<AlertTriangle size={18} style={{ color: '#b91c1c' }} />}
                label="Marcar como importante"
                disabled={msg.estado === 'importante'}
                onClick={() => onCambiarEstado('importante')}
              />
              <ActionRow
                icon={<Clock size={18} style={{ color: '#b45309' }} />}
                label="Marcar como pendiente"
                disabled={msg.estado === 'pendiente'}
                onClick={() => onCambiarEstado('pendiente')}
              />
              <ActionRow
                icon={<CheckCircle2 size={18} style={{ color: '#15803d' }} />}
                label="Marcar como resuelto"
                disabled={msg.estado === 'resuelto'}
                onClick={() => onCambiarEstado('resuelto')}
              />

              <div className="m-label-xs" style={{ marginTop: 10, padding: '0 8px' }}>Otras</div>
              <ActionRow
                icon={msg.fijado
                  ? <PinOff size={18} style={{ color: '#64748b' }} />
                  : <Pin size={18} style={{ color: '#1d4ed8' }} />}
                label={msg.fijado ? 'Desfijar mensaje' : 'Fijar mensaje'}
                onClick={onToggleFijar}
              />
            </>
          )}

          <ActionRow
            icon={<Trash2 size={18} style={{ color: '#b91c1c' }} />}
            label="Eliminar"
            danger
            onClick={onEliminar}
          />
        </div>

        <button
          onClick={onClose}
          className="m-btn m-btn-outline"
          style={{ width: '100%', marginTop: 14, borderColor: '#cbd5e1', color: '#64748b' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};

const ActionRow = ({ icon, label, onClick, disabled = false, danger = false }) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: 12,
      width: '100%', padding: '12px 8px',
      background: 'transparent', border: 0, borderBottom: '1px solid #f8fafc',
      fontSize: 14, fontWeight: 500, textAlign: 'left',
      color: disabled ? '#cbd5e1' : (danger ? '#b91c1c' : '#0f172a'),
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    {icon}
    {label}
  </button>
);

/* ──────── Helpers ──────── */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

export default MobileChatRegistro;
