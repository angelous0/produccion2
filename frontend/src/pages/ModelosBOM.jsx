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

// ==================== TALLAS TAB ====================
export const ModelosTallasTab = ({ modeloId }) => {
  const [catalogoTallas, setCatalogoTallas] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState(new Set()); // IDs del catálogo en proceso

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

  // Solo tallas ACTIVAS se consideran asignadas
  const assignedMap = useMemo(() => {
    const m = {};
    rows.filter(r => r.activo).forEach(r => { m[r.talla_id] = r; });
    return m;
  }, [rows]);

  const toggleTalla = async (catalogTalla) => {
    const existing = assignedMap[catalogTalla.id]; // solo activas
    if (savingIds.has(catalogTalla.id)) return;

    setSavingIds(prev => new Set([...prev, catalogTalla.id]));
    try {
      if (existing) {
        // Quitar: hard delete
        await axios.delete(`${API}/modelos/${modeloId}/tallas/${existing.id}/hard`);
        setRows(prev => prev.filter(r => r.talla_id !== catalogTalla.id));
      } else {
        // Agregar (el backend hace UPSERT si había una fila inactiva)
        const res = await axios.post(`${API}/modelos/${modeloId}/tallas`, {
          talla_id: catalogTalla.id,
          orden: rows.filter(r => r.activo).length + 1,
          activo: true,
        });
        // Reemplazar fila inactiva si existe, o añadir nueva
        setRows(prev => {
          const sin = prev.filter(r => r.talla_id !== catalogTalla.id);
          return [...sin, res.data];
        });
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const status = e?.response?.status;
      if (typeof detail === 'string') {
        toast.error(detail);
      } else if (Array.isArray(detail)) {
        toast.error(detail[0]?.msg || 'Error de validación');
      } else if (status) {
        toast.error(`Error ${status}: ${e?.response?.data?.detail || e?.message || 'Error desconocido'}`);
      } else {
        toast.error(`Sin respuesta: ${e?.message || 'Error de red'}`);
      }
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(catalogTalla.id); return s; });
    }
  };

  const activasCount = rows.filter(r => r.activo).length;

  return (
    <div className="space-y-4" data-testid="tab-modelo-tallas">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Tallas del modelo</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Haz clic en una talla para activarla o desactivarla. Los cambios se guardan automáticamente.</p>
            </div>
            {activasCount > 0 && (
              <Badge variant="secondary" className="text-sm">{activasCount} asignada{activasCount !== 1 ? 's' : ''}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Cargando tallas...</div>
          ) : catalogoTallas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No hay tallas en el catálogo.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 p-1" data-testid="tallas-grid">
                {catalogoTallas.map((t) => {
                  const assigned = !!assignedMap[t.id];
                  const saving = savingIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={saving}
                      onClick={() => toggleTalla(t)}
                      data-testid={`talla-chip-${t.id}`}
                      className={`
                        relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                        border-2 transition-all duration-150 select-none
                        ${saving ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
                        ${assigned
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'}
                      `}
                    >
                      {assigned && !saving && <Check className="h-3.5 w-3.5 shrink-0" />}
                      {saving && (
                        <svg className="h-3.5 w-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      )}
                      {t.nombre}
                    </button>
                  );
                })}
              </div>

            </>
          )}
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
  const [tallasSource, setTallasSource] = useState('catalogo'); // 'modelo' | 'base' | 'catalogo'
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
        if (modeloTallas.length > 0) { setTallasSource('modelo'); return modeloTallas; }
        // 2. Tallas de la base
        if (baseTallas.length > 0) { setTallasSource('base'); return baseTallas; }
        // 3. Catálogo completo como fallback
        setTallasSource('catalogo');
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
  }, [modeloId, baseId, fetchCabeceras, fetchBomDetalle]);

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

            {/* Indicador de origen de tallas */}
            {baseId && (
              <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-fit ${tallasSource === 'base' ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'}`}>
                {tallasSource === 'base'
                  ? '✓ Tallas filtradas por la base'
                  : '⚠ Sin tallas en la base — asigna tallas a la base para filtrar'}
              </div>
            )}

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
