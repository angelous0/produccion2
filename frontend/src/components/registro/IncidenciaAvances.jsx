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
    <div className="mt-2 pt-2 border-t border-dashed space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" /> Avances ({avances.length})
        </span>
        {canWrite && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-blue-600 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 active:bg-blue-100"
            data-testid={`btn-agregar-avance-${incidenciaId}`}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Cargando...</div>
      ) : avances.length === 0 && !adding ? (
        <div className="text-xs text-muted-foreground italic">Sin avances registrados</div>
      ) : (
        <div className="space-y-2">
          {avances.map(av => {
            const isEditing = editingId === av.id;
            return (
              <div key={av.id} className="bg-background rounded-lg border px-3 py-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      type="date"
                      value={editForm.fecha}
                      onChange={(e) => setEditForm(prev => ({ ...prev, fecha: e.target.value }))}
                      className="h-9 text-sm"
                    />
                    <Textarea
                      value={editForm.comentario}
                      onChange={(e) => setEditForm(prev => ({ ...prev, comentario: e.target.value }))}
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" className="h-9 px-3 text-xs" onClick={() => setEditingId(null)} disabled={saving}>
                        <X className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" className="h-9 px-3 text-xs" onClick={handleSaveEdit} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Guardar</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{av.fecha ? new Date(av.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}</span>
                        {av.usuario && <span className="opacity-70">· {av.usuario}</span>}
                      </div>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{av.comentario}</p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-0.5 shrink-0">
                        <button type="button" onClick={() => startEdit(av)} className="h-8 w-8 rounded-lg hover:bg-muted active:bg-muted-foreground/10 flex items-center justify-center" title="Editar">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button type="button" onClick={() => handleDelete(av.id)} className="h-8 w-8 rounded-lg hover:bg-muted active:bg-muted-foreground/10 flex items-center justify-center" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
        <div className="bg-background rounded-lg border px-3 py-2 space-y-2">
          <Input
            type="date"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
            placeholder="Fecha (ahora por defecto)"
            className="h-9 text-sm"
          />
          <Textarea
            value={nuevoComentario}
            onChange={(e) => setNuevoComentario(e.target.value)}
            placeholder="Describir el avance..."
            rows={3}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-9 px-3 text-xs flex-1 sm:flex-none" onClick={() => { setAdding(false); setNuevoComentario(''); setNuevaFecha(''); }} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" className="h-9 px-4 text-xs flex-1 sm:flex-none" onClick={handleAgregar} disabled={saving || !nuevoComentario.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Agregar</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Convierte un ISO datetime UTC (o con Z) a string 'YYYY-MM-DD'
 * en hora de Lima, compatible con <input type="date">.
 */
function toDatetimeLocalLima(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    // Solo fecha (en-CA devuelve YYYY-MM-DD)
    return d.toLocaleDateString('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch {
    return '';
  }
}
