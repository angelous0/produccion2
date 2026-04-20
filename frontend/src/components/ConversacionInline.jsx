import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function ConversacionInline({ registroId, usuario }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const cargar = async () => {
    try {
      const res = await axios.get(`${API}/conversacion/${registroId}/mensajes/`);
      setMensajes(res.data || []);
    } catch { setMensajes([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [registroId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/conversacion/${registroId}/mensajes/`, { texto, autor: usuario });
      setTexto('');
      await cargar();
    } catch { toast.error('Error al enviar mensaje'); }
    finally { setSending(false); }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 pb-1 border-b">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Mensajes del Registro</h3>
        <span className="text-xs text-muted-foreground ml-auto">{mensajes.length} mensajes</span>
      </div>

      {/* Lista de mensajes */}
      <div className="flex flex-col gap-2 min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg border bg-muted/20 p-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageCircle className="h-8 w-8 opacity-20 mb-2" />
            <p className="text-sm">Sin mensajes aun. Se el primero en escribir.</p>
          </div>
        ) : (
          mensajes.map((m, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-lg bg-card border p-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-primary">{m.autor || 'Usuario'}</span>
                <span className="text-xs text-muted-foreground">{m.fecha ? new Date(m.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}</span>
              </div>
              <p className="text-sm leading-snug">{m.texto}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escribe un mensaje... (Enter para enviar)"
          rows={2}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button onClick={enviar} disabled={sending || !texto.trim()} size="sm" className="self-end px-4">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
