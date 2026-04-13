import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SortableRow, useSortableTable, SortableTableWrapper } from '../components/SortableTable';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const HilosEspecificos = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', orden: 0 });

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(items, setItems, 'hilos-especificos');

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/hilos-especificos`);
      setItems(response.data);
    } catch (error) {
      toast.error('Error al cargar hilos específicos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`${API}/hilos-especificos/${editingItem.id}`, formData);
        toast.success('Hilo específico actualizado');
      } else {
        await axios.post(`${API}/hilos-especificos`, formData);
        toast.success('Hilo específico creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', orden: 0 });
      fetchItems();
    } catch (error) {
      toast.error('Error al guardar hilo específico');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este hilo específico?')) return;
    try {
      await axios.delete(`${API}/hilos-especificos/${id}`);
      toast.success('Hilo específico eliminado');
      fetchItems();
    } catch (error) {
      toast.error('Error al eliminar hilo específico');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', orden: 0 });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="hilos-especificos-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Hilos Específicos
          </h2>
          <p className="text-muted-foreground">
            Catálogo de hilos especiales para asignar a registros
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
          </p>
        </div>
        <Button onClick={handleNew} data-testid="btn-nuevo-hilo-especifico">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Hilo Específico
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No hay hilos específicos registrados
                  </TableCell>
                </TableRow>
              ) : (
                <SortableTableWrapper
                  items={items}
                  sensors={sensors}
                  handleDragEnd={handleDragEnd}
                  modifiers={modifiers}
                >
                  {items.map((item) => (
                    <SortableRow key={item.id} id={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            data-testid={`edit-hilo-especifico-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            data-testid={`delete-hilo-especifico-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </SortableRow>
                  ))}
                </SortableTableWrapper>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Hilo Específico' : 'Nuevo Hilo Específico'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica el nombre del hilo específico' : 'Agrega un nuevo hilo específico al catálogo'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Nombre del hilo específico"
                  required
                  data-testid="input-nombre-hilo-especifico"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-hilo-especifico">
                {editingItem ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
