import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, Pencil, Trash2, AlertTriangle, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SortableRow = ({ motivo, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: motivo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={`border-b hover:bg-muted/30 ${isDragging ? 'bg-muted' : ''}`}>
      <td className="p-3 w-[50px]">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </td>
      <td className="p-3 font-medium">{motivo.nombre}</td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(motivo)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(motivo)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

export const MotivosIncidencia = () => {
  const [motivos, setMotivos] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [nombre, setNombre] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchMotivos = async () => {
    try {
      const res = await axios.get(`${API}/motivos-incidencia`);
      setMotivos(res.data);
    } catch {
      toast.error('Error al cargar motivos');
    }
  };

  useEffect(() => { fetchMotivos(); }, []);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = motivos.findIndex(m => m.id === active.id);
    const newIndex = motivos.findIndex(m => m.id === over.id);
    const reordered = arrayMove(motivos, oldIndex, newIndex);
    setMotivos(reordered);

    try {
      await axios.put(`${API}/motivos-incidencia/reordenar`, {
        orden: reordered.map(m => m.id),
      });
    } catch {
      toast.error('Error al reordenar');
      fetchMotivos();
    }
  };

  const handleSave = async () => {
    if (!nombre.trim()) return toast.error('El nombre es requerido');

    try {
      if (editingId) {
        await axios.put(`${API}/motivos-incidencia/${editingId}`, { nombre: nombre.trim() });
        toast.success('Motivo actualizado');
      } else {
        await axios.post(`${API}/motivos-incidencia`, { nombre: nombre.trim() });
        toast.success('Motivo creado');
      }
      setDialogOpen(false);
      setEditingId(null);
      setNombre('');
      fetchMotivos();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    }
  };

  const handleEdit = (motivo) => {
    setEditingId(motivo.id);
    setNombre(motivo.nombre);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingId(null);
    setNombre('');
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`${API}/motivos-incidencia/${deleteConfirm.id}`);
      toast.success('Motivo eliminado');
      setDeleteConfirm(null);
      fetchMotivos();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Motivos de Incidencia</h2>
          <p className="text-sm text-muted-foreground">Gestiona los motivos disponibles al registrar una incidencia. Arrastra para reordenar.</p>
        </div>
        <Button onClick={handleNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nuevo Motivo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 w-[50px]"></th>
                <th className="text-left p-3 text-sm font-medium">Nombre</th>
                <th className="text-right p-3 text-sm font-medium w-[120px]">Acciones</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={motivos.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {motivos.map((m) => (
                    <SortableRow key={m.id} motivo={m} onEdit={handleEdit} onDelete={setDeleteConfirm} />
                  ))}
                  {motivos.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-muted-foreground">No hay motivos registrados</td>
                    </tr>
                  )}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Motivo' : 'Nuevo Motivo'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Modifica el nombre del motivo de incidencia' : 'Agrega un nuevo motivo de incidencia'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Nombre *</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Falta Material"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? 'Actualizar' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar eliminar */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminar Motivo
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar el motivo "{deleteConfirm?.nombre}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
