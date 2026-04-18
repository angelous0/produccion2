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

export const TiposTela = () => {
  const [items, setItems] = useState([]);
  const [telas, setTelas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ nombre: '', tela_ids: [], orden: 0 });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(items, setItems, 'tipos-tela');

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/tipos-tela`);
      setItems(res.data);
    } catch {
      toast.error('Error al cargar tipos de tela');
    } finally {
      setLoading(false);
    }
  };

  const fetchTelas = async () => {
    try {
      const res = await axios.get(`${API}/telas`);
      setTelas(res.data);
    } catch {
      console.error('Error fetching telas');
    }
  };

  useEffect(() => { fetchItems(); fetchTelas(); }, []);

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`${API}/tipos-tela/${editingItem.id}`, formData);
        toast.success('Tipo de tela actualizado');
      } else {
        await axios.post(`${API}/tipos-tela`, formData);
        toast.success('Tipo de tela creado');
      }
      setDialogOpen(false);
      setEditingItem(null);
      setFormData({ nombre: '', tela_ids: [], orden: 0 });
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar tipo de tela');
    }
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ nombre: item.nombre, tela_ids: item.tela_ids || [], orden: item.orden || 0 });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este tipo de tela?')) return;
    try {
      await axios.delete(`${API}/tipos-tela/${id}`);
      toast.success('Tipo de tela eliminado');
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar tipo de tela');
    }
  };

  const handleNew = () => {
    setEditingItem(null);
    setFormData({ nombre: '', tela_ids: [], orden: 0 });
    setDialogOpen(true);
  };

  const toggleTela = (telaId) => {
    const current = formData.tela_ids || [];
    setFormData({
      ...formData,
      tela_ids: current.includes(telaId)
        ? current.filter(id => id !== telaId)
        : [...current, telaId],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tipos de Tela</h2>
          <p className="text-muted-foreground">
            Clasificación del tejido (Jersey, Rib, Interlock, etc.)
            {isSaving && <span className="ml-2 text-xs">(Guardando...)</span>}
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Tipo de Tela
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Telas</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No hay tipos de tela registrados</TableCell></TableRow>
              ) : (
                <SortableTableWrapper items={items} sensors={sensors} handleDragEnd={handleDragEnd} modifiers={modifiers}>
                  {items.map((item) => (
                    <SortableRow key={item.id} id={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(item.tela_ids || []).map(telaId => {
                            const tela = telas.find(t => t.id === telaId);
                            return tela ? <Badge key={telaId} variant="secondary" className="text-xs">{tela.nombre}</Badge> : null;
                          })}
                          {(!item.tela_ids || item.tela_ids.length === 0) && (
                            <span className="text-muted-foreground text-sm">Sin telas</span>
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
            <DialogTitle>{editingItem ? 'Editar Tipo de Tela' : 'Nuevo Tipo de Tela'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica los datos del tipo de tela' : 'Agrega un nuevo tipo de tela al catálogo'}
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
                  placeholder="Ej: Jersey, Rib, Interlock"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Telas disponibles</Label>
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between h-auto min-h-10">
                      <div className="flex flex-wrap gap-1 flex-1">
                        {formData.tela_ids?.length === 0 ? (
                          <span className="text-muted-foreground">Seleccionar telas...</span>
                        ) : (
                          formData.tela_ids.map(id => {
                            const tela = telas.find(t => t.id === id);
                            return tela ? <Badge key={id} variant="secondary" className="text-xs">{tela.nombre}</Badge> : null;
                          })
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar tela..." />
                      <CommandList>
                        <CommandEmpty>No se encontraron telas.</CommandEmpty>
                        <CommandGroup>
                          {telas.map((tela) => (
                            <CommandItem key={tela.id} value={tela.nombre} onSelect={() => toggleTela(tela.id)}>
                              <div className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                                formData.tela_ids?.includes(tela.id) ? "bg-primary border-primary text-primary-foreground" : "opacity-50"
                              )}>
                                {formData.tela_ids?.includes(tela.id) && <Check className="h-3 w-3" />}
                              </div>
                              {tela.nombre}
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
