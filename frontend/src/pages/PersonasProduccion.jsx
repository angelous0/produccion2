import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSaving } from '../hooks/useSaving';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Plus, Pencil, Trash2, Users, Phone, CheckCircle, XCircle, GripVertical, DollarSign, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Componente para mostrar servicios con tarifa
const ServiciosTarifaCell = ({ servicios }) => {
  if (!servicios || servicios.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  // Si es solo 1 servicio, mostrar directamente
  if (servicios.length === 1) {
    const s = servicios[0];
    return (
      <Badge variant="secondary" className="text-xs">
        {s.servicio_nombre}
        {s.tarifa > 0 && (
          <span className="ml-1 text-green-600">({formatCurrency(s.tarifa)})</span>
        )}
      </Badge>
    );
  }

  // Si hay varios servicios, mostrar un popover con tabla
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto py-1 px-2 text-xs">
          <span>{servicios.length} servicios</span>
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b bg-muted/30">
          <p className="font-semibold text-sm">Servicios y Tarifas</p>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="text-left p-2 font-medium">Servicio</th>
                <th className="text-right p-2 font-medium">Tarifa</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2">{s.servicio_nombre}</td>
                  <td className="p-2 text-right font-mono text-green-600">
                    {s.tarifa > 0 ? formatCurrency(s.tarifa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Componente de fila sorteable
const SortableRow = ({ persona, onEdit, onDelete, onToggleActivo }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: persona.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b ${isDragging ? 'bg-muted' : ''}`}
      data-testid={`persona-row-${persona.id}`}
    >
      <td className="p-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            data-testid={`drag-handle-${persona.id}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="font-medium">{persona.nombre}</span>
        </div>
      </td>
      <td className="p-3">
        <Badge variant={persona.tipo_persona === 'INTERNO' ? 'default' : 'outline'} className={`text-xs ${persona.tipo_persona === 'INTERNO' ? 'bg-blue-600' : ''}`}>
          {persona.tipo_persona === 'INTERNO' ? 'Interno' : 'Externo'}
        </Badge>
        {persona.unidad_interna_nombre && (
          <span className="ml-1 text-xs text-muted-foreground">{persona.unidad_interna_nombre}</span>
        )}
      </td>
      <td className="p-3">
        <ServiciosTarifaCell servicios={persona.servicios_detalle || []} />
      </td>
      <td className="p-3">
        {persona.telefono ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Phone className="h-3 w-3" />
            {persona.telefono}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="p-3 text-center">
        <Switch
          checked={persona.activo !== false}
          onCheckedChange={() => onToggleActivo(persona)}
          data-testid={`toggle-activo-${persona.id}`}
        />
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(persona)}
            data-testid={`edit-persona-${persona.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(persona.id)}
            data-testid={`delete-persona-${persona.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

export const PersonasProduccion = () => {
  const [personas, setPersonas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const { saving, guard } = useSaving();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    servicios: [],
    telefono: '',
    direccion: '',
    activo: true,
    orden: 0,
    tipo_persona: 'EXTERNO',
    unidad_interna_id: null,
  });
  const [filtroActivo, setFiltroActivo] = useState(null);
  const [unidadesInternas, setUnidadesInternas] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchData = async () => {
    try {
      const [personasRes, serviciosRes, uiRes] = await Promise.all([
        axios.get(`${API}/personas-produccion`),
        axios.get(`${API}/servicios-produccion`),
        axios.get(`${API}/unidades-internas`),
      ]);
      setPersonas(personasRes.data);
      setServicios(serviciosRes.data);
      setUnidadesInternas(uiRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenDialog = (persona = null) => {
    if (persona) {
      setEditingPersona(persona);
      // Convertir servicios al formato del formulario
      const serviciosForm = (persona.servicios || persona.servicios_detalle || []).map(s => ({
        servicio_id: s.servicio_id,
        tarifa: s.tarifa || 0,
      }));
      setFormData({
        nombre: persona.nombre,
        servicios: serviciosForm,
        telefono: persona.telefono || '',
        direccion: persona.direccion || '',
        activo: persona.activo !== false,
        orden: persona.orden || 0,
        tipo_persona: persona.tipo_persona || 'EXTERNO',
        unidad_interna_id: persona.unidad_interna_id || null,
      });
    } else {
      setEditingPersona(null);
      const maxOrden = personas.reduce((max, p) => Math.max(max, p.orden || 0), 0);
      setFormData({
        nombre: '',
        servicios: [],
        telefono: '',
        direccion: '',
        activo: true,
        orden: maxOrden + 1,
        tipo_persona: 'EXTERNO',
        unidad_interna_id: null,
      });
    }
    setDialogOpen(true);
  };

  const handleServicioToggle = (servicioId) => {
    const current = formData.servicios;
    const exists = current.find(s => s.servicio_id === servicioId);
    
    if (exists) {
      // Quitar servicio
      setFormData({
        ...formData,
        servicios: current.filter(s => s.servicio_id !== servicioId),
      });
    } else {
      // Agregar servicio con tarifa 0
      setFormData({
        ...formData,
        servicios: [...current, { servicio_id: servicioId, tarifa: 0 }],
      });
    }
  };

  const handleTarifaChange = (servicioId, tarifa) => {
    // Guardar como número, pero permitir strings parciales como "0." durante edición
    const numValue = tarifa === '' || tarifa === '0.' || tarifa === '0.0' || tarifa === '0.00' 
      ? tarifa 
      : (parseFloat(tarifa) || 0);
    setFormData({
      ...formData,
      servicios: formData.servicios.map(s => 
        s.servicio_id === servicioId 
          ? { ...s, tarifa: numValue }
          : s
      ),
    });
  };

  const isServicioSelected = (servicioId) => {
    return formData.servicios.some(s => s.servicio_id === servicioId);
  };

  const getServicioTarifa = (servicioId) => {
    const servicio = formData.servicios.find(s => s.servicio_id === servicioId);
    return servicio?.tarifa || 0;
  };

  const handleSubmit = guard(async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (formData.servicios.length === 0) {
      toast.error('Selecciona al menos un servicio');
      return;
    }
    // Validar duplicado por nombre (solo al crear, no al editar)
    if (!editingPersona) {
      const nombreNorm = formData.nombre.trim().toLowerCase();
      const duplicado = personas.find(p => p.nombre.trim().toLowerCase() === nombreNorm);
      if (duplicado) {
        toast.warning(`Ya existe una persona con el nombre "${duplicado.nombre}". Verifica si es la misma antes de crear.`);
        return;
      }
    }

    try {
      if (editingPersona) {
        await axios.put(`${API}/personas-produccion/${editingPersona.id}`, formData);
        toast.success('Persona actualizada');
      } else {
        await axios.post(`${API}/personas-produccion`, formData);
        toast.success('Persona creada');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    }
  });

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta persona?')) return;
    try {
      await axios.delete(`${API}/personas-produccion/${id}`);
      toast.success('Persona eliminada');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al eliminar');
    }
  };

  const handleToggleActivo = async (persona) => {
    try {
      await axios.put(`${API}/personas-produccion/${persona.id}`, {
        nombre: persona.nombre,
        servicios: persona.servicios || [],
        telefono: persona.telefono || '',
        direccion: persona.direccion || '',
        activo: !persona.activo,
        orden: persona.orden || 0,
      });
      toast.success(persona.activo ? 'Persona desactivada' : 'Persona activada');
      fetchData();
    } catch (error) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = personasFiltradas.findIndex((p) => p.id === active.id);
      const newIndex = personasFiltradas.findIndex((p) => p.id === over.id);

      const newPersonas = arrayMove(personasFiltradas, oldIndex, newIndex);
      
      const updatedPersonas = newPersonas.map((p, index) => ({
        ...p,
        orden: index + 1,
      }));
      
      setPersonas(prev => {
        const otrasPersonas = prev.filter(p => !updatedPersonas.find(up => up.id === p.id));
        return [...updatedPersonas, ...otrasPersonas].sort((a, b) => (a.orden || 0) - (b.orden || 0));
      });

      try {
        await Promise.all(
          updatedPersonas.map((p) =>
            axios.put(`${API}/personas-produccion/${p.id}`, {
              nombre: p.nombre,
              servicios: p.servicios || [],
              telefono: p.telefono || '',
              direccion: p.direccion || '',
              activo: p.activo !== false,
              orden: p.orden,
            })
          )
        );
        toast.success('Orden actualizado');
      } catch (error) {
        toast.error('Error al actualizar orden');
        fetchData();
      }
    }
  };

  const personasFiltradas = filtroActivo === null 
    ? personas 
    : personas.filter(p => p.activo === filtroActivo);

  return (
    <div className="space-y-6" data-testid="personas-produccion-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Personas de Producción
          </h2>
          <p className="text-muted-foreground">
            Gestiona el personal con sus tarifas por servicio. Arrastra para reordenar.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="btn-nueva-persona">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Persona
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">{personasFiltradas.length} personas</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant={filtroActivo === null ? "default" : "outline"} 
              size="sm"
              onClick={() => setFiltroActivo(null)}
            >
              Todos
            </Button>
            <Button 
              variant={filtroActivo === true ? "default" : "outline"} 
              size="sm"
              onClick={() => setFiltroActivo(true)}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Activos
            </Button>
            <Button 
              variant={filtroActivo === false ? "default" : "outline"} 
              size="sm"
              onClick={() => setFiltroActivo(false)}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Inactivos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : personasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay personas registradas
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="p-3 text-left text-sm font-semibold">Nombre</th>
                    <th className="p-3 text-left text-sm font-semibold">Tipo</th>
                    <th className="p-3 text-left text-sm font-semibold">Servicios (Tarifa)</th>
                    <th className="p-3 text-left text-sm font-semibold">Teléfono</th>
                    <th className="p-3 text-center text-sm font-semibold">Estado</th>
                    <th className="p-3 text-right text-sm font-semibold w-[120px]">Acciones</th>
                  </tr>
                </thead>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={personasFiltradas.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {personasFiltradas.map((persona) => (
                        <SortableRow
                          key={persona.id}
                          persona={persona}
                          onEdit={handleOpenDialog}
                          onDelete={handleDelete}
                          onToggleActivo={handleToggleActivo}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPersona ? 'Editar Persona' : 'Nueva Persona'}
            </DialogTitle>
            <DialogDescription>
              {editingPersona 
                ? 'Modifica los datos de la persona'
                : 'Registra una nueva persona de producción'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Nombre completo"
                data-testid="input-nombre-persona"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  placeholder="Número de teléfono"
                  data-testid="input-telefono-persona"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Dirección para guías"
                  data-testid="input-direccion-persona"
                />
              </div>
            </div>

            {/* Tipo Persona e Unidad Interna */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo Persona</Label>
                <Select value={formData.tipo_persona} onValueChange={(v) => setFormData({ ...formData, tipo_persona: v, unidad_interna_id: v === 'EXTERNO' ? null : formData.unidad_interna_id })}>
                  <SelectTrigger data-testid="select-tipo-persona">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTERNO">Interno</SelectItem>
                    <SelectItem value="EXTERNO">Externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.tipo_persona === 'INTERNO' && (
                <div className="space-y-2">
                  <Label>Unidad Interna</Label>
                  <Select value={formData.unidad_interna_id ? String(formData.unidad_interna_id) : ''} onValueChange={(v) => setFormData({ ...formData, unidad_interna_id: v ? parseInt(v) : null })}>
                    <SelectTrigger data-testid="select-unidad-interna">
                      <SelectValue placeholder="Seleccionar unidad..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesInternas.map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Servicios y Tarifas *</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Selecciona los servicios e ingresa la tarifa por prenda para cada uno
              </p>
              <div className="border rounded-lg p-3 space-y-3 max-h-[250px] overflow-y-auto">
                {servicios.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay servicios registrados
                  </p>
                ) : (
                  servicios.map((servicio) => (
                    <div key={servicio.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`servicio-${servicio.id}`}
                          checked={isServicioSelected(servicio.id)}
                          onCheckedChange={() => handleServicioToggle(servicio.id)}
                          data-testid={`checkbox-servicio-${servicio.id}`}
                        />
                        <Label 
                          htmlFor={`servicio-${servicio.id}`}
                          className="cursor-pointer flex-1 font-medium"
                        >
                          {servicio.nombre}
                        </Label>
                      </div>
                      {isServicioSelected(servicio.id) && (
                        <div className="ml-6 flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-green-600" />
                          <NumericInput
                            min="0"
                            step="any"
                            value={getServicioTarifa(servicio.id)}
                            onChange={(e) => handleTarifaChange(servicio.id, e.target.value)}
                            placeholder="Tarifa por prenda"
                            className="font-mono w-32"
                            data-testid={`input-tarifa-${servicio.id}`}
                          />
                          <span className="text-xs text-muted-foreground">por prenda</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                data-testid="switch-activo-persona"
              />
              <Label htmlFor="activo">Persona activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving} data-testid="btn-guardar-persona">
              {editingPersona ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
