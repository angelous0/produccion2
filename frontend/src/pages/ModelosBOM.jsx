import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Plus, Copy, ChevronDown, ChevronUp, Package, Scissors, Truck, MoreHorizontal, GripVertical, Check } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';

import { SortableRow, SortableTableWrapper, useSortableTable } from '../components/SortableTable';
import { InventarioCombobox } from '../components/InventarioCombobox';
import { SearchableSelect } from '../components/SearchableSelect';
import { NumericInput } from '../components/ui/numeric-input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEBOUNCE_MS = 800;

const TIPOS_COMPONENTE = [
  { value: 'TELA', label: 'Tela', icon: Scissors },
  { value: 'AVIO', label: 'Avío', icon: Package },
  { value: 'SERVICIO', label: 'Servicio', icon: Truck },
  { value: 'OTRO', label: 'Otro', icon: MoreHorizontal },
];

// Mapeo tipo BOM → categoría inventario para filtrar items
const TIPO_TO_CATEGORIA = {
  'TELA': 'Telas',
  'AVIO': 'Avios',
  'SERVICIO': null, // Servicios NO usan items de inventario
  'OTRO': null, // muestra todos
};

const ESTADOS_BOM = {
  BORRADOR: { label: 'Borrador', variant: 'outline' },
  APROBADO: { label: 'Aprobado', variant: 'default' },
  INACTIVO: { label: 'Inactivo', variant: 'secondary' },
};

// ==================== TALLAS TAB (sin cambios) ====================
export const ModelosTallasTab = ({ modeloId }) => {
  const [catalogoTallas, setCatalogoTallas] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTallaIds, setSelectedTallaIds] = useState([]);
  const [verInactivas, setVerInactivas] = useState(false);
  const [addingTallas, setAddingTallas] = useState(false);
  const timersRef = useRef({});
  const [rowState, setRowState] = useState({});

  const { sensors, handleDragEnd, isSaving, modifiers } = useSortableTable(
    rows, setRows, `modelos/${modeloId}/tallas/reorder`
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [catRes, relRes] = await Promise.all([
        axios.get(`${API}/tallas-catalogo`),
        axios.get(`${API}/modelos/${modeloId}/tallas?activo=all`),
      ]);
      setCatalogoTallas(catRes.data || []);
      setRows(relRes.data || []);
    } catch {
      toast.error('Error al cargar tallas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (modeloId) fetchAll();
  }, [modeloId]);

  const availableTallas = useMemo(() => {
    const used = new Set(rows.filter((r) => r.activo).map((r) => r.talla_id));
    return (catalogoTallas || []).filter((t) => !used.has(t.id));
  }, [catalogoTallas, rows]);

  const visibleRows = useMemo(() => {
    return verInactivas ? rows : rows.filter((r) => r.activo);
  }, [rows, verInactivas]);

  const addTallas = async (e) => {
    e?.preventDefault?.();
    if (selectedTallaIds.length === 0) { toast.error('Selecciona al menos una talla'); return; }
    setAddingTallas(true);
    let added = 0;
    let errors = 0;
    for (const tallaId of selectedTallaIds) {
      try {
        const res = await axios.post(`${API}/modelos/${modeloId}/tallas`, {
          talla_id: tallaId, orden: rows.length + added + 1, activo: true,
        });
        setRows((prev) => [...prev, res.data]);
        added++;
      } catch {
        errors++;
      }
    }
    setSelectedTallaIds([]);
    if (added > 0) toast.success(`${added} talla(s) agregada(s)`);
    if (errors > 0) toast.error(`${errors} talla(s) no se pudieron agregar`);
    setAddingTallas(false);
  };

  const toggleTallaSelection = (tallaId) => {
    setSelectedTallaIds((prev) =>
      prev.includes(tallaId) ? prev.filter((id) => id !== tallaId) : [...prev, tallaId]
    );
  };

  const selectAllTallas = () => {
    if (selectedTallaIds.length === availableTallas.length) {
      setSelectedTallaIds([]);
    } else {
      setSelectedTallaIds(availableTallas.map((t) => t.id));
    }
  };

  const scheduleAutosave = (relId, payload) => {
    if (!relId) return;
    if (timersRef.current[relId]) clearTimeout(timersRef.current[relId]);
    setRowState((prev) => ({ ...prev, [relId]: 'saving' }));
    timersRef.current[relId] = setTimeout(async () => {
      try {
        await axios.put(`${API}/modelos/${modeloId}/tallas/${relId}`, payload);
        setRowState((prev) => ({ ...prev, [relId]: 'saved' }));
        setTimeout(() => setRowState((prev) => ({ ...prev, [relId]: 'idle' })), 900);
      } catch (e2) {
        setRowState((prev) => ({ ...prev, [relId]: 'error' }));
        toast.error(typeof e2?.response?.data?.detail === 'string' ? e2?.response?.data?.detail : 'Error al guardar');
      }
    }, DEBOUNCE_MS);
  };

  const hardDelete = async (r, e) => {
    e?.preventDefault?.();
    try {
      await axios.delete(`${API}/modelos/${modeloId}/tallas/${r.id}/hard`);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success('Eliminado');
    } catch (e2) {
      toast.error(typeof e2?.response?.data?.detail === 'string' ? e2?.response?.data?.detail : 'No se pudo borrar');
    }
  };

  const rowStatusLabel = (id) => {
    const s = rowState[id];
    if (s === 'saving') return 'Guardando...';
    if (s === 'saved') return 'Guardado';
    if (s === 'error') return 'Error';
    return '';
  };

  return (
    <div className="space-y-4" data-testid="tab-modelo-tallas">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Tallas del modelo</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Ver inactivas</Label>
              <Switch checked={verInactivas} onCheckedChange={setVerInactivas} data-testid="toggle-ver-inactivas-tallas" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Seleccionar tallas a agregar</Label>
            {availableTallas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Todas las tallas del catálogo ya están asignadas.</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    onClick={selectAllTallas}
                    data-testid="btn-select-all-tallas"
                  >
                    <Checkbox
                      checked={availableTallas.length > 0 && selectedTallaIds.length === availableTallas.length}
                      className="pointer-events-none h-3.5 w-3.5"
                    />
                    {selectedTallaIds.length === availableTallas.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </button>
                  {selectedTallaIds.length > 0 && (
                    <span className="text-xs text-muted-foreground">{selectedTallaIds.length} seleccionada(s)</span>
                  )}
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 border rounded-md p-2.5">
                  {availableTallas.map((t) => {
                    const checked = selectedTallaIds.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${checked ? 'bg-primary/10 border border-primary/30 font-medium' : 'hover:bg-muted border border-transparent text-muted-foreground'}`}
                        data-testid={`talla-option-${t.id}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTallaSelection(t.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span>{t.nombre}</span>
                      </label>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  onClick={addTallas}
                  disabled={selectedTallaIds.length === 0 || addingTallas}
                  className="mt-2"
                  data-testid="btn-add-talla"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {addingTallas ? 'Agregando...' : `Agregar ${selectedTallaIds.length > 0 ? `(${selectedTallaIds.length})` : ''}`}
                </Button>
              </>
            )}
          </div>

          <div className="overflow-auto">
            {isSaving && <div className="text-xs text-muted-foreground pb-2">Guardando orden...</div>}
            <SortableTableWrapper items={visibleRows} sensors={sensors} handleDragEnd={handleDragEnd} modifiers={modifiers}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead className="w-[120px]">Activo</TableHead>
                    <TableHead className="w-[140px]">Estado</TableHead>
                    <TableHead className="w-[120px]">Borrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
                  ) : visibleRows.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin tallas</TableCell></TableRow>
                  ) : visibleRows.map((r) => (
                    <SortableRow key={r.id} id={r.id}>
                      <TableCell className="font-medium">{r.talla_nombre || r.talla_id}</TableCell>
                      <TableCell>
                        <Switch checked={Boolean(r.activo)}
                          onCheckedChange={(checked) => {
                            setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, activo: checked } : x));
                            scheduleAutosave(r.id, { activo: Boolean(checked) });
                          }}
                          data-testid={`talla-activo-${r.id}`} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{rowStatusLabel(r.id)}</TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="outline" onClick={(e) => hardDelete(r, e)} data-testid={`talla-borrar-${r.id}`}>Borrar</Button>
                      </TableCell>
                    </SortableRow>
                  ))}
                </TableBody>
              </Table>
            </SortableTableWrapper>
          </div>
          <p className="text-xs text-muted-foreground">Arrastra las filas para reordenar.</p>
        </CardContent>
      </Card>
    </div>
  );
};


// ==================== BOM TAB (mejorado) ====================
export const ModelosBOMTab = ({ modeloId, lineaNegocioId, baseId }) => {
  const [cabeceras, setCabeceras] = useState([]);
  const [activeBomId, setActiveBomId] = useState(null);
  const [bomDetalle, setBomDetalle] = useState(null);
  const [costoEstandar, setCostoEstandar] = useState(null);
  const [inventario, setInventario] = useState([]);
  const [tallas, setTallas] = useState([]);
  const [serviciosProduccion, setServiciosProduccion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLineas, setLoadingLineas] = useState(false);
  const [savingEstado, setSavingEstado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [copiarDialogOpen, setCopiarDialogOpen] = useState(false);
  const [modelosParaCopiar, setModelosParaCopiar] = useState([]);
  const [copiarModeloId, setCopiarModeloId] = useState('');

  // Load initial data
  const fetchCabeceras = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/bom?modelo_id=${modeloId}`);
      setCabeceras(res.data || []);
      return res.data || [];
    } catch {
      toast.error('Error al cargar BOMs');
      return [];
    }
  }, [modeloId]);

  const fetchBomDetalle = useCallback(async (bomId) => {
    if (!bomId) return;
    setLoadingLineas(true);
    try {
      const [detRes, costoRes] = await Promise.all([
        axios.get(`${API}/bom/${bomId}`),
        axios.get(`${API}/bom/${bomId}/costo-estandar?cantidad_prendas=1`).catch(() => ({ data: null })),
      ]);
      setBomDetalle({ ...detRes.data, _originalNombre: detRes.data.nombre || '' });
      setCostoEstandar(costoRes.data);
    } catch {
      toast.error('Error al cargar detalle BOM');
    } finally {
      setLoadingLineas(false);
    }
  }, []);

  useEffect(() => {
    if (!modeloId) return;
    setLoading(true);

    Promise.all([
      fetchCabeceras(),
      axios.get(`${API}/inventario?all=true`).then(r => {
        const d = r.data;
        return Array.isArray(d) ? d : d.items || [];
      }).catch(() => []),
      Promise.all([
        axios.get(`${API}/modelos/${modeloId}/tallas?activo=true`).then(r => r.data).catch(() => []),
        baseId ? axios.get(`${API}/modelos/${baseId}/tallas?activo=true`).then(r => r.data).catch(() => []) : Promise.resolve([]),
        axios.get(`${API}/tallas-catalogo`).then(r => r.data).catch(() => []),
      ]).then(([modeloTallas, baseTallas, catalogoTallas]) => {
        // 1. Tallas propias del modelo (variante)
        if (modeloTallas.length > 0) return modeloTallas;
        // 2. Tallas de la base
        if (baseTallas.length > 0) return baseTallas;
        // 3. Catálogo completo como fallback
        return catalogoTallas.map(t => ({ talla_id: t.id, talla_nombre: t.nombre }));
      }).catch(() => []),
      axios.get(`${API}/servicios-produccion`).then(r => r.data).catch(() => []),
    ]).then(([cabs, inv, tal, servs]) => {
      setInventario(inv || []);
      setTallas(tal || []);
      setServiciosProduccion(servs || []);
      if (cabs.length > 0) {
        setActiveBomId(cabs[0].id);
        fetchBomDetalle(cabs[0].id);
      }
    }).catch((err) => {
      console.error('Error loading BOM data:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, [modeloId, fetchCabeceras, fetchBomDetalle]);

  // Create new BOM
  const crearBom = async () => {
    if (creando) return;
    setCreando(true);
    try {
      const res = await axios.post(`${API}/bom`, { modelo_id: modeloId });
      await fetchCabeceras();
      setActiveBomId(res.data.id);
      fetchBomDetalle(res.data.id);
      toast.success(`BOM v${res.data.version} creado`);
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error al crear BOM');
    } finally {
      setCreando(false);
    }
  };

  // Duplicate BOM
  const duplicarBom = async () => {
    if (!activeBomId || creando) return;
    setCreando(true);
    try {
      const res = await axios.post(`${API}/bom/${activeBomId}/duplicar`);
      await fetchCabeceras();
      setActiveBomId(res.data.id);
      fetchBomDetalle(res.data.id);
      toast.success(`BOM v${res.data.version} duplicado`);
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error al duplicar');
    } finally {
      setCreando(false);
    }
  };

  // Change BOM estado
  const cambiarEstado = async (nuevoEstado) => {
    if (!activeBomId) return;
    setSavingEstado(true);
    try {
      await axios.put(`${API}/bom/${activeBomId}`, { estado: nuevoEstado });
      setBomDetalle(prev => prev ? { ...prev, estado: nuevoEstado } : prev);
      await fetchCabeceras();
      toast.success(`Estado cambiado a ${nuevoEstado}`);
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error al cambiar estado');
    } finally {
      setSavingEstado(false);
    }
  };

  // Delete BOM
  const eliminarBom = async () => {
    if (!activeBomId || creando) return;
    if (!window.confirm('¿Eliminar este BOM y todas sus líneas?')) return;
    setCreando(true);
    try {
      await axios.delete(`${API}/bom/${activeBomId}`);
      toast.success('BOM eliminado');
      const cabs = await fetchCabeceras();
      if (cabs.length > 0) {
        setActiveBomId(cabs[0].id);
        fetchBomDetalle(cabs[0].id);
      } else {
        setActiveBomId(null);
        setBomDetalle(null);
        setCostoEstandar(null);
      }
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error al eliminar');
    } finally {
      setCreando(false);
    }
  };

  // Add line
  const addLinea = async (tipo = 'TELA') => {
    if (!activeBomId) return;
    try {
      const res = await axios.post(`${API}/bom/${activeBomId}/lineas`, {
        tipo_componente: tipo,
        cantidad_base: 1.0,
        merma_pct: 0,
      });
      setBomDetalle(prev => prev ? { ...prev, lineas: [...(prev.lineas || []), res.data] } : prev);
      toast.success('Línea agregada');
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error al agregar línea');
    }
  };

  // Update line (debounced)
  const timersRef = useRef({});
  const updateLinea = (lineaId, patch) => {
    // Optimistic update
    setBomDetalle(prev => {
      if (!prev) return prev;
      const lineas = prev.lineas.map(l => {
        if (l.id !== lineaId) return l;
        const merged = { ...l, ...patch };
        // Si cambió el inventario_id, actualizar nombre desde inventario local
        if (patch.inventario_id) {
          const inv = inventario.find(i => i.id === patch.inventario_id);
          if (inv) {
            merged.inventario_nombre = inv.nombre;
            merged.inventario_codigo = inv.codigo;
            merged.inventario_unidad = inv.unidad_medida;
          }
        }
        // Si cambió servicio_produccion_id, actualizar nombre desde servicios
        if (patch.servicio_produccion_id) {
          const srv = serviciosProduccion.find(s => s.id === patch.servicio_produccion_id);
          if (srv) {
            merged.servicio_nombre = srv.nombre;
            merged.servicio_tarifa = srv.tarifa;
          }
        }
        // Recalculate cantidad_total locally
        const base = parseFloat(merged.cantidad_base) || 0;
        const merma = parseFloat(merged.merma_pct) || 0;
        merged.cantidad_total = (base * (1 + merma / 100)).toFixed(4);
        return merged;
      });
      return { ...prev, lineas };
    });

    // Debounced save
    if (timersRef.current[lineaId]) clearTimeout(timersRef.current[lineaId]);
    timersRef.current[lineaId] = setTimeout(async () => {
      // Si cantidad_base está en el patch, validar que sea > 0 antes de enviar
      if ('cantidad_base' in patch) {
        const val = parseFloat(patch.cantidad_base);
        if (!val || val <= 0) return;
      }
      try {
        const res = await axios.put(`${API}/bom/${activeBomId}/lineas/${lineaId}`, patch);
        // Actualizar con datos completos del server (incluye inventario_nombre, etc.)
        setBomDetalle(prev => {
          if (!prev) return prev;
          return { ...prev, lineas: prev.lineas.map(l => l.id === lineaId ? { ...l, ...res.data } : l) };
        });
        // Refresh costo
        const costoRes = await axios.get(`${API}/bom/${activeBomId}/costo-estandar?cantidad_prendas=1`).catch(() => ({ data: null }));
        setCostoEstandar(costoRes.data);
      } catch (e) {
        const d = e?.response?.data?.detail;
        toast.error(typeof d === 'string' ? d : 'Error al guardar');
      }
    }, DEBOUNCE_MS);
  };

  // Delete line
  const deleteLinea = async (lineaId) => {
    try {
      await axios.delete(`${API}/bom/${activeBomId}/lineas/${lineaId}`);
      setBomDetalle(prev => prev ? { ...prev, lineas: prev.lineas.filter(l => l.id !== lineaId) } : prev);
      const costoRes = await axios.get(`${API}/bom/${activeBomId}/costo-estandar?cantidad_prendas=1`).catch(() => ({ data: null }));
      setCostoEstandar(costoRes.data);
      toast.success('Línea eliminada');
    } catch (e) {
      toast.error(typeof e?.response?.data?.detail === 'string' ? e?.response?.data?.detail : 'Error');
    }
  };

  // Mover línea arriba/abajo
  const moveLinea = (lineaId, direction) => {
    setBomDetalle(prev => {
      if (!prev) return prev;
      const arr = [...prev.lineas];
      const idx = arr.findIndex(l => l.id === lineaId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      // Guardar orden en backend (fire and forget)
      arr.forEach((l, i) => {
        axios.put(`${API}/bom/${activeBomId}/lineas/${l.id}`, { orden: i }).catch(() => {});
      });
      return { ...prev, lineas: arr };
    });
  };

  const abrirCopiarBom = async () => {
    try {
      const res = await axios.get(`${API}/modelos?all=true`);
      const modelos = res.data.filter(m => m.id !== modeloId);
      setModelosParaCopiar(modelos);
      setCopiarModeloId('');
      setCopiarDialogOpen(true);
    } catch { toast.error('Error al cargar modelos'); }
  };

  const ejecutarCopiarBom = async () => {
    if (!copiarModeloId || !activeBomId) return;
    try {
      const res = await axios.post(`${API}/modelos/${modeloId}/bom/copiar-de/${copiarModeloId}`);
      toast.success(res.data.message);
      setCopiarDialogOpen(false);
      fetchBomDetalle(activeBomId);
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al copiar BOM');
    }
  };

  const getFilteredInventario = (tipoComponente) => {
    const cat = TIPO_TO_CATEGORIA[tipoComponente];
    let filtered = inventario;
    if (cat) filtered = filtered.filter(i => i.categoria === cat);
    // Filtrar por línea: misma línea del modelo + globales (null)
    if (lineaNegocioId) {
      filtered = filtered.filter(i => !i.linea_negocio_id || i.linea_negocio_id === lineaNegocioId);
    }
    return filtered;
  };

  // Resumen
  const resumen = useMemo(() => {
    if (!bomDetalle?.lineas) return { total: 0, porTipo: {} };
    const activas = bomDetalle.lineas.filter(l => l.activo !== false);
    const porTipo = {};
    activas.forEach(l => {
      const t = l.tipo_componente || 'OTRO';
      porTipo[t] = (porTipo[t] || 0) + 1;
    });
    return { total: activas.length, porTipo };
  }, [bomDetalle]);

  const lineas = bomDetalle?.lineas || [];
  const estado = bomDetalle?.estado || 'BORRADOR';
  const estadoInfo = ESTADOS_BOM[estado] || ESTADOS_BOM.BORRADOR;

  if (loading) return <div className="py-8 text-center text-muted-foreground">Cargando BOM...</div>;

  return (
    <div className="space-y-4" data-testid="tab-modelo-bom">
      {/* Cabecera BOM */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">BOM / Receta</CardTitle>
            <div className="flex items-center gap-2">
              {cabeceras.length > 0 && (
                <Select value={activeBomId || ''} onValueChange={(v) => { setActiveBomId(v); fetchBomDetalle(v); }}>
                  <SelectTrigger className="w-[220px]" data-testid="select-bom-version">
                    <SelectValue placeholder="Seleccionar BOM" />
                  </SelectTrigger>
                  <SelectContent>
                    {cabeceras.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre || c.codigo} (v{c.version}) - {c.estado}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button type="button" size="sm" variant="outline" onClick={crearBom} disabled={creando} data-testid="btn-crear-bom">
                <Plus className="h-4 w-4 mr-1" /> {creando ? 'Creando...' : 'Nuevo BOM'}
              </Button>
              {activeBomId && (
                <Button type="button" size="sm" variant="outline" onClick={duplicarBom} disabled={creando} data-testid="btn-duplicar-bom">
                  <Copy className="h-4 w-4 mr-1" /> Duplicar
                </Button>
              )}
              {activeBomId && (
                <Button type="button" size="sm" variant="outline" onClick={abrirCopiarBom} data-testid="btn-copiar-bom-de">
                  <Copy className="h-4 w-4 mr-1" /> Copiar BOM de...
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {bomDetalle && (
          <CardContent className="space-y-4">
            {/* Estado + Info */}
            <div className="flex items-center justify-between gap-4 flex-wrap border-b pb-3">
              <div className="flex items-center gap-3">
                <Badge variant={estadoInfo.variant} data-testid="bom-estado-badge">{estadoInfo.label}</Badge>
                <input
                  type="text"
                  className="text-sm font-medium bg-transparent border-b border-dashed border-muted-foreground/30 hover:border-primary focus:border-primary focus:outline-none px-1 py-0.5 min-w-[120px] max-w-[250px]"
                  value={bomDetalle.nombre || ''}
                  placeholder="Nombre del BOM..."
                  data-testid="input-bom-nombre"
                  onChange={(e) => setBomDetalle({ ...bomDetalle, nombre: e.target.value })}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val !== (bomDetalle._originalNombre || '')) {
                      try {
                        await axios.put(`${API}/bom/${activeBomId}`, { nombre: val });
                        setBomDetalle(prev => ({ ...prev, nombre: val, _originalNombre: val }));
                        // Refresh list to show updated name
                        const res = await axios.get(`${API}/bom?modelo_id=${modeloId}`);
                        setBomCabeceras(res.data);
                      } catch {}
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {bomDetalle.codigo} | v{bomDetalle.version}
                </span>
                {bomDetalle.observaciones && (
                  <span className="text-xs text-muted-foreground italic">{bomDetalle.observaciones}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {estado === 'BORRADOR' && (
                  <Button type="button" size="sm" onClick={() => cambiarEstado('APROBADO')} disabled={savingEstado} data-testid="btn-aprobar-bom">
                    Aprobar
                  </Button>
                )}
                {estado === 'APROBADO' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => cambiarEstado('INACTIVO')} disabled={savingEstado} data-testid="btn-inactivar-bom">
                    Inactivar
                  </Button>
                )}
                {estado === 'INACTIVO' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => cambiarEstado('BORRADOR')} disabled={savingEstado}>
                    Reactivar
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={eliminarBom} disabled={creando} data-testid="btn-eliminar-bom">
                  Eliminar
                </Button>
              </div>
            </div>

            {/* Resumen por tipo + Costo estándar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Líneas: </span>
                <span className="font-medium">{resumen.total}</span>
              </div>
              {Object.entries(resumen.porTipo).map(([tipo, count]) => (
                <div key={tipo} className="text-sm">
                  <span className="text-muted-foreground">{tipo}: </span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {costoEstandar && (
                <div className="text-sm" data-testid="bom-costo-estandar">
                  <span className="text-muted-foreground">Costo est./prenda: </span>
                  <span className="font-semibold">{formatCurrency(costoEstandar.costo_estandar_unitario)}</span>
                </div>
              )}
            </div>

            {/* Tabla de líneas */}
            {loadingLineas ? (
              <div className="py-6 text-center text-muted-foreground">Cargando líneas...</div>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[90px]">Tipo</TableHead>
                      <TableHead className="min-w-[200px]">Item</TableHead>
                      <TableHead className="w-[100px]">Talla</TableHead>
                      <TableHead className="w-[110px] text-right">Cantidad</TableHead>
                      <TableHead className="w-[110px] text-right">Costo Unitario</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Sin líneas. Agrega componentes al BOM.
                        </TableCell>
                      </TableRow>
                    ) : lineas.map((l, idx) => (
                      <TableRow key={l.id} className={l.activo === false ? 'opacity-40' : ''}>
                        <TableCell>
                          <Select value={l.tipo_componente || 'TELA'}
                            onValueChange={(v) => updateLinea(l.id, { tipo_componente: v })}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`bom-tipo-${l.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIPOS_COMPONENTE.map(t => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {l.tipo_componente === 'SERVICIO' ? (
                            <Select value={l.servicio_produccion_id || ''}
                              onValueChange={(v) => updateLinea(l.id, { servicio_produccion_id: v })}>
                              <SelectTrigger className="h-8 text-xs" data-testid={`bom-servicio-${l.id}`}>
                                <SelectValue placeholder="Seleccionar servicio..." />
                              </SelectTrigger>
                              <SelectContent>
                                {serviciosProduccion.map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.nombre} {s.tarifa ? `(S/ ${Number(s.tarifa).toFixed(2)})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <InventarioCombobox
                              options={getFilteredInventario(l.tipo_componente)}
                              value={l.inventario_id}
                              onChange={(id) => updateLinea(l.id, { inventario_id: id })}
                            />
                          )}
                          {l.tipo_componente !== 'SERVICIO' && !l.inventario_nombre && l.inventario_id && (
                            <span className="text-xs text-destructive">Item no encontrado</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select value={l.talla_id || 'all'}
                            onValueChange={(v) => updateLinea(l.id, { talla_id: v === 'all' ? null : v })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Todas" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas</SelectItem>
                              {tallas.map((t) => (
                                <SelectItem key={t.talla_id} value={t.talla_id}>{t.talla_nombre}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <NumericInput min="0" step="0.0001"
                            className="text-right font-mono h-8 text-sm w-[120px]"
                            value={l.cantidad_base}
                            onChange={(e) => updateLinea(l.id, { cantidad_base: e.target.value })}
                            data-testid={`bom-cant-base-${l.id}`} />
                        </TableCell>
                        <TableCell>
                          {l.tipo_componente === 'SERVICIO' ? (
                            <NumericInput min="0" step="0.01"
                              className="text-right font-mono h-8 text-sm w-[100px]"
                              value={l.costo_manual ?? ''}
                              onChange={(e) => updateLinea(l.id, { costo_manual: e.target.value === '' ? null : parseFloat(e.target.value) })}
                              placeholder={l.servicio_tarifa ? `S/ ${Number(l.servicio_tarifa).toFixed(2)}` : 'S/ 0.00'}
                              data-testid={`bom-costo-manual-${l.id}`} />
                          ) : (
                            <span className="text-right font-mono text-sm text-muted-foreground block" data-testid={`bom-costo-inv-${l.id}`}>
                              {(() => {
                                const inv = inventario.find(i => i.id === l.inventario_id);
                                return inv ? formatCurrency(inv.costo_promedio) : '—';
                              })()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                              disabled={idx === 0}
                              onClick={() => moveLinea(l.id, -1)} title="Subir">
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                              disabled={idx === lineas.length - 1}
                              onClick={() => moveLinea(l.id, 1)} title="Bajar">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-destructive h-7 px-2"
                              onClick={() => deleteLinea(l.id)} data-testid={`bom-delete-${l.id}`}>
                              Borrar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Botones agregar línea por tipo */}
            <div className="flex gap-2 flex-wrap">
              {TIPOS_COMPONENTE.map(t => {
                const Icon = t.icon;
                return (
                  <Button key={t.value} type="button" variant="outline" size="sm"
                    onClick={() => addLinea(t.value)} data-testid={`btn-add-${t.value.toLowerCase()}`}>
                    <Icon className="h-3.5 w-3.5 mr-1" /> {t.label}
                  </Button>
                );
              })}
            </div>

            {/* Leyenda */}
            <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
              <p><strong>Talla = Todas</strong>: aplica a todas las tallas. Con talla específica, aplica solo a esa.</p>
              <p><strong>Materiales</strong> (Tela, Avío): usan items de inventario.</p>
              <p><strong>Servicios</strong>: usan el catálogo de Servicios de Producción. El costo es editable manualmente por línea.</p>
              <p><strong>Costo estándar</strong>: referencial, basado en costo promedio actual.</p>
            </div>

            {/* Desglose costo estándar */}
            {costoEstandar && costoEstandar.detalle && costoEstandar.detalle.length > 0 && (
              <Card className="bg-muted/30">
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-sm">Costo Estándar por Prenda (Referencial)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Cant. Total</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Costo/Prenda</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costoEstandar.detalle.map((d, i) => (
                        <TableRow key={i} className={d.es_opcional ? 'opacity-50' : ''}>
                          <TableCell><Badge variant="outline" className="text-xs">{d.tipo_componente}</Badge></TableCell>
                          <TableCell className="text-sm">{d.inventario_nombre || d.inventario_codigo || '?'}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNumber(d.cantidad_total)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(d.precio_unitario)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {d.es_opcional ? <span className="text-muted-foreground">{formatCurrency(d.costo_por_prenda)} (opc)</span> : formatCurrency(d.costo_por_prenda)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell colSpan={4} className="text-right font-semibold">Total estándar/prenda:</TableCell>
                        <TableCell className="text-right font-mono font-bold" data-testid="bom-costo-total">
                          {formatCurrency(costoEstandar.costo_estandar_unitario)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  {costoEstandar.costo_por_tipo && Object.keys(costoEstandar.costo_por_tipo).length > 0 && (
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {Object.entries(costoEstandar.costo_por_tipo).map(([t, v]) => (
                        <span key={t}>{t}: {formatCurrency(v)}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        )}

        {!bomDetalle && !loading && cabeceras.length === 0 && (
          <CardContent>
            <p className="text-center text-muted-foreground py-6">
              No hay BOM para este modelo. Crea uno para definir materiales estándar.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Dialog Copiar BOM de otro modelo */}
      <Dialog open={copiarDialogOpen} onOpenChange={setCopiarDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar BOM de otro modelo</DialogTitle>
            <DialogDescription>
              Selecciona el modelo del cual copiar las lineas BOM. Las lineas que ya existan no se duplicaran.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <SearchableSelect
              value={copiarModeloId}
              onValueChange={setCopiarModeloId}
              options={modelosParaCopiar.map(m => ({ id: m.id, nombre: `${m.nombre} ${m.hilo_especifico_nombre ? '(' + m.hilo_especifico_nombre + ')' : ''}`.trim() }))}
              placeholder="Buscar modelo..."
              searchPlaceholder="Buscar modelo..."
              testId="select-copiar-bom-source"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopiarDialogOpen(false)}>Cancelar</Button>
            <Button onClick={ejecutarCopiarBom} disabled={!copiarModeloId} data-testid="btn-ejecutar-copiar-bom">
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModelosBOMTab;
