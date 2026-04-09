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
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { SortableRow, useSortableTable, SortableTableWrapper } from '../components/SortableTable';
import { usePermissions } from '../hooks/usePermissions';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Marcas = () => {
  const { canCreate, canEdit, canDelete, isReadOnly } = usePermissions('marcas');
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', orden: 0 });

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(marcas, setMarcas, 'marcas');

  const fetchMarcas = async () => {
    try {
      const response = await axios.get(`${API}/marcas`);
      setMarcas(response.data);
    } catch (error) {
      toast.error('Error al cargar marcas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarcas();
  }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`${API}/marcas/${editingItem.id}`, formData);
        toast.success('Marca actualizada');
      } else {
        await axios.post(`${API}/marcas`, formData);
        toast.success('Marca creada');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', orden: 0 });
      fetchMarcas();
    } catch (error) {
      toast.error('Error al guardar marca');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/marcas/${id}`);
      toast.success('Marca eliminada');
      fetchMarcas();
    } catch (error) {
      toast.error('Error al eliminar marca');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', orden: 0 });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="marcas-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Marcas</h2>
          <p className="text-muted-foreground">
            Gestión de marcas de productos
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
            {isReadOnly && (
              <span className="ml-2 text-xs text-yellow-600 flex items-center gap-1 inline-flex">
                <Lock className="h-3 w-3" /> Solo lectura
              </span>
            )}
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleNew} data-testid="btn-nueva-marca">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Marca
          </Button>
        )}
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
              ) : marcas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No hay marcas registradas
                  </TableCell>
                </TableRow>
              ) : (
                <SortableTableWrapper
                  items={marcas}
                  sensors={sensors}
                  handleDragEnd={handleDragEnd}
                  modifiers={modifiers}
                >
                  {marcas.map((item) => (
                    <SortableRow key={item.id} id={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(item)}
                              data-testid={`edit-marca-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(item.id)}
                              data-testid={`delete-marca-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
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
            <DialogTitle>{editingItem ? 'Editar Marca' : 'Nueva Marca'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica los datos de la marca' : 'Agrega una nueva marca al catálogo'}
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
                  placeholder="Nombre de la marca"
                  required
                  data-testid="input-nombre-marca"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-marca">
                {editingItem ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
