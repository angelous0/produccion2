import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { Badge } from '../components/ui/badge';
import { Plus, Pencil, Trash2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { SortableRow, useSortableTable, SortableTableWrapper } from '../components/SortableTable';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ColoresGenerales = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', orden: 0 });

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(items, setItems, 'colores-generales');

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/colores-generales`);
      setItems(response.data);
    } catch (error) {
      toast.error('Error al cargar colores generales');
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
        await axios.put(`${API}/colores-generales/${editingItem.id}`, formData);
        toast.success('Color general actualizado');
      } else {
        await axios.post(`${API}/colores-generales`, formData);
        toast.success('Color general creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', orden: 0 });
      fetchItems();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al guardar');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este color general?')) return;
    try {
      await axios.delete(`${API}/colores-generales/${id}`);
      toast.success('Color general eliminado');
      fetchItems();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al eliminar');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', orden: 0 });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="colores-generales-page">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Colores Generales</h2>
          <p className="text-muted-foreground">
            Categorías de colores para agrupar tonalidades
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
          </p>
        </div>
        <Button onClick={handleNew} data-testid="btn-nuevo-color-general">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Color General
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Colores Generales ({items.length})
          </CardTitle>
        </CardHeader>
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
                    No hay colores generales registrados
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
                      <TableCell>
                        <Badge variant="secondary" className="font-medium">
                          {item.nombre}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            data-testid={`edit-color-general-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            data-testid={`delete-color-general-${item.id}`}
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
            <DialogTitle>{editingItem ? 'Editar Color General' : 'Nuevo Color General'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica el nombre del color general' : 'Crea una nueva categoría de color para agrupar tonalidades'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Celeste, Azul, Rojo, Negro"
                  required
                  data-testid="input-nombre-color-general"
                />
                <p className="text-xs text-muted-foreground">
                  Este color agrupará todas las tonalidades similares (claro, oscuro, intermedio, etc.)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-color-general">
                {editingItem ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
