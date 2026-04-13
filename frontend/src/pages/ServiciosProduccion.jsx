import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, Pencil, Trash2, Cog, GripVertical, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Componente de fila sorteable
const SortableRow = ({ servicio, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: servicio.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b ${isDragging ? 'bg-muted' : ''}`}
      data-testid={`servicio-row-${servicio.id}`}
    >
      <td className="p-3 font-mono text-center">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            data-testid={`drag-handle-${servicio.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {servicio.secuencia}
        </div>
      </td>
      <td className="p-3 font-medium">
        {servicio.nombre}
        {servicio.usa_avance_porcentaje && (
          <span className="ml-2 text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">%</span>
        )}
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(servicio)}
            data-testid={`edit-servicio-${servicio.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(servicio.id)}
            data-testid={`delete-servicio-${servicio.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

export const ServiciosProduccion = () => {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServicio, setEditingServicio] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', secuencia: 0, usa_avance_porcentaje: false });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchServicios = async () => {
    try {
      const response = await axios.get(`${API}/servicios-produccion`);
      setServicios(response.data);
    } catch (error) {
      toast.error('Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServicios();
  }, []);

  const handleOpenDialog = (servicio = null) => {
    if (servicio) {
      setEditingServicio(servicio);
      setFormData({ nombre: servicio.nombre, secuencia: servicio.secuencia || 0, usa_avance_porcentaje: servicio.usa_avance_porcentaje || false });
    } else {
      setEditingServicio(null);
      const maxSecuencia = servicios.reduce((max, s) => Math.max(max, s.secuencia || 0), 0);
      setFormData({ nombre: '', secuencia: maxSecuencia + 1, usa_avance_porcentaje: false });
    }
    setDialogOpen(true);
  };

  const handleSubmit = guard(async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      if (editingServicio) {
        await axios.put(`${API}/servicios-produccion/${editingServicio.id}`, formData);
        toast.success('Servicio actualizado');
      } else {
        await axios.post(`${API}/servicios-produccion`, formData);
        toast.success('Servicio creado');
      }
      setDialogOpen(false);
      fetchServicios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este servicio?')) return;
    try {
      await axios.delete(`${API}/servicios-produccion/${id}`);
      toast.success('Servicio eliminado');
      fetchServicios();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = servicios.findIndex((s) => s.id === active.id);
      const newIndex = servicios.findIndex((s) => s.id === over.id);

      const newServicios = arrayMove(servicios, oldIndex, newIndex);
      
      // Actualizar orden localmente primero para UI responsiva
      const updatedServicios = newServicios.map((s, index) => ({
        ...s,
        orden: index,
      }));
      setServicios(updatedServicios);

      // Actualizar en el backend
      try {
        await Promise.all(
          updatedServicios.map((s) =>
            axios.put(`${API}/servicios-produccion/${s.id}`, {
              nombre: s.nombre,
              descripcion: s.descripcion || '',
              tarifa: s.tarifa || 0,
              orden: s.orden,
              usa_avance_porcentaje: s.usa_avance_porcentaje || false,
            })
          )
        );
        toast.success('Orden actualizado');
      } catch (error) {
        toast.error('Error al actualizar orden');
        fetchServicios(); // Revertir en caso de error
      }
    }
  };

  return (
    <div className="space-y-6" data-testid="servicios-produccion-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cog className="h-6 w-6" />
            Servicios de Producción
          </h2>
          <p className="text-muted-foreground">
            Gestiona los servicios del proceso productivo. Arrastra para reordenar.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="btn-nuevo-servicio">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Servicio
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{servicios.length} servicios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : servicios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay servicios registrados
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="p-3 text-left text-sm font-semibold w-[100px]">Orden</th>
                    <th className="p-3 text-left text-sm font-semibold">Nombre</th>
                    <th className="p-3 text-right text-sm font-semibold w-[120px]">Acciones</th>
                  </tr>
                </thead>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={servicios.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {servicios.map((servicio) => (
                        <SortableRow
                          key={servicio.id}
                          servicio={servicio}
                          onEdit={handleOpenDialog}
                          onDelete={handleDelete}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}
            </DialogTitle>
            <DialogDescription>
              {editingServicio 
                ? 'Modifica los datos del servicio de producción'
                : 'Crea un nuevo servicio de producción'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Corte, Costura, Bordado..."
                data-testid="input-nombre-servicio"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secuencia">Orden de Secuencia</Label>
              <NumericInput
                id="secuencia"
                min="0"
                value={formData.secuencia}
                onChange={(e) => setFormData({ ...formData, secuencia: e.target.value })}
                placeholder="0"
                className="font-mono"
                data-testid="input-secuencia-servicio"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Arrastra las filas en la tabla para cambiar el orden. Las tarifas se configuran en la ficha de cada Persona.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="usa_avance_porcentaje"
                checked={formData.usa_avance_porcentaje}
                onChange={(e) => setFormData({ ...formData, usa_avance_porcentaje: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="checkbox-usa-avance"
              />
              <Label htmlFor="usa_avance_porcentaje" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" />
                Usa avance por porcentaje
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving} data-testid="btn-guardar-servicio">
              {editingServicio ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
