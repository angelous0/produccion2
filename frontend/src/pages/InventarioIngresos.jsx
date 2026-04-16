import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../components/ui/command';
import { Plus, Trash2, ArrowDownCircle, Layers, Pencil, ChevronsUpDown, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';
import { NumericInput } from '../components/ui/numeric-input';
import { cn, formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const InventarioIngresos = () => {
  const [ingresos, setIngresos] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngreso, setEditingIngreso] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    item_id: '',
    cantidad: 0,
    costo_unitario: 0,
    proveedor: '',
    proveedor_id: null,
    numero_documento: '',
    observaciones: '',
    linea_negocio_id: '',
  });
  // Rollos para items con control_por_rollos
  const [rollos, setRollos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [filtroLinea, setFiltroLinea] = useState('');
  // Combobox states
  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);
  const [proveedorPopoverOpen, setProveedorPopoverOpen] = useState(false);
  const [ultimoCosto, setUltimoCosto] = useState(null);

  // Items filtrados para el combobox del modal según línea activa
  const itemsFiltrados = useMemo(() => {
    const base = items.filter(i => i.categoria !== 'PT');
    if (!filtroLinea) return base;
    return base.filter(i =>
      !i.linea_negocio_id || String(i.linea_negocio_id) === filtroLinea
    );
  }, [items, filtroLinea]);

  // Ingresos filtrados para la tabla
  const ingresosFiltrados = useMemo(() => {
    if (!filtroLinea) return ingresos;
    return ingresos.filter(i => String(i.linea_negocio_id || '') === filtroLinea);
  }, [ingresos, filtroLinea]);

  const fetchData = async () => {
    try {
      const [ingresosRes, itemsRes, provRes, lnRes] = await Promise.all([
        axios.get(`${API}/inventario-ingresos`),
        axios.get(`${API}/inventario?all=true`),
        axios.get(`${API}/proveedores`),
        axios.get(`${API}/lineas-negocio`),
      ]);
      setIngresos(ingresosRes.data);
      setItems(itemsRes.data);
      setProveedores(provRes.data);
      setLineasNegocio(lnRes.data);
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
      cantidad: '',
      costo_unitario: '',
      proveedor: '',
      proveedor_id: null,
      numero_documento: '',
      observaciones: '',
      linea_negocio_id: '',
    });
    setSelectedItem(null);
    setRollos([]);
    setUltimoCosto(null);
  };

  const handleItemChange = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItem(item);
    // Hereda línea del item, si no tiene usa el filtro activo, si no hay ninguno queda vacío
    const lineaSugerida = item?.linea_negocio_id
      ? String(item.linea_negocio_id)
      : (filtroLinea || '');
    setFormData({ ...formData, item_id: itemId, cantidad: '', linea_negocio_id: lineaSugerida });
    setRollos([]);
    setItemPopoverOpen(false);
    setUltimoCosto(null);
    // Buscar último costo
    try {
      const res = await axios.get(`${API}/inventario-ingresos/ultimo-costo/${itemId}`);
      if (res.data.tiene_historial) {
        setUltimoCosto(res.data);
        setFormData(prev => ({ ...prev, item_id: itemId, cantidad: '', costo_unitario: res.data.costo_unitario, linea_negocio_id: lineaSugerida }));
      }
    } catch (e) { /* silencioso */ }
  };

  const addRollo = () => {
    setRollos([...rollos, {
      numero_rollo: '',
      metraje: '',
      ancho: '',
      tono: '',
    }]);
  };

  const updateRollo = (index, field, value) => {
    const newRollos = [...rollos];
    newRollos[index][field] = value;
    setRollos(newRollos);
    
    // Actualizar cantidad total
    if (field === 'metraje') {
      const totalMetraje = newRollos.reduce((sum, r) => sum + (parseFloat(r.metraje) || 0), 0);
      setFormData({ ...formData, cantidad: totalMetraje });
    }
  };

  const removeRollo = (index) => {
    const newRollos = rollos.filter((_, i) => i !== index);
    setRollos(newRollos);
    const totalMetraje = newRollos.reduce((sum, r) => sum + (parseFloat(r.metraje) || 0), 0);
    setFormData({ ...formData, cantidad: totalMetraje });
  };

  const handleOpenDialog = () => {
    setEditingIngreso(null);
    resetForm();
    // Pre-selecciona la línea activa del filtro
    if (filtroLinea) {
      setFormData(f => ({ ...f, linea_negocio_id: filtroLinea }));
    }
    setDialogOpen(true);
  };

  const handleOpenEdit = async (ingreso) => {
    setEditingIngreso(ingreso);
    const item = items.find(i => i.id === ingreso.item_id);
    setSelectedItem(item);
    setFormData({
      item_id: ingreso.item_id,
      cantidad: ingreso.cantidad,
      costo_unitario: ingreso.costo_unitario,
      proveedor: ingreso.proveedor || '',
      proveedor_id: ingreso.proveedor_id || null,
      numero_documento: ingreso.numero_documento || '',
      observaciones: ingreso.observaciones || '',
    });
    // Cargar rollos existentes si el item tiene control_por_rollos
    if (item?.control_por_rollos && ingreso.rollos_count > 0) {
      try {
        const res = await axios.get(`${API}/inventario-ingresos/${ingreso.id}/rollos`);
        setRollos(res.data.map(r => ({
          id: r.id,
          numero_rollo: r.numero_rollo || '',
          metraje: r.metraje || 0,
          ancho: r.ancho || 0,
          tono: r.tono || '',
        })));
      } catch { setRollos([]); }
    } else {
      setRollos([]);
    }
    setDialogOpen(true);
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, cantidad: parseFloat(formData.cantidad) || 0, costo_unitario: parseFloat(formData.costo_unitario) || 0, linea_negocio_id: formData.linea_negocio_id ? parseInt(formData.linea_negocio_id) : null };
      if (selectedItem?.control_por_rollos && rollos.length > 0) {
        payload.rollos = rollos.map(r => ({
          ...r,
          metraje: parseFloat(r.metraje) || 0,
          ancho: parseFloat(r.ancho) || 0,
        }));
      }
      
      if (editingIngreso) {
        const updatePayload = {
          proveedor: formData.proveedor,
          proveedor_id: formData.proveedor_id,
          numero_documento: formData.numero_documento,
          observaciones: formData.observaciones,
          costo_unitario: parseFloat(formData.costo_unitario) || 0,
        };
        // Si el item tiene control por rollos, enviar rollos
        if (selectedItem?.control_por_rollos) {
          updatePayload.rollos = rollos.map(r => ({
            id: r.id || undefined,
            numero_rollo: r.numero_rollo,
            metraje: parseFloat(r.metraje) || 0,
            ancho: parseFloat(r.ancho) || 0,
            tono: r.tono,
          }));
        }
        await axios.put(`${API}/inventario-ingresos/${editingIngreso.id}`, updatePayload);
        toast.success('Ingreso actualizado correctamente');
      } else {
        await axios.post(`${API}/inventario-ingresos`, payload);
        toast.success('Ingreso registrado');
      }
      setDialogOpen(false);
      resetForm();
      setEditingIngreso(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este ingreso?')) return;
    try {
      await axios.delete(`${API}/inventario-ingresos/${id}`);
      toast.success('Ingreso eliminado');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="space-y-6" data-testid="ingresos-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ingresos de Inventario</h2>
          <p className="text-muted-foreground">Registro de entradas al inventario</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={filtroLinea || 'todas'}
            onValueChange={v => setFiltroLinea(v === 'todas' ? '' : v)}
          >
            <SelectTrigger className="w-[220px] h-9 text-sm" data-testid="filtro-linea">
              <SelectValue placeholder="Todas las líneas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las líneas</SelectItem>
              {lineasNegocio.map(ln => (
                <SelectItem key={ln.id} value={String(ln.id)}>{ln.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleOpenDialog} data-testid="btn-nuevo-ingreso">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Ingreso
          </Button>
        </div>
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
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Costo Unit.</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>N° Doc.</TableHead>
                  <TableHead className="text-center">Facturación</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : ingresosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {filtroLinea
                        ? `Sin ingresos para la línea seleccionada`
                        : 'No hay ingresos registrados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  ingresosFiltrados.map((ingreso) => (
                    <TableRow key={ingreso.id} className="data-table-row" data-testid={`ingreso-row-${ingreso.id}`}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(ingreso.fecha)}
                      </TableCell>
                      <TableCell className="font-mono">{ingreso.item_codigo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle className="h-4 w-4 text-green-600" />
                          <div>
                            {ingreso.item_nombre}
                            {ingreso.rollos_count > 0 && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                <Layers className="h-3 w-3 mr-1" />
                                {ingreso.rollos_count} rollos
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {ingreso.cantidad}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={ingreso.cantidad_disponible < ingreso.cantidad ? 'text-orange-500' : 'text-green-600'}>
                          {ingreso.cantidad_disponible}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(ingreso.costo_unitario)}
                      </TableCell>
                      <TableCell>{ingreso.proveedor || '-'}</TableCell>
                      <TableCell className="font-mono">{ingreso.numero_documento || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            ingreso.estado_facturacion === 'COMPLETO' ? 'default' :
                            ingreso.estado_facturacion === 'PARCIAL' ? 'secondary' : 'outline'
                          }
                          className={
                            ingreso.estado_facturacion === 'COMPLETO' ? 'bg-green-600' :
                            ingreso.estado_facturacion === 'PARCIAL' ? 'bg-amber-500 text-white' : ''
                          }
                          data-testid={`facturacion-${ingreso.id}`}
                        >
                          {ingreso.estado_facturacion === 'COMPLETO' ? 'Facturado' :
                           ingreso.estado_facturacion === 'PARCIAL' ? `Parcial (${ingreso.qty_facturada}/${ingreso.cantidad})` :
                           'Pendiente'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(ingreso)}
                            title="Editar"
                            data-testid={`edit-ingreso-${ingreso.id}`}
                          >
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(ingreso.id)}
                            title={ingreso.cantidad_disponible !== ingreso.cantidad ? "No se puede eliminar: tiene salidas" : "Eliminar"}
                            disabled={ingreso.cantidad_disponible !== ingreso.cantidad}
                            data-testid={`delete-ingreso-${ingreso.id}`}
                          >
                            <Trash2 className={`h-4 w-4 ${ingreso.cantidad_disponible !== ingreso.cantidad ? 'text-gray-300' : 'text-destructive'}`} />
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
        if (!open) setEditingIngreso(null);
      }}>
        <DialogContent className={selectedItem?.control_por_rollos ? "max-w-3xl max-h-[90vh] overflow-y-auto" : "max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{editingIngreso ? 'Editar Ingreso' : 'Nuevo Ingreso'}</DialogTitle>
            <DialogDescription>
              {editingIngreso 
                ? (selectedItem?.control_por_rollos ? 'Modificar datos del ingreso y sus rollos' : 'Modificar datos del ingreso (item y cantidad no son editables)')
                : 'Registrar una entrada de inventario'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* Selector de item (creación) o resumen (edición) */}
              {editingIngreso ? (
                <div className="rounded-md bg-muted/50 border p-3 space-y-1.5" data-testid="edit-summary">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Item</span>
                    <span className="font-medium text-sm">{selectedItem?.codigo} — {selectedItem?.nombre}</span>
                  </div>
                  {!selectedItem?.control_por_rollos && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Cantidad ingresada</span>
                      <span className="font-mono font-semibold">{editingIngreso.cantidad}</span>
                    </div>
                  )}
                </div>
              ) : (
              <div className="space-y-2">
                  <Label>
                    Item *
                    {filtroLinea && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        — {itemsFiltrados.length} items en {lineasNegocio.find(l => String(l.id) === filtroLinea)?.nombre}
                      </span>
                    )}
                  </Label>
                  {!filtroLinea && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Info className="h-3 w-3" /> Selecciona una línea de negocio arriba para filtrar los items
                    </p>
                  )}
                  <Popover open={itemPopoverOpen} onOpenChange={setItemPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        disabled={!filtroLinea}
                        className="w-full justify-between font-normal disabled:opacity-60"
                        data-testid="combobox-item"
                        title={!filtroLinea ? 'Selecciona una línea de negocio primero' : ''}
                      >
                        {formData.item_id ? (
                          <span className="truncate flex items-center gap-2">
                            <span className="font-mono shrink-0">{items.find(i => i.id === formData.item_id)?.codigo}</span>
                            <span className="truncate">{items.find(i => i.id === formData.item_id)?.nombre}</span>
                            {(() => { const ln = lineasNegocio.find(l => l.id === items.find(i => i.id === formData.item_id)?.linea_negocio_id); return ln ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{ln.nombre}</span> : null; })()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {filtroLinea ? 'Buscar item...' : 'Selecciona una línea primero'}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[620px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre o código..." data-testid="search-item" />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup className="max-h-[280px] overflow-auto">
                            {itemsFiltrados.map((item) => {
                              const ln = item.linea_negocio_id ? lineasNegocio.find(l => l.id === item.linea_negocio_id) : null;
                              return (
                                <CommandItem
                                  key={item.id}
                                  value={`${item.codigo} ${item.nombre} ${ln?.nombre || ''}`}
                                  onSelect={() => handleItemChange(item.id)}
                                  data-testid={`item-option-${item.id}`}
                                  className="flex items-center gap-2"
                                >
                                  <Check className={cn("h-4 w-4 shrink-0", formData.item_id === item.id ? "opacity-100" : "opacity-0")} />
                                  <span className="font-mono text-xs text-muted-foreground shrink-0">{item.codigo}</span>
                                  <span className="truncate">{item.nombre}</span>
                                  {ln && <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{ln.nombre}</span>}
                                  {!item.linea_negocio_id && <span className="ml-auto text-[10px] text-muted-foreground shrink-0 italic">global</span>}
                                  {item.control_por_rollos && (
                                    <Badge variant="outline" className="text-[10px] shrink-0">Rollos</Badge>
                                  )}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              
              {/* Sección de rollos — creación y edición */}
              {selectedItem?.control_por_rollos ? (
                <>
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Rollos</span>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addRollo} data-testid="btn-agregar-rollo">
                        <Plus className="h-3 w-3 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    
                    {rollos.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Agrega rollos para este ingreso
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <div className="grid grid-cols-[1fr_80px_70px_1fr_28px] gap-1 px-0.5 text-[11px] text-muted-foreground font-medium">
                          <div>N° Rollo</div>
                          <div>Metraje</div>
                          <div>Ancho</div>
                          <div>Tono</div>
                          <div></div>
                        </div>
                        {rollos.map((rollo, index) => (
                          <div key={rollo.id || index} className="grid grid-cols-[1fr_80px_70px_1fr_28px] gap-1 items-center" data-testid={`rollo-row-${index}`}>
                            <Input
                              value={rollo.numero_rollo}
                              onChange={(e) => updateRollo(index, 'numero_rollo', e.target.value)}
                              placeholder="R001"
                              className="font-mono h-7 text-xs"
                              data-testid={`rollo-${index}-numero`}
                            />
                            <NumericInput
                              step="0.01"
                              min="0"
                              value={rollo.metraje}
                              onChange={(e) => updateRollo(index, 'metraje', e.target.value)}
                              placeholder="0.00"
                              className="font-mono h-7 text-xs"
                              data-testid={`rollo-${index}-metraje`}
                            />
                            <NumericInput
                              step="0.1"
                              min="0"
                              value={rollo.ancho}
                              onChange={(e) => updateRollo(index, 'ancho', e.target.value)}
                              placeholder="0"
                              className="font-mono h-7 text-xs"
                              data-testid={`rollo-${index}-ancho`}
                            />
                            <Input
                              value={rollo.tono}
                              onChange={(e) => updateRollo(index, 'tono', e.target.value)}
                              placeholder="Claro, Oscuro..."
                              className="h-7 text-xs"
                              data-testid={`rollo-${index}-tono`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeRollo(index)}
                              data-testid={`rollo-${index}-eliminar`}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center pt-1.5 border-t">
                      <span className="text-xs text-muted-foreground">Total Metraje:</span>
                      <span className="font-mono font-bold text-sm">
                        {rollos.reduce((sum, r) => sum + (parseFloat(r.metraje) || 0), 0).toFixed(2)} m
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="costo_unitario">Costo por Metro</Label>
                    <NumericInput
                      id="costo_unitario"
                      min="0"
                      step="0.01"
                      value={formData.costo_unitario}
                      onChange={(e) => setFormData({ ...formData, costo_unitario: e.target.value })}
                      className="font-mono"
                      data-testid="input-costo"
                    />
                    {ultimoCosto && ultimoCosto.tiene_historial && !editingIngreso && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Info className="h-3 w-3" /> Último: {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(ultimoCosto.costo_unitario)}
                      </p>
                    )}
                  </div>
                </>
              ) : !editingIngreso && formData.item_id ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cantidad">Cantidad *</Label>
                    <NumericInput
                      id="cantidad"
                      min="0.01"
                      step="0.01"
                      value={formData.cantidad}
                      onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                      required
                      className="font-mono"
                      data-testid="input-cantidad"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="costo_unitario">Costo Unitario</Label>
                    <NumericInput
                      id="costo_unitario"
                      min="0"
                      step="0.01"
                      value={formData.costo_unitario}
                      onChange={(e) => setFormData({ ...formData, costo_unitario: e.target.value })}
                      className="font-mono"
                      data-testid="input-costo"
                    />
                  </div>
                </div>
              ) : null}

              {/* Referencia de último costo */}
              {ultimoCosto && ultimoCosto.tiene_historial && !editingIngreso && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20" data-testid="referencia-costo">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs text-blue-700">
                    Último costo registrado: <strong className="font-mono">{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(ultimoCosto.costo_unitario)}</strong>
                    {ultimoCosto.fecha && <span className="text-muted-foreground"> ({formatDate(ultimoCosto.fecha)})</span>}
                    {ultimoCosto.proveedor && <span className="text-muted-foreground"> — {ultimoCosto.proveedor}</span>}
                  </span>
                </div>
              )}

              {/* Costo unitario en modo edición para items SIN rollos */}
              {editingIngreso && !selectedItem?.control_por_rollos && (
                <div className="space-y-2">
                  <Label htmlFor="costo_unitario">Costo Unitario</Label>
                  <NumericInput
                    id="costo_unitario"
                    min="0"
                    step="0.01"
                    value={formData.costo_unitario}
                    onChange={(e) => setFormData({ ...formData, costo_unitario: e.target.value })}
                    className="font-mono"
                    data-testid="input-costo"
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="proveedor">Proveedor</Label>
                  <Popover open={proveedorPopoverOpen} onOpenChange={setProveedorPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                        data-testid="combobox-proveedor"
                      >
                        {formData.proveedor_id ? (
                          <span className="truncate">
                            {proveedores.find(p => p.id === formData.proveedor_id)?.nombre || formData.proveedor}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Buscar proveedor...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar proveedor..." data-testid="search-proveedor" />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup className="max-h-[200px] overflow-auto">
                            <CommandItem
                              value="__sin_proveedor__"
                              onSelect={() => {
                                setFormData({ ...formData, proveedor_id: null, proveedor: '' });
                                setProveedorPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", !formData.proveedor_id ? "opacity-100" : "opacity-0")} />
                              <span className="text-muted-foreground italic">Sin proveedor</span>
                            </CommandItem>
                            {proveedores.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.nombre} ${p.numero_documento || ''}`}
                                onSelect={() => {
                                  setFormData({ ...formData, proveedor_id: p.id, proveedor: p.nombre });
                                  setProveedorPopoverOpen(false);
                                }}
                                data-testid={`proveedor-option-${p.id}`}
                              >
                                <Check className={cn("mr-2 h-4 w-4", formData.proveedor_id === p.id ? "opacity-100" : "opacity-0")} />
                                <span className="truncate">{p.nombre}</span>
                                {p.numero_documento && (
                                  <span className="ml-auto text-xs text-muted-foreground font-mono">{p.numero_documento}</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_documento">N° Documento</Label>
                  <Input
                    id="numero_documento"
                    value={formData.numero_documento}
                    onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
                    placeholder="Factura, guía, etc."
                    className="font-mono"
                    data-testid="input-documento"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Línea de Negocio</Label>
                {selectedItem?.linea_negocio_id ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50">
                    <span className="text-sm">{lineasNegocio.find(l => l.id === selectedItem.linea_negocio_id)?.nombre || `Línea #${selectedItem.linea_negocio_id}`}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">Heredada del item</span>
                  </div>
                ) : filtroLinea && !editingIngreso ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-primary/5 border-primary/20">
                    <span className="text-sm font-medium">{lineasNegocio.find(l => String(l.id) === filtroLinea)?.nombre}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">Del filtro activo</span>
                  </div>
                ) : (
                  <Select value={formData.linea_negocio_id || 'global'} onValueChange={(v) => setFormData({ ...formData, linea_negocio_id: v === 'global' ? '' : v })}>
                    <SelectTrigger data-testid="select-linea-ingreso"><SelectValue placeholder="Global" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      {lineasNegocio.map(ln => <SelectItem key={ln.id} value={String(ln.id)}>{ln.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={2}
                  data-testid="input-observaciones"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancelar">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-ingreso">
                {saving ? 'Guardando...' : editingIngreso ? 'Actualizar Ingreso' : 'Registrar Ingreso'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
