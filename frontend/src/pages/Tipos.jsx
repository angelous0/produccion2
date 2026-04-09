import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
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
import { Plus, Pencil, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { SortableRow, useSortableTable, SortableTableWrapper } from '../components/SortableTable';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Tipos = () => {
  const [items, setItems] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', marca_ids: [], orden: 0 });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(items, setItems, 'tipos');

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/tipos`);
      setItems(response.data);
    } catch (error) {
      toast.error('Error al cargar tipos');
    } finally {
      setLoading(false);
    }
  };

  const fetchMarcas = async () => {
    try {
      const response = await axios.get(`${API}/marcas`);
      setMarcas(response.data);
    } catch (error) {
      console.error('Error fetching marcas:', error);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchMarcas();
  }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`${API}/tipos/${editingItem.id}`, formData);
        toast.success('Tipo actualizado');
      } else {
        await axios.post(`${API}/tipos`, formData);
        toast.success('Tipo creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', marca_ids: [], orden: 0 });
      fetchItems();
    } catch (error) {
      toast.error('Error al guardar tipo');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, marca_ids: item.marca_ids || [], orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/tipos/${id}`);
      toast.success('Tipo eliminado');
      fetchItems();
    } catch (error) {
      toast.error('Error al eliminar tipo');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', marca_ids: [], orden: 0 });
    setDialogOpen(true);
  };

  const toggleMarca = (marcaId) => {
    const current = formData.marca_ids || [];
    if (current.includes(marcaId)) {
      setFormData({ ...formData, marca_ids: current.filter(id => id !== marcaId) });
    } else {
      setFormData({ ...formData, marca_ids: [...current, marcaId] });
    }
  };

  return (
    <div className="space-y-6" data-testid="tipos-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tipos</h2>
          <p className="text-muted-foreground">
            Gestión de tipos de productos
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
          </p>
        </div>
        <Button onClick={handleNew} data-testid="btn-nuevo-tipo">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Tipo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Marcas</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No hay tipos registrados
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
                        <div className="flex flex-wrap gap-1">
                          {(item.marca_ids || []).map(marcaId => {
                            const marca = marcas.find(m => m.id === marcaId);
                            return marca ? (
                              <Badge key={marcaId} variant="secondary" className="text-xs">
                                {marca.nombre}
                              </Badge>
                            ) : null;
                          })}
                          {(!item.marca_ids || item.marca_ids.length === 0) && (
                            <span className="text-muted-foreground text-sm">Sin marcas</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
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
            <DialogTitle>{editingItem ? 'Editar Tipo' : 'Nuevo Tipo'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica los datos del tipo' : 'Agrega un nuevo tipo al catálogo'}
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
                  placeholder="Nombre del tipo"
                  required
                  data-testid="input-nombre-tipo"
                />
              </div>
              <div className="space-y-2">
                <Label>Marcas disponibles</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between h-auto min-h-10">
                      <div className="flex flex-wrap gap-1 flex-1">
                        {formData.marca_ids?.length === 0 ? (
                          <span className="text-muted-foreground">Seleccionar marcas...</span>
                        ) : (
                          formData.marca_ids.map(id => {
                            const marca = marcas.find(m => m.id === id);
                            return marca ? (
                              <Badge key={id} variant="secondary" className="text-xs">{marca.nombre}</Badge>
                            ) : null;
                          })
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar marca..." />
                      <CommandList>
                        <CommandEmpty>No se encontraron marcas.</CommandEmpty>
                        <CommandGroup>
                          {marcas.map((marca) => (
                            <CommandItem key={marca.id} value={marca.nombre} onSelect={() => toggleMarca(marca.id)}>
                              <div className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                                formData.marca_ids?.includes(marca.id) ? "bg-primary border-primary text-primary-foreground" : "opacity-50"
                              )}>
                                {formData.marca_ids?.includes(marca.id) && <Check className="h-3 w-3" />}
                              </div>
                              {marca.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-tipo">{editingItem ? 'Actualizar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
