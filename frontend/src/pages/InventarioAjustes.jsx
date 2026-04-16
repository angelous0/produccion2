import { useEffect, useState, useMemo } from 'react';
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
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, RefreshCw, ArrowUp, ArrowDown, Pencil, Layers, ChevronsUpDown, Check, Search } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import { formatDate } from '../lib/dateUtils';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MOTIVOS = [
  'Conteo físico',
  'Merma',
  'Rotura',
  'Devolución',
  'Error de registro',
  'Otro',
];

export const InventarioAjustes = () => {
  const [ajustes, setAjustes] = useState([]);
  const [items, setItems] = useState([]);
  const [rollos, setRollos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAjuste, setEditingAjuste] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    item_id: '',
    tipo: 'entrada',
    cantidad: 1,
    motivo: '',
    observaciones: '',
    rollo_id: '',
  });

  // Filtrar items por búsqueda
  const filteredItems = useMemo(() => {
    if (!itemSearchQuery) return items;
    const query = itemSearchQuery.toLowerCase();
    return items.filter(item => 
      item.nombre.toLowerCase().includes(query) || 
      item.codigo.toLowerCase().includes(query)
    );
  }, [items, itemSearchQuery]);

  const fetchData = async () => {
    try {
      const [ajustesRes, itemsRes] = await Promise.all([
        axios.get(`${API}/inventario-ajustes`),
        axios.get(`${API}/inventario?all=true`),
      ]);
      setAjustes(ajustesRes.data);
      const itemsData = Array.isArray(itemsRes.data) ? itemsRes.data : itemsRes.data.items || [];
      setItems(itemsData);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      item_id: '',
      tipo: 'entrada',
      cantidad: 1,
      motivo: '',
      observaciones: '',
      rollo_id: '',
    });
    setSelectedItem(null);
    setRollos([]);
  };

  const handleOpenDialog = () => {
    setEditingAjuste(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (ajuste) => {
    setEditingAjuste(ajuste);
    const item = items.find(i => i.id === ajuste.item_id);
    setSelectedItem(item);
    setFormData({
      item_id: ajuste.item_id,
      tipo: ajuste.tipo,
      cantidad: ajuste.cantidad,
      motivo: ajuste.motivo || '',
      observaciones: ajuste.observaciones || '',
      rollo_id: ajuste.rollo_id || '',
    });
    setDialogOpen(true);
  };

  const handleItemChange = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItem(item);
    setFormData({ ...formData, item_id: itemId, rollo_id: '' });
    
    // Si el item tiene control por rollos, cargar los rollos disponibles
    if (item?.control_por_rollos) {
      try {
        const res = await axios.get(`${API}/inventario/${itemId}/rollos`);
        // Filtrar solo rollos activos
        const rollosActivos = res.data.filter(r => r.activo);
        setRollos(rollosActivos);
      } catch (error) {
        console.error('Error al cargar rollos:', error);
        setRollos([]);
      }
    } else {
      setRollos([]);
    }
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingAjuste) {
        // Solo permitir editar motivo y observaciones
        await axios.put(`${API}/inventario-ajustes/${editingAjuste.id}`, {
          motivo: formData.motivo,
          observaciones: formData.observaciones,
        });
        toast.success('Ajuste actualizado');
      } else {
        await axios.post(`${API}/inventario-ajustes`, formData);
        toast.success('Ajuste registrado');
      }
      setDialogOpen(false);
      setEditingAjuste(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este ajuste? Se revertirá el cambio en el stock.')) return;
    try {
      await axios.delete(`${API}/inventario-ajustes/${id}`);
      toast.success('Ajuste eliminado');
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6" data-testid="ajustes-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ajustes de Inventario</h2>
          <p className="text-muted-foreground">Correcciones y ajustes de stock</p>
        </div>
        <Button onClick={handleOpenDialog} data-testid="btn-nuevo-ajuste">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Ajuste
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Rollo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : ajustes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay ajustes registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  ajustes.map((ajuste) => (
                    <TableRow key={ajuste.id} className="data-table-row" data-testid={`ajuste-row-${ajuste.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(ajuste.fecha)}
                      </TableCell>
                      <TableCell className="font-mono">{ajuste.item_codigo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-blue-500" />
                          {ajuste.item_nombre}
                          {ajuste.control_por_rollos && (
                            <Badge variant="outline" className="text-xs">
                              <Layers className="h-3 w-3 mr-1" />
                              Rollos
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {ajuste.numero_rollo ? (
                          <Badge variant="secondary">
                            {ajuste.numero_rollo}
                            {ajuste.tono && <span className="ml-1 text-muted-foreground">({ajuste.tono})</span>}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={ajuste.tipo === 'entrada' ? 'default' : 'destructive'}
                          className={ajuste.tipo === 'entrada' ? 'bg-green-600' : ''}
                        >
                          {ajuste.tipo === 'entrada' ? (
                            <ArrowUp className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDown className="h-3 w-3 mr-1" />
                          )}
                          {ajuste.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span className={ajuste.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}>
                          {ajuste.tipo === 'entrada' ? '+' : '-'}{ajuste.cantidad}
                        </span>
                      </TableCell>
                      <TableCell>{ajuste.motivo || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(ajuste)}
                            title="Editar"
                            data-testid={`edit-ajuste-${ajuste.id}`}
                          >
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(ajuste.id)}
                            title="Eliminar"
                            data-testid={`delete-ajuste-${ajuste.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setEditingAjuste(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAjuste ? 'Editar Ajuste' : 'Nuevo Ajuste'}</DialogTitle>
            <DialogDescription>
              {editingAjuste ? 'Modificar motivo y observaciones' : 'Registrar un ajuste de inventario'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <Popover open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemSearchOpen}
                      className="w-full justify-between font-normal"
                      disabled={editingAjuste}
                      data-testid="select-item"
                    >
                      {selectedItem ? (
                        <span>
                          <span className="font-mono mr-2">{selectedItem.codigo}</span>
                          {selectedItem.nombre}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Buscar item...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Buscar por código o nombre..." 
                        value={itemSearchQuery}
                        onValueChange={setItemSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No se encontraron items</CommandEmpty>
                        <CommandGroup>
                          {filteredItems.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.codigo} ${item.nombre}`}
                              onSelect={() => {
                                handleItemChange(item.id);
                                setItemSearchOpen(false);
                                setItemSearchQuery('');
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedItem?.id === item.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="font-mono mr-2 text-sm">{item.codigo}</span>
                              <span className="flex-1">{item.nombre}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                Stock: {item.stock_actual}
                              </span>
                              {item.control_por_rollos && (
                                <Layers className="h-3 w-3 ml-1 text-blue-500" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedItem && (
                  <p className="text-sm text-muted-foreground">
                    Stock actual: <span className="font-mono font-semibold">{selectedItem.stock_actual}</span> {selectedItem.unidad_medida}
                    {selectedItem.control_por_rollos && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        <Layers className="h-3 w-3 mr-1" />
                        Control por rollos
                      </Badge>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Tipo de Ajuste *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                  required
                  disabled={editingAjuste}
                >
                  <SelectTrigger data-testid="select-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4 text-green-600" />
                        Entrada (aumentar stock)
                      </div>
                    </SelectItem>
                    <SelectItem value="salida">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="h-4 w-4 text-red-500" />
                        Salida (reducir stock)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Selector de Rollo - solo para items con control por rollos */}
              {selectedItem?.control_por_rollos && (
                <div className="space-y-2">
                  <Label>
                    Rollo {formData.tipo === 'salida' ? '*' : '(opcional)'}
                  </Label>
                  {formData.tipo === 'entrada' && rollos.length === 0 ? (
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      No hay rollos existentes. El ajuste de entrada aumentará el stock general.
                      Para agregar nuevos rollos, use la sección de <strong>Ingresos</strong>.
                    </p>
                  ) : (
                    <>
                      <Select
                        value={formData.rollo_id}
                        onValueChange={(value) => {
                          const rollo = rollos.find(r => r.id === value);
                          setFormData({ 
                            ...formData, 
                            rollo_id: value === '_none' ? '' : value,
                            cantidad: formData.tipo === 'salida' && rollo ? Math.min(formData.cantidad, rollo.metraje_disponible || 1) : formData.cantidad
                          });
                        }}
                        required={formData.tipo === 'salida'}
                        disabled={editingAjuste}
                      >
                        <SelectTrigger data-testid="select-rollo">
                          <SelectValue placeholder={formData.tipo === 'salida' ? "Seleccionar rollo..." : "Sin rollo específico"} />
                        </SelectTrigger>
                        <SelectContent>
                          {formData.tipo === 'entrada' && (
                            <SelectItem value="_none">
                              <span className="text-muted-foreground">Sin rollo específico (stock general)</span>
                            </SelectItem>
                          )}
                          {rollos.length === 0 ? (
                            <SelectItem value="_empty" disabled>No hay rollos disponibles</SelectItem>
                          ) : (
                            rollos.map((rollo) => (
                              <SelectItem key={rollo.id} value={rollo.id}>
                                <span className="font-mono mr-2">{rollo.numero_rollo}</span>
                                {rollo.tono && <span className="text-muted-foreground mr-2">({rollo.tono})</span>}
                                <span className="text-muted-foreground">Disp: {rollo.metraje_disponible} m</span>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {formData.rollo_id && formData.rollo_id !== '_none' && (
                        <p className="text-sm text-muted-foreground">
                          Metraje disponible: <span className="font-mono font-semibold">
                            {rollos.find(r => r.id === formData.rollo_id)?.metraje_disponible || 0}
                          </span> metros
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad *</Label>
                <NumericInput
                  id="cantidad"
                  min="0.01"
                  step="0.01"
                  max={
                    formData.tipo === 'salida' 
                      ? (selectedItem?.control_por_rollos 
                          ? (rollos.find(r => r.id === formData.rollo_id)?.metraje_disponible || 999999)
                          : (selectedItem?.stock_actual || 999999))
                      : 999999
                  }
                  value={formData.cantidad}
                  onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                  required
                  disabled={editingAjuste}
                  className="font-mono"
                  data-testid="input-cantidad"
                />
                {selectedItem && formData.tipo === 'salida' && (
                  <p className="text-xs text-muted-foreground">
                    Máximo: {selectedItem.control_por_rollos 
                      ? (rollos.find(r => r.id === formData.rollo_id)?.metraje_disponible || 'Seleccione un rollo')
                      : selectedItem.stock_actual}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select
                  value={formData.motivo}
                  onValueChange={(value) => setFormData({ ...formData, motivo: value })}
                >
                  <SelectTrigger data-testid="select-motivo">
                    <SelectValue placeholder="Seleccionar motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Detalles adicionales del ajuste..."
                  rows={2}
                  data-testid="input-observaciones"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-ajuste">
                Registrar Ajuste
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
