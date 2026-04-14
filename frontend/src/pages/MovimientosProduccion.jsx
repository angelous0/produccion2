import { useEffect, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Play, Pencil, Trash2, Calendar, Users, Cog, Filter, X, Plus, DollarSign, Search, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import { formatDate } from '../lib/dateUtils';
import { formatCurrency, cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MovimientosProduccion = () => {
  const [movimientos, setMovimientos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const { saving, guard } = useSaving();
  const [registroPopoverOpen, setRegistroPopoverOpen] = useState(false);
  
  // Filtros (server-side)
  const [filtroServicio, setFiltroServicio] = useState('');
  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroRegistro, setFiltroRegistro] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Dialog para crear nuevo
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [personasFiltradasCreate, setPersonasFiltradasCreate] = useState([]);
  const [createFormData, setCreateFormData] = useState({
    registro_id: '',
    servicio_id: '',
    persona_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_esperada_movimiento: '',
    cantidad_enviada: 0,
    cantidad_recibida: 0,
    observaciones: '',
  });

  // Dialog de edición
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMovimiento, setEditingMovimiento] = useState(null);
  const [personasFiltradas, setPersonasFiltradas] = useState([]);
  const [formData, setFormData] = useState({
    registro_id: '',
    servicio_id: '',
    persona_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_esperada_movimiento: '',
    cantidad_enviada: 0,
    cantidad_recibida: 0,
    observaciones: '',
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchMovimientos = async (append = false) => {
    if (!append) setLoading(true);
    try {
      const offset = append ? movimientos.length : 0;
      const params = new URLSearchParams({ limit: pageSize, offset });
      if (searchDebounced) params.set('search', searchDebounced);
      if (filtroServicio) params.set('servicio_id', filtroServicio);
      if (filtroPersona) params.set('persona_id', filtroPersona);
      if (filtroFechaDesde) params.set('fecha_desde', filtroFechaDesde);
      if (filtroFechaHasta) params.set('fecha_hasta', filtroFechaHasta);
      const response = await axios.get(`${API}/movimientos-produccion?${params.toString()}`);
      const data = response.data;
      if (append) {
        setMovimientos(prev => [...prev, ...data.items]);
      } else {
        setMovimientos(data.items);
      }
      setTotal(data.total);
    } catch (error) {
      toast.error('Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogos = async () => {
    try {
      const [servRes, persRes, regRes] = await Promise.all([
        axios.get(`${API}/servicios-produccion`),
        axios.get(`${API}/personas-produccion`),
        axios.get(`${API}/registros?limit=500&excluir_estados=`),
      ]);
      setServicios(servRes.data);
      setPersonas(persRes.data);
      setRegistros(Array.isArray(regRes.data) ? regRes.data : regRes.data.items || []);
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
    }
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  // Reload when filters change
  useEffect(() => {
    fetchMovimientos(false);
  }, [searchDebounced, filtroServicio, filtroPersona, filtroFechaDesde, filtroFechaHasta]);

  const getRegistroLabel = (mov) => {
    return mov.registro_n_corte || '-';
  };

  const handleOpenEdit = (movimiento) => {
    setEditingMovimiento(movimiento);
    setFormData({
      registro_id: movimiento.registro_id,
      servicio_id: movimiento.servicio_id,
      persona_id: movimiento.persona_id,
      fecha_inicio: movimiento.fecha_inicio || '',
      fecha_fin: movimiento.fecha_fin || '',
      fecha_esperada_movimiento: movimiento.fecha_esperada_movimiento || '',
      cantidad_enviada: movimiento.cantidad_enviada || movimiento.cantidad || 0,
      cantidad_recibida: movimiento.cantidad_recibida || movimiento.cantidad || 0,
      observaciones: movimiento.observaciones || '',
    });
    // Filtrar personas por el servicio del movimiento (nueva estructura)
    const filtradas = personas.filter(p => {
      const tieneEnDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === movimiento.servicio_id);
      const tieneEnServicios = (p.servicios || []).some(s => s.servicio_id === movimiento.servicio_id);
      const tieneEnIds = (p.servicio_ids || []).includes(movimiento.servicio_id);
      return tieneEnDetalle || tieneEnServicios || tieneEnIds;
    });
    setPersonasFiltradas(filtradas);
    setDialogOpen(true);
  };

  // Helper para obtener tarifa de la combinación persona-servicio
  const getTarifaPersonaServicio = (personaId, servicioId) => {
    const persona = personas.find(p => p.id === personaId);
    if (!persona) return 0;
    
    const servicioDetalle = (persona.servicios_detalle || []).find(s => s.servicio_id === servicioId);
    if (servicioDetalle) return servicioDetalle.tarifa || 0;
    
    const servicio = (persona.servicios || []).find(s => s.servicio_id === servicioId);
    if (servicio) return servicio.tarifa || 0;
    
    return 0;
  };

  // Helper para filtrar personas por servicio
  const filtrarPersonasPorServicio = (servicioId) => {
    return personas.filter(p => {
      const tieneEnDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === servicioId);
      const tieneEnServicios = (p.servicios || []).some(s => s.servicio_id === servicioId);
      const tieneEnIds = (p.servicio_ids || []).includes(servicioId);
      return tieneEnDetalle || tieneEnServicios || tieneEnIds;
    });
  };

  const handleServicioChange = (servicioId) => {
    setFormData({ 
      ...formData, 
      servicio_id: servicioId,
      persona_id: ''
    });
    setPersonasFiltradas(filtrarPersonasPorServicio(servicioId));
  };

  const handlePersonaChangeEdit = (personaId) => {
    setFormData({
      ...formData,
      persona_id: personaId
    });
  };

  const handleSubmit = guard(async () => {
    if (!formData.servicio_id || !formData.persona_id) {
      toast.error('Selecciona servicio y persona');
      return;
    }
    if (formData.fecha_inicio && formData.fecha_fin && formData.fecha_fin < formData.fecha_inicio) {
      toast.error('La fecha fin debe ser igual o mayor que la fecha inicio');
      return;
    }
    if (formData.fecha_inicio && formData.fecha_esperada_movimiento && formData.fecha_esperada_movimiento < formData.fecha_inicio) {
      toast.error('La fecha esperada debe ser igual o mayor que la fecha inicio');
      return;
    }

    try {
      await axios.put(`${API}/movimientos-produccion/${editingMovimiento.id}`, formData);
      toast.success('Movimiento actualizado');
      setDialogOpen(false);
      fetchMovimientos(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al actualizar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este movimiento?')) return;
    try {
      await axios.delete(`${API}/movimientos-produccion/${id}`);
      toast.success('Movimiento eliminado');
      fetchMovimientos(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  // ===== Funciones para Crear Nuevo =====
  const handleOpenCreateDialog = () => {
    setCreateFormData({
      registro_id: '',
      servicio_id: '',
      persona_id: '',
      fecha_inicio: new Date().toISOString().split('T')[0],
      fecha_fin: '',
      fecha_esperada_movimiento: '',
      cantidad_enviada: 0,
      cantidad_recibida: 0,
      observaciones: '',
    });
    setPersonasFiltradasCreate([]);
    setCreateDialogOpen(true);
  };

  const handleCreateServicioChange = (servicioId) => {
    setCreateFormData({ 
      ...createFormData, 
      servicio_id: servicioId,
      persona_id: ''
    });
    setPersonasFiltradasCreate(filtrarPersonasPorServicio(servicioId));
  };

  const handlePersonaChangeCreate = (personaId) => {
    setCreateFormData({
      ...createFormData,
      persona_id: personaId
    });
  };

  // Helper para obtener tarifa del servicio (mantenido para compatibilidad con visualización)
  const getServicioTarifa = (servicioId) => {
    const servicio = servicios.find(s => s.id === servicioId);
    return servicio?.tarifa || 0;
  };

  const handleCreateSubmit = guard(async () => {
    if (!createFormData.registro_id || !createFormData.servicio_id || !createFormData.persona_id) {
      toast.error('Selecciona registro, servicio y persona');
      return;
    }
    if (createFormData.fecha_inicio && createFormData.fecha_fin && createFormData.fecha_fin < createFormData.fecha_inicio) {
      toast.error('La fecha fin debe ser igual o mayor que la fecha inicio');
      return;
    }
    if (createFormData.fecha_inicio && createFormData.fecha_esperada_movimiento && createFormData.fecha_esperada_movimiento < createFormData.fecha_inicio) {
      toast.error('La fecha esperada debe ser igual o mayor que la fecha inicio');
      return;
    }

    try {
      await axios.post(`${API}/movimientos-produccion`, createFormData);
      toast.success('Movimiento creado');
      setCreateDialogOpen(false);
      fetchMovimientos(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al crear');
    }
  });

  const limpiarFiltros = () => {
    setFiltroServicio('');
    setFiltroPersona('');
    setFiltroEstado('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setSearchTerm('');
  };

  const getTotalCantidad = () => {
    return movimientos.reduce((sum, m) => sum + (m.cantidad_recibida || m.cantidad || 0), 0);
  };

  const getTotalCosto = () => {
    return movimientos.reduce((sum, m) => sum + (m.costo_calculado || m.costo || 0), 0);
  };

  const hayFiltrosActivos = filtroServicio || filtroPersona || filtroEstado || filtroFechaDesde || filtroFechaHasta || searchTerm;

  // Estado calculado del movimiento basado en fechas
  const getEstadoMovimiento = (mov) => {
    const hoy = new Date().toISOString().split('T')[0];
    if (mov.fecha_fin) return { label: 'Completado', variant: 'default', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    if (mov.fecha_inicio && !mov.fecha_fin) {
      if (mov.fecha_esperada_movimiento && mov.fecha_esperada_movimiento < hoy) {
        return { label: 'Retraso', variant: 'destructive', className: '' };
      }
      return { label: 'En Proceso', variant: 'outline', className: 'border-blue-500 text-blue-600' };
    }
    return { label: 'Pendiente', variant: 'secondary', className: '' };
  };

  const ESTADOS_MOVIMIENTO = [
    { value: 'activos', label: 'En Proceso + Retraso' },
    { value: 'En Proceso', label: 'En Proceso' },
    { value: 'Retraso', label: 'Retraso' },
    { value: 'Completado', label: 'Completado' },
    { value: 'Pendiente', label: 'Pendiente' },
  ];

  const filtrarPorEstado = (mov) => {
    if (!filtroEstado) return true;
    const est = getEstadoMovimiento(mov).label;
    if (filtroEstado === 'activos') return est === 'En Proceso' || est === 'Retraso';
    return est === filtroEstado;
  };

  return (
    <div className="space-y-6" data-testid="movimientos-produccion-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Play className="h-6 w-6" />
            Movimientos de Producción
          </h2>
          <p className="text-muted-foreground">
            Historial completo de movimientos de producción
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog} data-testid="btn-nuevo-movimiento-page">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Movimiento
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {hayFiltrosActivos && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="ml-2">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Corte, servicio, persona..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                  data-testid="search-movimientos"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Servicio</Label>
              <Select value={filtroServicio} onValueChange={(val) => setFiltroServicio(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-servicio">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {servicios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Persona</Label>
              <Select value={filtroPersona} onValueChange={(val) => setFiltroPersona(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-persona">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={filtroEstado} onValueChange={(val) => setFiltroEstado(val === 'all' ? '' : val)}>
                <SelectTrigger data-testid="filtro-estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ESTADOS_MOVIMIENTO.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha Desde</Label>
              <Input
                type="date"
                value={filtroFechaDesde}
                onChange={(e) => setFiltroFechaDesde(e.target.value)}
                data-testid="filtro-fecha-desde"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha Hasta</Label>
              <Input
                type="date"
                value={filtroFechaHasta}
                onChange={(e) => setFiltroFechaHasta(e.target.value)}
                data-testid="filtro-fecha-hasta"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">
            {movimientos.length} de {total} movimientos
          </CardTitle>
          <div className="flex gap-3">
            <Badge variant="secondary" className="text-base px-3 py-1">
              {getTotalCantidad().toLocaleString()} prendas
            </Badge>
            <Badge variant="default" className="text-base px-3 py-1">
              <DollarSign className="h-4 w-4 mr-1" />
              {formatCurrency(getTotalCosto())}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay movimientos registrados
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Registro</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-center">F. Inicio</TableHead>
                    <TableHead className="text-center">F. Fin</TableHead>
                    <TableHead className="text-center">F. Esperada</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="w-[100px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.filter(filtrarPorEstado).map((mov) => (
                    <TableRow key={mov.id} data-testid={`movimiento-row-${mov.id}`}>
                      <TableCell>
                        <span className="font-medium">{getRegistroLabel(mov)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Cog className="h-4 w-4 text-blue-500" />
                          <div>
                            <span>{mov.servicio_nombre}</span>
                            {mov.tarifa > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(mov.tarifa)}/prenda
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{mov.persona_nombre}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {mov.fecha_inicio || '-'}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {mov.fecha_fin || '-'}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {mov.fecha_esperada_movimiento || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {(mov.cantidad_recibida ?? mov.cantidad ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {(mov.costo_calculado || mov.costo || 0) > 0 ? formatCurrency(mov.costo_calculado || mov.costo) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const est = getEstadoMovimiento(mov);
                          return <Badge variant={est.variant} className={`text-xs whitespace-nowrap ${est.className}`}>{est.label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(mov)}
                            data-testid={`edit-movimiento-${mov.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(mov.id)}
                            data-testid={`delete-movimiento-${mov.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {/* Cargar mas */}
          {movimientos.length < total && !loading && (
            <div className="flex justify-center py-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMovimientos(true)}
                data-testid="btn-cargar-mas-movimientos"
              >
                Cargar mas ({movimientos.length} de {total})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Edición */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Movimiento</DialogTitle>
            <DialogDescription>
              Modifica los datos del movimiento de producción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Servicio *</Label>
              <Select
                value={formData.servicio_id}
                onValueChange={handleServicioChange}
              >
                <SelectTrigger data-testid="edit-select-servicio">
                  <SelectValue placeholder="Seleccionar servicio..." />
                </SelectTrigger>
                <SelectContent>
                  {servicios.map((servicio) => (
                    <SelectItem key={servicio.id} value={servicio.id}>
                      {servicio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Persona *</Label>
              <Select
                value={formData.persona_id}
                onValueChange={handlePersonaChangeEdit}
                disabled={!formData.servicio_id}
              >
                <SelectTrigger data-testid="edit-select-persona">
                  <SelectValue placeholder={formData.servicio_id ? "Seleccionar persona..." : "Selecciona servicio primero"} />
                </SelectTrigger>
                <SelectContent>
                  {personasFiltradas.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No hay personas asignadas a este servicio
                    </SelectItem>
                  ) : (
                    personasFiltradas.map((persona) => {
                      const tarifaPersona = getTarifaPersonaServicio(persona.id, formData.servicio_id);
                      return (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.nombre}
                          {tarifaPersona > 0 && (
                            <span className="ml-2 text-green-600">({formatCurrency(tarifaPersona)}/prenda)</span>
                          )}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fecha-inicio">Fecha Inicio</Label>
                <Input
                  id="edit-fecha-inicio"
                  type="date"
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                  data-testid="edit-input-fecha-inicio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fecha-fin">Fecha Fin</Label>
                <Input
                  id="edit-fecha-fin"
                  type="date"
                  value={formData.fecha_fin}
                  onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
                  data-testid="edit-input-fecha-fin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fecha-esperada">Fecha Esperada</Label>
                <Input
                  id="edit-fecha-esperada"
                  type="date"
                  value={formData.fecha_esperada_movimiento}
                  onChange={(e) => setFormData({ ...formData, fecha_esperada_movimiento: e.target.value })}
                  data-testid="edit-input-fecha-esperada"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cantidad-enviada">Cantidad Enviada</Label>
                <NumericInput
                  id="edit-cantidad-enviada"
                  min="0"
                  value={formData.cantidad_enviada}
                  onChange={(e) => setFormData({ ...formData, cantidad_enviada: e.target.value })}
                  className="font-mono"
                  data-testid="edit-input-cantidad-enviada"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cantidad-recibida">Cantidad Recibida</Label>
                <NumericInput
                  id="edit-cantidad-recibida"
                  min="0"
                  value={formData.cantidad_recibida}
                  onChange={(e) => setFormData({ ...formData, cantidad_recibida: e.target.value })}
                  className="font-mono"
                  data-testid="edit-input-cantidad-recibida"
                />
              </div>
            </div>

            {/* Mostrar diferencia (merma potencial) */}
            {formData.cantidad_enviada > formData.cantidad_recibida && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-yellow-700 dark:text-yellow-300">Diferencia (merma):</span>
                  <span className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {formData.cantidad_enviada - formData.cantidad_recibida} prendas
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-observaciones">Observaciones</Label>
              <Textarea
                id="edit-observaciones"
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Notas adicionales..."
                rows={2}
                data-testid="edit-input-observaciones"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={saving || !formData.servicio_id || !formData.persona_id}
              data-testid="btn-actualizar-movimiento"
            >
              {saving ? 'Guardando...' : 'Actualizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Crear Nuevo Movimiento */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Movimiento de Producción</DialogTitle>
            <DialogDescription>
              Registra un nuevo movimiento de producción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Registro *</Label>
              <Popover open={registroPopoverOpen} onOpenChange={setRegistroPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={registroPopoverOpen}
                    className="w-full justify-between font-normal"
                    data-testid="create-select-registro"
                  >
                    {createFormData.registro_id
                      ? (() => {
                          const reg = registros.find(r => r.id === createFormData.registro_id);
                          return reg ? `${reg.n_corte}${reg.modelo_nombre ? ' - ' + reg.modelo_nombre : ''}` : createFormData.registro_id;
                        })()
                      : "Buscar por corte o modelo..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar corte, modelo..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron registros</CommandEmpty>
                      <CommandGroup className="max-h-[250px] overflow-auto">
                        {registros.map((reg) => (
                          <CommandItem
                            key={reg.id}
                            value={`${reg.n_corte} ${reg.modelo_nombre || ''}`}
                            onSelect={() => {
                              setCreateFormData({ ...createFormData, registro_id: reg.id });
                              setRegistroPopoverOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", createFormData.registro_id === reg.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span className="font-medium">{reg.n_corte}</span>
                              {reg.modelo_nombre && <span className="text-xs text-muted-foreground">{reg.modelo_nombre}</span>}
                            </div>
                            {reg.estado && <Badge variant="outline" className="ml-auto text-xs">{reg.estado}</Badge>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Servicio *</Label>
              <Select
                value={createFormData.servicio_id}
                onValueChange={handleCreateServicioChange}
              >
                <SelectTrigger data-testid="create-select-servicio">
                  <SelectValue placeholder="Seleccionar servicio..." />
                </SelectTrigger>
                <SelectContent>
                  {servicios.map((servicio) => (
                    <SelectItem key={servicio.id} value={servicio.id}>
                      {servicio.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Persona *</Label>
              <Select
                value={createFormData.persona_id}
                onValueChange={handlePersonaChangeCreate}
                disabled={!createFormData.servicio_id}
              >
                <SelectTrigger data-testid="create-select-persona">
                  <SelectValue placeholder={createFormData.servicio_id ? "Seleccionar persona..." : "Selecciona servicio primero"} />
                </SelectTrigger>
                <SelectContent>
                  {personasFiltradasCreate.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No hay personas asignadas a este servicio
                    </SelectItem>
                  ) : (
                    personasFiltradasCreate.map((persona) => {
                      const tarifaPersona = getTarifaPersonaServicio(persona.id, createFormData.servicio_id);
                      return (
                        <SelectItem key={persona.id} value={persona.id}>
                          {persona.nombre}
                          {tarifaPersona > 0 && (
                            <span className="ml-2 text-green-600">({formatCurrency(tarifaPersona)}/prenda)</span>
                          )}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-fecha-inicio">Fecha Inicio</Label>
                <Input
                  id="create-fecha-inicio"
                  type="date"
                  value={createFormData.fecha_inicio}
                  onChange={(e) => setCreateFormData({ ...createFormData, fecha_inicio: e.target.value })}
                  data-testid="create-input-fecha-inicio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-fecha-fin">Fecha Fin</Label>
                <Input
                  id="create-fecha-fin"
                  type="date"
                  value={createFormData.fecha_fin}
                  onChange={(e) => setCreateFormData({ ...createFormData, fecha_fin: e.target.value })}
                  data-testid="create-input-fecha-fin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-fecha-esperada">Fecha Esperada</Label>
                <Input
                  id="create-fecha-esperada"
                  type="date"
                  value={createFormData.fecha_esperada_movimiento}
                  onChange={(e) => setCreateFormData({ ...createFormData, fecha_esperada_movimiento: e.target.value })}
                  data-testid="create-input-fecha-esperada"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-cantidad-enviada">Cantidad Enviada</Label>
                <NumericInput
                  id="create-cantidad-enviada"
                  min="0"
                  value={createFormData.cantidad_enviada}
                  onChange={(e) => setCreateFormData({ ...createFormData, cantidad_enviada: e.target.value })}
                  className="font-mono"
                  data-testid="create-input-cantidad-enviada"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-cantidad-recibida">Cantidad Recibida</Label>
                <NumericInput
                  id="create-cantidad-recibida"
                  min="0"
                  value={createFormData.cantidad_recibida}
                  onChange={(e) => setCreateFormData({ ...createFormData, cantidad_recibida: e.target.value })}
                  className="font-mono"
                  data-testid="create-input-cantidad-recibida"
                />
              </div>
            </div>

            {/* Mostrar diferencia (merma potencial) */}
            {createFormData.cantidad_enviada > createFormData.cantidad_recibida && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-yellow-700 dark:text-yellow-300">Diferencia (merma):</span>
                  <span className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {createFormData.cantidad_enviada - createFormData.cantidad_recibida} prendas
                  </span>
                </div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Se registrará automáticamente como merma
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="create-observaciones">Observaciones</Label>
              <Textarea
                id="create-observaciones"
                value={createFormData.observaciones}
                onChange={(e) => setCreateFormData({ ...createFormData, observaciones: e.target.value })}
                placeholder="Notas adicionales..."
                rows={2}
                data-testid="create-input-observaciones"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateSubmit}
              disabled={saving || !createFormData.registro_id || !createFormData.servicio_id || !createFormData.persona_id}
              data-testid="btn-crear-movimiento"
            >
              {saving ? 'Guardando...' : 'Crear Movimiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
