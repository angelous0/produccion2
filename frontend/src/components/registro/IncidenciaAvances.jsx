import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Plus, MessageSquare, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Panel expandible con historial de avances (comentarios) de una incidencia.
 * Permite agregar, editar y eliminar avances con fecha manual.
 */
export default function IncidenciaAvances({ incidenciaId, canWrite = true }) {
  const [avances, setAvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ comentario: '', fecha: '' });

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/incidencias/${incidenciaId}/avances`);
      setAvances(res.data || []);
    } catch {
      // sin toast para no ruidar si el endpoint está caído
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (incidenciaId) cargar(); /* eslint-disable-line */ }, [incidenciaId]);

  const handleAgregar = async () => {
    if (!nuevoComentario.trim()) return;
    setSaving(true);
    try {
      await axios.post(`${API}/incidencias/${incidenciaId}/avances`, {
        comentario: nuevoComentario.trim(),
        fecha: nuevaFecha || null,
      });
      toast.success('Avance agregado');
      setNuevoComentario('');
      setNuevaFecha('');
      setAdding(false);
      await cargar();
    } catch (err) {
      toast.error('Error al agregar avance');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (av) => {
    setEditingId(av.id);
    // Convertir UTC → Lima en string datetime-local (YYYY-MM-DDTHH:MM)
    const limaStr = av.fecha ? toDatetimeLocalLima(av.fecha) : '';
    setEditForm({ comentario: av.comentario, fecha: limaStr });
  };

  const handleSaveEdit = async () => {
    if (!editForm.comentario.trim()) return;
    setSaving(true);
    try {
      await axios.patch(`${API}/incidencias/${incidenciaId}/avances/${editingId}`, {
        comentario: editForm.comentario.trim(),
        fecha: editForm.fecha || null,
      });
      toast.success('Avance actualizado');
      setEditingId(null);
      await cargar();
    } catch {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (avId) => {
    if (!window.confirm('¿Eliminar este avance?')) return;
    try {
      await axios.delete(`${API}/incidencias/${incidenciaId}/avances/${avId}`);
      toast.success('Avance eliminado');
      await cargar();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-dashed space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Avances ({avances.length})
        </span>
        {canWrite && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
            data-testid={`btn-agregar-avance-${incidenciaId}`}
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground">Cargando...</div>
      ) : avances.length === 0 && !adding ? (
        <div className="text-[11px] text-muted-foreground italic">Sin avances registrados</div>
      ) : (
        <div className="space-y-1.5">
          {avances.map(av => {
            const isEditing = editingId === av.id;
            return (
              <div key={av.id} className="bg-background rounded-md border px-2 py-1.5">
                {isEditing ? (
                  <div className="space-y-1.5">
                    <Input
                      type="datetime-local"
                      value={editForm.fecha}
                      onChange={(e) => setEditForm(prev => ({ ...prev, fecha: e.target.value }))}
                      className="h-7 text-xs"
                    />
                    <Textarea
                      value={editForm.comentario}
                      onChange={(e) => setEditForm(prev => ({ ...prev, comentario: e.target.value }))}
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingId(null)} disabled={saving}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSaveEdit} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span>{av.fecha ? new Date(av.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}</span>
                        {av.usuario && <span className="opacity-70">· {av.usuario}</span>}
                      </div>
                      <p className="text-xs mt-0.5 whitespace-pre-wrap break-words">{av.comentario}</p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-0.5 shrink-0">
                        <button type="button" onClick={() => startEdit(av)} className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center" title="Editar">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button type="button" onClick={() => handleDelete(av.id)} className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center" title="Eliminar">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="bg-background rounded-md border px-2 py-1.5 space-y-1.5">
          <Input
            type="datetime-local"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
            placeholder="Fecha (ahora por defecto)"
            className="h-7 text-xs"
          />
          <Textarea
            value={nuevoComentario}
            onChange={(e) => setNuevoComentario(e.target.value)}
            placeholder="Describir el avance..."
            rows={2}
            className="text-xs"
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setAdding(false); setNuevoComentario(''); setNuevaFecha(''); }} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleAgregar} disabled={saving || !nuevoComentario.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Agregar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Convierte un ISO datetime UTC (o con Z) a string 'YYYY-MM-DDTHH:MM'
 * en hora de Lima, compatible con <input type="datetime-local">.
 */
function toDatetimeLocalLima(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    // Formatear en hora Lima usando toLocaleString y luego reconstruir
    const parts = d.toLocaleString('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }); // "2026-04-20, 14:20"
    const [date, time] = parts.split(', ');
    return `${date}T${time}`;
  } catch {
    return '';
  }
}
