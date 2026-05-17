import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '../components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../components/ui/command';
import {
  MapPin, Plus, Trash2, Edit3, Search, Power, Loader2, Save,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const LocationsIngresoProduccion = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addSearchOpen, setAddSearchOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [addForm, setAddForm] = useState({
    odoo_location_id: null,
    odoo_label: '',
    nombre: '',
    alias_grupo: '',
    notas: '',
  });

  // Edit dialog state
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/locations-ingreso-produccion`, { headers: hdrs() });
      setLocations(res.data || []);
    } catch {
      toast.error('No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // Búsqueda de stock_location en Odoo (para agregar)
  useEffect(() => {
    if (!addSearchOpen) return;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: addSearch, limit: '30' });
        const res = await axios.get(`${API}/odoo/stock-locations/buscar?${params}`, { headers: hdrs() });
        setSearchResults(res.data || []);
      } catch { setSearchResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [addSearch, addSearchOpen]);

  const resetAddForm = () => {
    setAddForm({ odoo_location_id: null, odoo_label: '', nombre: '', alias_grupo: '', notas: '' });
    setAddSearch('');
    setSearchResults([]);
  };

  const handleAdd = async () => {
    if (!addForm.odoo_location_id) { toast.error('Selecciona una location de Odoo'); return; }
    if (!addForm.nombre.trim()) { toast.error('Pon un nombre visible (ej. AP, AP-2)'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/locations-ingreso-produccion`, {
        odoo_location_id: addForm.odoo_location_id,
        nombre: addForm.nombre.trim(),
        alias_grupo: addForm.alias_grupo.trim() || null,
        activo: true,
        notas: addForm.notas.trim() || null,
      }, { headers: hdrs() });
      toast.success('Location agregada');
      setAddOpen(false);
      resetAddForm();
      fetchLocations();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await axios.patch(`${API}/locations-ingreso-produccion/${editTarget.id}`, {
        nombre: editForm.nombre,
        alias_grupo: editForm.alias_grupo || null,
        notas: editForm.notas || null,
      }, { headers: hdrs() });
      toast.success('Cambios guardados');
      setEditTarget(null);
      fetchLocations();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al guardar');
    } finally { setSaving(false); }
  };

  const handleToggle = async (loc) => {
    try {
      await axios.patch(`${API}/locations-ingreso-produccion/${loc.id}`, {
        activo: !loc.activo,
      }, { headers: hdrs() });
      toast.success(loc.activo ? 'Desactivada' : 'Activada');
      fetchLocations();
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (loc) => {
    if (!window.confirm(`¿Eliminar la location "${loc.nombre}" (Odoo #${loc.odoo_location_id})?`)) return;
    try {
      await axios.delete(`${API}/locations-ingreso-produccion/${loc.id}`, { headers: hdrs() });
      toast.success('Eliminada');
      fetchLocations();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const activas = locations.filter(l => l.activo);
  const inactivas = locations.filter(l => !l.activo);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <nav className="text-xs text-muted-foreground mb-1">Configuración</nav>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-blue-600" />
            Locations de Ingreso (Producción)
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Locations de Odoo donde un <strong>Ajuste de Inventario</strong> cuenta como ingreso de prendas
            terminadas que vienen de planta. Solo los ajustes en una de estas locations aparecen como
            candidatos al vincular un corte en el tab "PT Odoo".
          </p>
        </div>
        <Button onClick={() => { resetAddForm(); setAddOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Agregar location
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Cargando...
          </CardContent>
        </Card>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">Sin locations configuradas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Agrega al menos una (ej. la location "AP" / Almacén Principal de Odoo).
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Activas <Badge variant="outline" className="text-[10px]">{activas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-4 space-y-2">
              {activas.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Ninguna activa</p>
              )}
              {activas.map(l => (
                <LocationRow key={l.id} loc={l}
                  onEdit={() => { setEditTarget(l); setEditForm({ nombre: l.nombre, alias_grupo: l.alias_grupo || '', notas: l.notas || '' }); }}
                  onToggle={() => handleToggle(l)}
                  onDelete={() => handleDelete(l)}
                />
              ))}
            </CardContent>
          </Card>

          {inactivas.length > 0 && (
            <Card className="opacity-70">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  Inactivas <Badge variant="outline" className="text-[10px]">{inactivas.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4 space-y-2">
                {inactivas.map(l => (
                  <LocationRow key={l.id} loc={l}
                    onEdit={() => { setEditTarget(l); setEditForm({ nombre: l.nombre, alias_grupo: l.alias_grupo || '', notas: l.notas || '' }); }}
                    onToggle={() => handleToggle(l)}
                    onDelete={() => handleDelete(l)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog: Agregar */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); resetAddForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Agregar location de ingreso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Location de Odoo *</Label>
              <Popover open={addSearchOpen} onOpenChange={setAddSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs font-normal h-9 mt-1">
                    {addForm.odoo_location_id
                      ? <>{addForm.odoo_label} <span className="text-muted-foreground ml-1">#{addForm.odoo_location_id}</span></>
                      : <span className="text-muted-foreground inline-flex items-center gap-1.5"><Search className="h-3 w-3" /> Buscar location...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Buscar por nombre, x_nombre o id..." value={addSearch} onValueChange={setAddSearch} />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {searchResults.map(r => {
                          const label = r.x_nombre || r.name || `#${r.odoo_id}`;
                          const yaReg = !!r.ya_registrada_id;
                          return (
                            <CommandItem key={r.odoo_id} value={String(r.odoo_id)}
                              disabled={yaReg}
                              onSelect={() => {
                                if (yaReg) return;
                                setAddForm(f => ({
                                  ...f,
                                  odoo_location_id: r.odoo_id,
                                  odoo_label: label,
                                  nombre: f.nombre || label,
                                }));
                                setAddSearchOpen(false);
                              }}
                              className={yaReg ? 'opacity-50' : ''}
                            >
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-xs font-medium truncate">{label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  #{r.odoo_id} · {r.usage} · {r.complete_name || r.name}
                                </span>
                              </div>
                              {yaReg && (
                                <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 shrink-0 ml-2">
                                  Ya registrada
                                </Badge>
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

            <div>
              <Label className="text-xs">Nombre visible *</Label>
              <Input value={addForm.nombre} onChange={e => setAddForm({ ...addForm, nombre: e.target.value })} placeholder="Ej: AP" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Alias grupo (opcional)</Label>
              <Input value={addForm.alias_grupo} onChange={e => setAddForm({ ...addForm, alias_grupo: e.target.value })} placeholder="Para unificar varias locations bajo un mismo nombre" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Input value={addForm.notas} onChange={e => setAddForm({ ...addForm, notas: e.target.value })} placeholder="Contexto / referencia" className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => { setAddOpen(false); resetAddForm(); }}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleAdd} disabled={saving || !addForm.odoo_location_id || !addForm.nombre.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Editar location</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                Odoo location: <strong>{editTarget.location_label || '?'}</strong> · #{editTarget.odoo_location_id} ·{' '}
                <span className="font-mono">{editTarget.location_complete_name}</span>
              </div>
              <div>
                <Label className="text-xs">Nombre visible</Label>
                <Input value={editForm.nombre || ''} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Alias grupo</Label>
                <Input value={editForm.alias_grupo || ''} onChange={e => setEditForm({ ...editForm, alias_grupo: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Input value={editForm.notas || ''} onChange={e => setEditForm({ ...editForm, notas: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleEdit} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const LocationRow = ({ loc, onEdit, onToggle, onDelete }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border bg-card/60 px-3 py-2">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{loc.nombre}</span>
        <span className="text-[10px] text-muted-foreground font-mono">#{loc.odoo_location_id}</span>
        {loc.alias_grupo && (
          <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-300">
            alias: {loc.alias_grupo}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground truncate">
        Odoo: <span className="font-mono">{loc.location_label || loc.location_complete_name || '?'}</span>
        {loc.location_usage && <> · {loc.location_usage}</>}
        {loc.notas && <> · {loc.notas}</>}
      </p>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Editar">
        <Edit3 className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className={`h-7 w-7 ${loc.activo ? 'text-emerald-600' : 'text-zinc-400'}`} onClick={onToggle} title={loc.activo ? 'Desactivar' : 'Activar'}>
        <Power className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={onDelete} title="Eliminar">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
);

export default LocationsIngresoProduccion;
