import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, Pencil, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { SortableRow, useSortableTable, SortableTableWrapper } from '../components/SortableTable';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const Lavados = () => {
  const [items, setItems] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', categoria: 'basico', tipo_ids: [], orden: 0 });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(items, setItems, 'lavados');

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/lavados`);
      setItems(res.data);
    } catch {
      toast.error('Error al cargar lavados');
    } finally {
      setLoading(false);
    }
  };

  const fetchTipos = async () => {
    try {
      const res = await axios.get(`${API}/tipos`);
      setTipos(res.data);
    } catch {
      console.error('Error fetching tipos');
    }
  };

  useEffect(() => { fetchItems(); fetchTipos(); }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`${API}/lavados/${editingItem.id}`, formData);
        toast.success('Lavado actualizado');
      } else {
        await axios.post(`${API}/lavados`, formData);
        toast.success('Lavado creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', categoria: 'basico', tipo_ids: [], orden: 0 });
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar lavado');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, categoria: item.categoria || 'basico', tipo_ids: item.tipo_ids || [], orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este lavado?')) return;
    try {
      await axios.delete(`${API}/lavados/${id}`);
      toast.success('Lavado eliminado');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar lavado');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', categoria: 'basico', tipo_ids: [], orden: 0 });
    setDialogOpen(true);
  };

  const toggleTipo = (tipoId) => {
    const current = formData.tipo_ids || [];
    setFormData({
      ...formData,
      tipo_ids: current.includes(tipoId)
        ? current.filter(id => id !== tipoId)
        : [...current, tipoId],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lavados</h2>
          <p className="text-muted-foreground">
            Tipos de lavado por categoría y tipo de prenda
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Lavado
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Tipos de prenda</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay lavados registrados</TableCell></TableRow>
              ) : (
                <SortableTableWrapper items={items} sensors={sensors} handleDragEnd={handleDragEnd} modifiers={modifiers}>
                  {items.map((item) => (
                    <SortableRow key={item.id} id={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={item.categoria === 'moda'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }
                        >
                          {item.categoria === 'moda' ? 'Moda' : 'Básico'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(item.tipo_ids || []).map(tipoId => {
                            const tipo = tipos.find(t => t.id === tipoId);
                            return tipo ? <Badge key={tipoId} variant="secondary" className="text-xs">{tipo.nombre}</Badge> : null;
                          })}
                          {(!item.tipo_ids || item.tipo_ids.length === 0) && (
                            <span className="text-muted-foreground text-sm">Sin tipos</span>
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
            <DialogTitle>{editingItem ? 'Editar Lavado' : 'Nuevo Lavado'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica los datos del lavado' : 'Agrega un nuevo tipo de lavado al catálogo'}
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
                  placeholder="Ej: Stone, Acid, Enzimático"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Categoría</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="categoria"
                      value="basico"
                      checked={formData.categoria === 'basico'}
                      onChange={() => setFormData({ ...formData, categoria: 'basico' })}
                      className="accent-primary"
                    />
                    <span className="text-sm">Básico</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="categoria"
                      value="moda"
                      checked={formData.categoria === 'moda'}
                      onChange={() => setFormData({ ...formData, categoria: 'moda' })}
                      className="accent-primary"
                    />
                    <span className="text-sm">Moda</span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipos de prenda disponibles</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between h-auto min-h-10">
                      <div className="flex flex-wrap gap-1 flex-1">
                        {formData.tipo_ids?.length === 0 ? (
                          <span className="text-muted-foreground">Seleccionar tipos...</span>
                        ) : (
                          formData.tipo_ids.map(id => {
                            const tipo = tipos.find(t => t.id === id);
                            return tipo ? <Badge key={id} variant="secondary" className="text-xs">{tipo.nombre}</Badge> : null;
                          })
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar tipo..." />
                      <CommandList>
                        <CommandEmpty>No se encontraron tipos.</CommandEmpty>
                        <CommandGroup>
                          {tipos.map((tipo) => (
                            <CommandItem key={tipo.id} value={tipo.nombre} onSelect={() => toggleTipo(tipo.id)}>
                              <div className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                                formData.tipo_ids?.includes(tipo.id) ? "bg-primary border-primary text-primary-foreground" : "opacity-50"
                              )}>
                                {formData.tipo_ids?.includes(tipo.id) && <Check className="h-3 w-3" />}
                              </div>
                              {tipo.nombre}
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
              <Button type="submit" disabled={saving}>{editingItem ? 'Actualizar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
