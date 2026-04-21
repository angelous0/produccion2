import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Plus, Trash2, ArrowUpCircle, Link2, Layers, Pencil, Search, X, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import { SalidaRollosDialog } from '../components/SalidaRollosDialog';
import { formatDate } from '../lib/dateUtils';
import { formatCurrency } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Combobox para seleccionar un ítem de inventario con:
 *  - Buscador por código o nombre (input arriba del listado)
 *  - Si 'lineaFiltro' está seteado, muestra sólo ítems de esa línea de negocio
 *    (el resto aparece bajo una sección 'Otras líneas' colapsable).
 */
const ItemCombobox = ({ items = [], value, onChange, lineaFiltro, lineasNegocio = [] }) => {
  const [open, setOpen] = useState(false);
  const [showOtrasLineas, setShowOtrasLineas] = useState(false);
  const selected = items.find(i => i.id === value);
  // Filtrar categoría PT (no se saca PT como materia prima)
  const disponibles = items.filter(i => i.categoria !== 'PT');
  const enLinea = lineaFiltro
    ? disponibles.filter(i => Number(i.linea_negocio_id) === Number(lineaFiltro))
    : disponibles;
  const otrasLinea = lineaFiltro
    ? disponibles.filter(i => Number(i.linea_negocio_id) !== Number(lineaFiltro))
    : [];
  const lineaNombre = lineaFiltro
    ? (lineasNegocio.find(l => Number(l.id) === Number(lineaFiltro))?.nombre || `Línea ${lineaFiltro}`)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          data-testid="select-item"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-xs text-muted-foreground">{selected.codigo}</span>
              <span className="truncate">{selected.nombre}</span>
              <span className="text-xs text-muted-foreground shrink-0">(Stock: {selected.stock_actual})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Seleccionar item...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[380px]"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Buscar por código o nombre..." className="h-10" />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>No se encontraron items.</CommandEmpty>
            {lineaFiltro && (
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b">
                {lineaNombre} ({enLinea.length})
              </div>
            )}
            <CommandGroup>
              {enLinea.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.codigo} ${item.nombre}`}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 h-4 w-4', value === item.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono text-xs text-muted-foreground mr-2 min-w-[60px]">{item.codigo}</span>
                  <span className="flex-1 truncate">{item.nombre}</span>
                  <span className="ml-2 text-xs text-muted-foreground shrink-0">Stock: {item.stock_actual}</span>
                  {item.control_por_rollos && (
                    <Badge variant="outline" className="ml-2 text-[9px] shrink-0">Rollos</Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {otrasLinea.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowOtrasLineas(v => !v)}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/40 border-t flex items-center gap-1.5"
                >
                  <ChevronsUpDown className="h-3 w-3" />
                  {showOtrasLineas ? 'Ocultar' : 'Mostrar'} otras líneas ({otrasLinea.length})
                </button>
                {showOtrasLineas && (
                  <CommandGroup heading="Otras líneas">
                    {otrasLinea.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.codigo} ${item.nombre}`}
                        onSelect={() => {
                          onChange(item.id);
                          setOpen(false);
                        }}
                        className="cursor-pointer opacity-70"
                      >
                        <Check className={cn('mr-2 h-4 w-4', value === item.id ? 'opacity-100' : 'opacity-0')} />
                        <span className="font-mono text-xs text-muted-foreground mr-2 min-w-[60px]">{item.codigo}</span>
                        <span className="flex-1 truncate">{item.nombre}</span>
                        <span className="ml-2 text-xs text-muted-foreground shrink-0">Stock: {item.stock_actual}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const InventarioSalidas = () => {
  const [salidas, setSalidas] = useState([]);
  const [items, setItems] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSalida, setEditingSalida] = useState(null);
  const [rollosDialogOpen, setRollosDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rollosDisponibles, setRollosDisponibles] = useState([]);
  const [selectedRollo, setSelectedRollo] = useState(null);
  const [filtroLinea, setFiltroLinea] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // Autocomplete del buscador: sugerencias de cortes que coinciden con el texto
  const [registroFiltroId, setRegistroFiltroId] = useState(null); // null = texto libre
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Flag: en modo carga inicial se permite salir más de lo que hay en stock
  // (para cargar históricos donde los ingresos aún no están completos).
  const [modoMigracion, setModoMigracion] = useState(false);
  const [formData, setFormData] = useState({
    item_id: '',
    cantidad: 1,
    registro_id: '',
    rollo_id: '',
    observaciones: '',
  });

  const fetchData = async () => {
    try {
      const [salidasRes, itemsRes, registrosRes, lineasRes, modoRes] = await Promise.all([
        axios.get(`${API}/inventario-salidas`),
        axios.get(`${API}/inventario?all=true`),
        // limit=2000 para traer TODOS los registros (el endpoint no respeta all=true,
        // solo limit/offset; el default era 50 y cortaba cortes antiguos del dropdown).
        // excluir_estados vacío para incluir también lotes en 'Tienda'.
        axios.get(`${API}/registros?limit=2000&excluir_estados=`),
        axios.get(`${API}/lineas-negocio`),
        axios.get(`${API}/configuracion/modo-migracion`).catch(() => ({ data: { activo: false } })),
      ]);
      setSalidas(salidasRes.data);
      setItems(itemsRes.data);
      const registrosData = registrosRes.data;
      setRegistros(Array.isArray(registrosData) ? registrosData : (registrosData.items || []));
      setLineasNegocio(lineasRes.data || []);
      setModoMigracion(!!modoRes.data?.activo);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const salidasFiltradas = useMemo(() => {
    let lista = salidas;
    if (filtroLinea) lista = lista.filter(s => String(s.linea_negocio_id || '') === filtroLinea);
    // Si el usuario eligió un corte específico del dropdown → filtro exacto
    if (registroFiltroId) {
      lista = lista.filter(s => s.registro_id === registroFiltroId);
    } else if (busqueda.trim()) {
      // Búsqueda libre por texto (si no eligió un corte del dropdown)
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter(s =>
        (s.item_nombre || '').toLowerCase().includes(q) ||
        (s.item_codigo || '').toLowerCase().includes(q) ||
        (s.registro_n_corte || '').toString().toLowerCase().includes(q) ||
        (s.registro_modelo_nombre || '').toLowerCase().includes(q) ||
        (s.observaciones || '').toLowerCase().includes(q)
      );
    }
    return lista;
  }, [salidas, filtroLinea, busqueda, registroFiltroId]);

  // Sugerencias de cortes que matchean el texto escrito en el buscador
  const sugerenciasCortes = useMemo(() => {
    if (!busqueda.trim() || registroFiltroId) return [];
    const q = busqueda.trim().toLowerCase();
    return registros
      .filter(r =>
        (r.n_corte || '').toString().toLowerCase().includes(q) ||
        (r.modelo_nombre || r.modelo_manual?.nombre_modelo || '').toLowerCase().includes(q)
      )
      .slice(0, 8);  // Limitar a 8 sugerencias para no sobrecargar
  }, [busqueda, registros, registroFiltroId]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Info del corte seleccionado para mostrar chip
  const registroSeleccionado = useMemo(() => {
    if (!registroFiltroId) return null;
    return registros.find(r => r.id === registroFiltroId) || null;
  }, [registroFiltroId, registros]);

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      item_id: '',
      cantidad: 1,
      registro_id: '',
      rollo_id: '',
      observaciones: '',
    });
    setSelectedItem(null);
    setRollosDisponibles([]);
    setSelectedRollo(null);
  };

  const handleOpenDialog = () => {
    setEditingSalida(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (salida) => {
    setEditingSalida(salida);
    setFormData({
      item_id: salida.item_id,
      cantidad: salida.cantidad,
      registro_id: salida.registro_id || '',
      rollo_id: salida.rollo_id || '',
      observaciones: salida.observaciones || '',
    });
    // Precargar selectedItem para que el input de cantidad conozca el stock
    const itemActual = items.find(i => i.id === salida.item_id);
    setSelectedItem(itemActual || null);
    setSelectedRollo(null);
    setDialogOpen(true);
  };

  const handleItemChange = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItem(item);
    setSelectedRollo(null);
    // En modo edición preservamos la cantidad actual (el usuario sólo quiere
    // cambiar el ítem, no reempezar). En modo creación sí reseteamos a 1.
    setFormData(prev => ({
      ...prev,
      item_id: itemId,
      rollo_id: '',
      cantidad: editingSalida ? (prev.cantidad || 1) : 1,
    }));

    // Si tiene control por rollos, cargar rollos disponibles
    if (item?.control_por_rollos) {
      try {
        const response = await axios.get(`${API}/inventario-rollos?item_id=${itemId}&activo=true`);
        setRollosDisponibles(response.data.filter(r => r.metraje_disponible > 0));
      } catch (error) {
        console.error('Error loading rollos:', error);
        setRollosDisponibles([]);
      }
    } else {
      setRollosDisponibles([]);
    }
  };

  const handleRolloChange = (rolloId) => {
    const rollo = rollosDisponibles.find(r => r.id === rolloId);
    setSelectedRollo(rollo);
    setFormData({ ...formData, rollo_id: rolloId, cantidad: 1 });
  };

  const handleSubmit = guard(async (e) => {
    e.preventDefault();
    try {
      if (editingSalida) {
        // Payload de edición: siempre incluye observaciones. En modo carga inicial,
        // también incluye item_id y cantidad si el usuario los cambió (el backend
        // valida que modo carga esté activo y que no haya rollo vinculado).
        const updatePayload = { observaciones: formData.observaciones };
        if (modoMigracion) {
          if (formData.item_id && formData.item_id !== editingSalida.item_id) {
            updatePayload.item_id = formData.item_id;
          }
          const nuevaCant = parseFloat(formData.cantidad);
          if (!isNaN(nuevaCant) && Math.abs(nuevaCant - parseFloat(editingSalida.cantidad)) > 1e-6) {
            updatePayload.cantidad = nuevaCant;
          }
        }
        await axios.put(`${API}/inventario-salidas/${editingSalida.id}`, updatePayload);
        toast.success(
          updatePayload.item_id || updatePayload.cantidad
            ? 'Salida actualizada (ítem/cantidad reemplazado)'
            : 'Salida actualizada'
        );
      } else {
        const payload = { ...formData };
        if (!payload.registro_id) {
          delete payload.registro_id;
        }
        if (!payload.rollo_id) {
          delete payload.rollo_id;
        }
        await axios.post(`${API}/inventario-salidas`, payload);
        toast.success('Salida registrada');
      }
      setDialogOpen(false);
      setEditingSalida(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta salida? Se restaurará el stock.')) return;
    try {
      await axios.delete(`${API}/inventario-salidas/${id}`);
      toast.success('Salida eliminada');
      fetchData();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error al eliminar');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === salidasFiltradas.length && salidasFiltradas.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(salidasFiltradas.map(s => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.size} salida(s)? Se restaurará el stock de cada una.`)) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    let ok = 0, fail = 0;
    const errores = [];
    for (const id of ids) {
      try {
        await axios.delete(`${API}/inventario-salidas/${id}`);
        ok++;
      } catch (error) {
        fail++;
        const msg = typeof error.response?.data?.detail === 'string' ? error.response?.data?.detail : 'Error';
        errores.push(msg);
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (ok > 0) toast.success(`${ok} salida(s) eliminada(s)`);
    if (fail > 0) toast.error(`${fail} fallaron${errores[0] ? `: ${errores[0]}` : ''}`);
    fetchData();
  };

  return (
    <div className="space-y-6" data-testid="salidas-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Salidas de Inventario</h2>
          <p className="text-muted-foreground">Registro de salidas con método FIFO</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={searchWrapRef}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            {registroSeleccionado ? (
              // Chip del corte seleccionado (filtro exacto)
              <div className="h-9 w-[260px] pl-8 pr-2 flex items-center gap-1.5 rounded-md border bg-primary/5 text-sm">
                <span className="font-mono font-semibold text-xs truncate">
                  Corte #{registroSeleccionado.n_corte}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  · {registroSeleccionado.modelo_nombre || registroSeleccionado.modelo_manual?.nombre_modelo || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => { setRegistroFiltroId(null); setBusqueda(''); }}
                  className="ml-auto h-5 w-5 rounded hover:bg-muted flex items-center justify-center shrink-0"
                  title="Quitar filtro"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar item, corte, modelo..."
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  className="pl-8 h-9 w-[260px] text-sm"
                />
                {searchOpen && sugerenciasCortes.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-[320px] max-h-[320px] overflow-y-auto rounded-md border bg-popover shadow-lg z-50">
                    <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                      Elegir corte específico ({sugerenciasCortes.length})
                    </p>
                    {sugerenciasCortes.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRegistroFiltroId(r.id);
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent/60 border-b last:border-b-0 flex items-center gap-2"
                      >
                        <span className="font-mono font-semibold text-xs min-w-[70px]">
                          #{r.n_corte}
                        </span>
                        <span className="text-xs truncate flex-1">
                          {r.modelo_nombre || r.modelo_manual?.nombre_modelo || '—'}
                        </span>
                        {r.estado && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{r.estado}</span>
                        )}
                      </button>
                    ))}
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/20 border-t">
                      O sigue tipeando para búsqueda libre
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <Select
            value={filtroLinea || 'todas'}
            onValueChange={v => setFiltroLinea(v === 'todas' ? '' : v)}
          >
            <SelectTrigger className="w-[220px] h-9 text-sm">
              <SelectValue placeholder="Todas las líneas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las líneas</SelectItem>
              {lineasNegocio.map(ln => (
                <SelectItem key={ln.id} value={String(ln.id)}>{ln.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={bulkDeleting}
              data-testid="btn-eliminar-seleccionadas"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          )}
          <Button variant="outline" onClick={() => setRollosDialogOpen(true)} data-testid="btn-salida-rollos">
            <Layers className="h-4 w-4 mr-2" />
            Salida de Rollos
          </Button>
          <Button onClick={handleOpenDialog} data-testid="btn-nueva-salida">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Salida
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header">
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={salidasFiltradas.length > 0 && selectedIds.size === salidasFiltradas.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Seleccionar todas"
                      data-testid="checkbox-seleccionar-todas"
                    />
                  </TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Línea de Negocio</TableHead>
                  <TableHead>Rollo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo FIFO</TableHead>
                  <TableHead>Registro Vinculado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : salidasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {filtroLinea || busqueda ? 'Sin resultados para los filtros aplicados' : 'No hay salidas registradas'}
                    </TableCell>
                  </TableRow>
                ) : (
                  salidasFiltradas.map((salida) => (
                    <TableRow key={salida.id} className="data-table-row" data-testid={`salida-row-${salida.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(salida.id)}
                          onCheckedChange={() => toggleSelect(salida.id)}
                          aria-label={`Seleccionar salida ${salida.id}`}
                          data-testid={`checkbox-salida-${salida.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatDate(salida.fecha)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-red-500" />
                          {salida.item_nombre}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{salida.linea_negocio_nombre || '—'}</TableCell>
                      <TableCell>
                        {salida.rollo_numero ? (
                          <Badge variant="outline" className="gap-1">
                            <Layers className="h-3 w-3" />
                            {salida.rollo_numero}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {salida.cantidad}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(salida.costo_total)}
                      </TableCell>
                      <TableCell>
                        {salida.registro_n_corte ? (
                          <Badge variant="outline" className="gap-1">
                            <Link2 className="h-3 w-3" />
                            Corte #{salida.registro_n_corte}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(salida)}
                            title="Editar"
                            data-testid={`edit-salida-${salida.id}`}
                          >
                            <Pencil className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(salida.id)}
                            title="Eliminar"
                            data-testid={`delete-salida-${salida.id}`}
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
        if (!open) setEditingSalida(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSalida ? 'Editar Salida' : 'Nueva Salida'}</DialogTitle>
            <DialogDescription>
              {editingSalida
                ? (modoMigracion
                  ? 'Modo carga inicial: puedes cambiar ítem, cantidad u observaciones.'
                  : 'Sólo observaciones. Para cambiar ítem/cantidad activa el modo carga inicial.')
                : 'Registrar una salida de inventario (FIFO)'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Item *</Label>
                <ItemCombobox
                  items={items}
                  value={formData.item_id}
                  onChange={handleItemChange}
                  lineaFiltro={(() => {
                    // Si la salida está vinculada a un registro con línea de negocio,
                    // restringir el listado a items de esa misma línea.
                    if (!formData.registro_id) return null;
                    const reg = registros.find(r => r.id === formData.registro_id);
                    return reg?.linea_negocio_id || null;
                  })()}
                  lineasNegocio={lineasNegocio}
                />
                {selectedItem && !selectedItem.control_por_rollos && (
                  <p className="text-sm text-muted-foreground">
                    Stock disponible: <span className="font-mono font-semibold">{selectedItem.stock_actual}</span> {selectedItem.unidad_medida}
                  </p>
                )}
              </div>
              
              {/* Selector de Rollo (solo si el item tiene control por rollos) */}
              {selectedItem?.control_por_rollos && (
                <div className="space-y-2">
                  <Label>Rollo *</Label>
                  <Select
                    value={formData.rollo_id}
                    onValueChange={handleRolloChange}
                    required
                  >
                    <SelectTrigger data-testid="select-rollo">
                      <SelectValue placeholder="Seleccionar rollo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {rollosDisponibles.length === 0 ? (
                        <SelectItem value="none" disabled>No hay rollos disponibles</SelectItem>
                      ) : (
                        rollosDisponibles.map((rollo) => (
                          <SelectItem key={rollo.id} value={rollo.id}>
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4" />
                              <span className="font-mono font-semibold">{rollo.numero_rollo}</span>
                              <span className="text-muted-foreground">|</span>
                              <span>{rollo.tono || 'Sin tono'}</span>
                              <span className="text-muted-foreground">|</span>
                              <span className="font-mono text-green-600">{rollo.metraje_disponible?.toFixed(2)}m</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedRollo && (
                    <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rollo:</span>
                        <span className="font-mono font-semibold">{selectedRollo.numero_rollo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tono:</span>
                        <span>{selectedRollo.tono || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ancho:</span>
                        <span className="font-mono">{selectedRollo.ancho}cm</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disponible:</span>
                        <span className="font-mono font-semibold text-green-600">{selectedRollo.metraje_disponible?.toFixed(2)}m</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad ({selectedItem?.unidad_medida || 'unidad'}) *</Label>
                {(() => {
                  // Lógica del max:
                  // - Si hay rollo seleccionado → su metraje disponible (estricto, por control FIFO).
                  // - Si NO hay rollo y estamos en modo carga inicial → sin max (permite negativo).
                  // - Si NO hay rollo y stock < 0 (inconsistencia histórica) → sin max.
                  // - Caso normal → stock_actual.
                  let maxValue;
                  if (selectedRollo?.metraje_disponible != null) {
                    maxValue = selectedRollo.metraje_disponible;
                  } else if (modoMigracion) {
                    maxValue = undefined;  // sin límite en modo carga inicial
                  } else if ((selectedItem?.stock_actual ?? 0) < 0) {
                    maxValue = undefined;  // stock ya es negativo, no limitar más
                  } else {
                    maxValue = selectedItem?.stock_actual || 999999;
                  }
                  return (
                    <NumericInput
                      id="cantidad"
                      min="0.01"
                      step="0.01"
                      max={maxValue}
                      value={formData.cantidad}
                      onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                      required
                      className="font-mono"
                      data-testid="input-cantidad"
                    />
                  );
                })()}
                {modoMigracion && !selectedRollo && (
                  <p className="text-xs text-amber-600">
                    ⚠ Modo carga inicial activo — se permite cualquier cantidad, aunque supere el stock.
                  </p>
                )}
                {!modoMigracion && (selectedItem?.stock_actual ?? 0) < 0 && !selectedRollo && (
                  <p className="text-xs text-amber-600">
                    ⚠ Stock actual negativo ({selectedItem?.stock_actual}). Se permite la salida sin límite.
                  </p>
                )}
                {selectedRollo && (
                  <p className="text-xs text-muted-foreground">
                    Máximo disponible: {selectedRollo.metraje_disponible?.toFixed(2)}m
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Vincular a Registro (opcional)</Label>
                <Select
                  value={formData.registro_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, registro_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-registro">
                    <SelectValue placeholder="Sin vincular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin vincular</SelectItem>
                    {registros.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        <span className="font-mono mr-2">#{reg.n_corte}</span>
                        {reg.modelo_nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Vincula esta salida a un registro de producción
                </p>
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-testid="btn-guardar-salida">
                Registrar Salida
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para salida masiva de rollos */}
      <SalidaRollosDialog
        open={rollosDialogOpen}
        onOpenChange={setRollosDialogOpen}
        onSuccess={fetchData}
      />
    </div>
  );
};
