import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  MessageSquare, Reply, Send, Trash2, X,
  Pin, PinOff, AlertTriangle, Clock, CheckCircle2, MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_CONFIG = {
  normal:     { label: 'Normal',     border: 'border-border',       bg: '',               badge: null,                          icon: null },
  importante: { label: 'Importante', border: 'border-red-400',      bg: 'bg-red-50/60',   badge: 'bg-red-100 text-red-700',     icon: AlertTriangle },
  pendiente:  { label: 'Pendiente',  border: 'border-amber-400',    bg: 'bg-amber-50/60', badge: 'bg-amber-100 text-amber-700',  icon: Clock },
  resuelto:   { label: 'Resuelto',   border: 'border-green-400',    bg: 'bg-green-50/40', badge: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
};

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFecha(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// ─── Boton flotante fijo arriba derecha ───
export const ConversacionTrigger = ({ registroId, onClick }) => {
  const [stats, setStats] = useState({ total: 0, importantes: 0, pendientes: 0, fijados: 0 });

  useEffect(() => {
    if (!registroId) return;
    axios.get(`${API}/registros/${registroId}/conversacion`).then(res => {
      const msgs = res.data;
      setStats({
        total: msgs.length,
        importantes: msgs.filter(m => m.estado === 'importante').length,
        pendientes: msgs.filter(m => m.estado === 'pendiente').length,
        fijados: msgs.filter(m => m.fijado).length,
      });
    }).catch(() => {});
  }, [registroId]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed top-[70px] right-5 z-30 flex items-center gap-2 bg-background border shadow-lg rounded-full pl-3 pr-3.5 py-2 hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
      data-testid="btn-abrir-conversacion"
    >
      <MessageSquare className="h-4 w-4" />
      <span className="text-xs font-medium hidden sm:inline">Conversacion</span>
      {stats.total > 0 && (
        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{stats.total}</span>
      )}
      {stats.importantes > 0 && (
        <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" />{stats.importantes}
        </span>
      )}
      {stats.pendientes > 0 && (
        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />{stats.pendientes}
        </span>
      )}
      {stats.fijados > 0 && (
        <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <Pin className="h-2.5 w-2.5" />{stats.fijados}
        </span>
      )}
    </button>
  );
};


// ─── Panel lateral derecho ───
export const ConversacionPanel = ({ registroId, usuario, open, onClose, onMensajeChange }) => {
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('normal');
  const [respondiendo, setRespondiendo] = useState(null);
  const [respuestaTexto, setRespuestaTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  const fetchMensajes = async () => {
    try {
      const res = await axios.get(`${API}/registros/${registroId}/conversacion`);
      setMensajes(res.data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (registroId && open) fetchMensajes();
  }, [registroId, open]);

  const enviarMensaje = async (texto, padreId = null) => {
    if (!texto.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${API}/registros/${registroId}/conversacion`, {
        autor: usuario || 'Sistema',
        mensaje: texto.trim(),
        mensaje_padre_id: padreId,
        estado: padreId ? 'normal' : nuevoEstado,
      });
      await fetchMensajes();
      if (padreId) { setRespondiendo(null); setRespuestaTexto(''); }
      else { setNuevoMensaje(''); setNuevoEstado('normal'); }
      onMensajeChange?.();
      // Scroll al final
      setTimeout(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, 100);
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al enviar mensaje');
    } finally { setLoading(false); }
  };

  const actualizarMensaje = async (msgId, data) => {
    try { await axios.patch(`${API}/conversacion/${msgId}`, data); await fetchMensajes(); onMensajeChange?.(); }
    catch { toast.error('Error al actualizar'); }
  };

  const eliminarMensaje = async (msgId) => {
    try { await axios.delete(`${API}/conversacion/${msgId}`); await fetchMensajes(); toast.success('Eliminado'); }
    catch { toast.error('Error al eliminar'); }
  };

  const raices = mensajes.filter(m => !m.mensaje_padre_id);
  const respuestasPor = {};
  mensajes.filter(m => m.mensaje_padre_id).forEach(m => {
    if (!respuestasPor[m.mensaje_padre_id]) respuestasPor[m.mensaje_padre_id] = [];
    respuestasPor[m.mensaje_padre_id].push(m);
  });
  const fijados = raices.filter(m => m.fijado);
  const noFijados = raices.filter(m => !m.fijado);

  const renderMensaje = (msg, esRespuesta = false) => {
    const cfg = ESTADO_CONFIG[msg.estado] || ESTADO_CONFIG.normal;
    const EstadoIcon = cfg.icon;
    return (
      <div
        key={msg.id}
        className={`group rounded-lg border ${cfg.border} ${cfg.bg} ${esRespuesta ? 'p-2' : 'p-2.5'} transition-colors ${esRespuesta ? 'border-dashed' : ''}`}
        data-testid={esRespuesta ? `reply-${msg.id}` : `msg-${msg.id}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              {esRespuesta && <Reply className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
              {msg.fijado && <Pin className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
              <span className="text-xs font-semibold">{msg.autor}</span>
              <span className="text-[10px] text-muted-foreground" title={formatFecha(msg.created_at)}>
                {timeAgo(msg.created_at)}
              </span>
              {cfg.badge && (
                <span className={`text-[9px] font-medium px-1 py-0.5 rounded-full ${cfg.badge} flex items-center gap-0.5`}>
                  {EstadoIcon && <EstadoIcon className="h-2 w-2" />}
                  {cfg.label}
                </span>
              )}
            </div>
            <p className={`text-xs whitespace-pre-wrap break-words leading-relaxed ${esRespuesta ? 'ml-4' : ''}`}>{msg.mensaje}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`msg-actions-${msg.id}`}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              {!esRespuesta && (
                <DropdownMenuItem className="text-xs" onClick={() => { setRespondiendo(respondiendo === msg.id ? null : msg.id); setRespuestaTexto(''); }}>
                  <Reply className="h-3 w-3 mr-1.5" /> Responder
                </DropdownMenuItem>
              )}
              {!esRespuesta && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs" onClick={() => actualizarMensaje(msg.id, { estado: 'importante' })} disabled={msg.estado === 'importante'}>
                    <AlertTriangle className="h-3 w-3 mr-1.5 text-red-500" /> Importante
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => actualizarMensaje(msg.id, { estado: 'pendiente' })} disabled={msg.estado === 'pendiente'}>
                    <Clock className="h-3 w-3 mr-1.5 text-amber-500" /> Pendiente
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onClick={() => actualizarMensaje(msg.id, { estado: 'resuelto' })} disabled={msg.estado === 'resuelto'}>
                    <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-500" /> Resuelto
                  </DropdownMenuItem>
                  {msg.estado !== 'normal' && (
                    <DropdownMenuItem className="text-xs" onClick={() => actualizarMensaje(msg.id, { estado: 'normal' })}>
                      <MessageSquare className="h-3 w-3 mr-1.5" /> Normal
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs" onClick={() => actualizarMensaje(msg.id, { fijado: !msg.fijado })}>
                    {msg.fijado ? <><PinOff className="h-3 w-3 mr-1.5" /> Desfijar</> : <><Pin className="h-3 w-3 mr-1.5" /> Fijar</>}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-destructive focus:text-destructive" onClick={() => eliminarMensaje(msg.id)}>
                <Trash2 className="h-3 w-3 mr-1.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  function renderReplyInput(parentId) {
    return (
      <div className="ml-5 flex gap-1.5 mt-1" data-testid={`reply-input-${parentId}`}>
        <Textarea
          value={respuestaTexto}
          onChange={(e) => setRespuestaTexto(e.target.value)}
          placeholder="Responder..."
          rows={1}
          className="text-xs resize-none min-h-[32px]"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); enviarMensaje(respuestaTexto, parentId); }
            if (e.key === 'Escape') setRespondiendo(null);
          }}
        />
        <Button type="button" size="icon" className="shrink-0 h-8 w-8" disabled={!respuestaTexto.trim() || loading} onClick={() => enviarMensaje(respuestaTexto, parentId)} data-testid={`btn-send-reply-${parentId}`}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Overlay para movil */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Panel lateral */}
      <div
        className={`fixed top-0 right-0 h-full z-50 bg-background border-l shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: 'min(400px, 90vw)' }}
        data-testid="conversacion-panel"
        onSubmit={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="font-semibold text-sm">Conversacion</span>
            {mensajes.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{mensajes.length}</span>
            )}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="btn-cerrar-conversacion">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Lista de mensajes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5" ref={listRef}>
          {raices.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Sin mensajes. Inicia la conversacion.</p>
          )}

          {fijados.length > 0 && (
            <div className="space-y-1.5 pb-2 mb-2 border-b border-dashed">
              {fijados.map(msg => (
                <div key={msg.id} className="space-y-1">
                  {renderMensaje(msg)}
                  {respuestasPor[msg.id]?.map(r => <div key={r.id} className="ml-5">{renderMensaje(r, true)}</div>)}
                  {respondiendo === msg.id && renderReplyInput(msg.id)}
                </div>
              ))}
            </div>
          )}

          {noFijados.map(msg => (
            <div key={msg.id} className="space-y-1">
              {renderMensaje(msg)}
              {respuestasPor[msg.id]?.map(r => <div key={r.id} className="ml-5">{renderMensaje(r, true)}</div>)}
              {respondiendo === msg.id && renderReplyInput(msg.id)}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 pb-5 border-t space-y-2 shrink-0" data-testid="new-message-input">
          <div className="flex gap-1">
            {['normal', 'importante', 'pendiente', 'resuelto'].map(est => {
              const c = ESTADO_CONFIG[est];
              const Icon = c.icon;
              return (
                <Button
                  key={est} type="button"
                  variant={nuevoEstado === est ? 'default' : 'outline'}
                  size="sm" className="h-6 text-[10px] gap-0.5 px-2"
                  onClick={() => setNuevoEstado(est)}
                  data-testid={`estado-btn-${est}`}
                >
                  {Icon && <Icon className="h-2.5 w-2.5" />}
                  {c.label}
                </Button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={nuevoMensaje}
              onChange={(e) => setNuevoMensaje(e.target.value)}
              placeholder="Escribe un mensaje..."
              rows={1}
              className="text-xs resize-none min-h-[36px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); enviarMensaje(nuevoMensaje); }
              }}
            />
            <Button type="button" size="icon" className="shrink-0 h-9 w-9" disabled={!nuevoMensaje.trim() || loading} onClick={() => enviarMensaje(nuevoMensaje)} data-testid="btn-send-message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
