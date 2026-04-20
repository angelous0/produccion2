import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '../components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { SearchableSelect } from './SearchableSelect';
import {
  Package, PackageCheck, PackageMinus, PackageX, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Plus, Trash2, BookOpen,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Search, Layers, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from './ui/numeric-input';
import CopiarDesdeRegistroDialog from './registro/CopiarDesdeRegistroDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper: extract error message safely (avoid rendering objects as React children)
const getErrorMsg = (err, fallback = 'Error') => {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (detail.errores && Array.isArray(detail.errores)) return detail.errores.join(', ');
  if (detail.message) return detail.message;
  return JSON.stringify(detail);
};

/** Modal para seleccionar rollos y cantidades */
const RollosModal = ({ open, linea, rollosCantidades, setRollosCantidades, onClose, search, setSearch, filtroAncho, setFiltroAncho, filtroTono, setFiltroTono }) => {
  const rollos = linea?.rollos_disponibles || [];
  const pendiente = parseFloat(linea?.pendiente) || 0;

  // Valores únicos para filtros
  const anchosUnicos = useMemo(() => [...new Set(rollos.map(r => r.ancho).filter(Boolean))].sort((a, b) => a - b), [rollos]);
  const tonosUnicos = useMemo(() => [...new Set(rollos.map(r => r.tono).filter(Boolean))].sort(), [rollos]);

  // Filtrar rollos
  const rollosFiltrados = useMemo(() => {
    return rollos.filter(r => {
      if (filtroAncho !== 'todos' && String(r.ancho) !== filtroAncho) return false;
      if (filtroTono !== 'todos' && r.tono !== filtroTono) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchNum = String(r.numero_rollo || '').toLowerCase().includes(q);
        const matchTono = String(r.tono || '').toLowerCase().includes(q);
        const matchAncho = String(r.ancho || '').includes(q);
        if (!matchNum && !matchTono && !matchAncho) return false;
      }
      return true;
    });
  }, [rollos, filtroAncho, filtroTono, search]);

  const sumaTotal = rollos.reduce((s, r) => s + (parseFloat(rollosCantidades[r.id]) || 0), 0);

  const seleccionarTodo = (rollo) => {
    setRollosCantidades(prev => ({ ...prev, [rollo.id]: rollo.metraje_disponible }));
  };
  const limpiarRollo = (rollo) => {
    setRollosCantidades(prev => ({ ...prev, [rollo.id]: '' }));
  };
  const seleccionarTodosFiltrados = () => {
    const nuevos = { ...rollosCantidades };
    let restante = pendiente - sumaTotal + rollosFiltrados.reduce((s, r) => s + (parseFloat(rollosCantidades[r.id]) || 0), 0);
    rollosFiltrados.forEach(r => {
      if (restante <= 0) { nuevos[r.id] = ''; return; }
      const usar = Math.min(restante, r.metraje_disponible);
      nuevos[r.id] = usar;
      restante -= usar;
    });
    setRollosCantidades(nuevos);
  };
  const limpiarTodos = () => {
    const nuevos = { ...rollosCantidades };
    rollos.forEach(r => { nuevos[r.id] = ''; });
    setRollosCantidades(nuevos);
  };

  if (!linea) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[700px] max-h-[85vh] flex flex-col" data-testid="modal-rollos">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            Seleccionar Rollos — {linea.item_nombre}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pendiente: <span className="font-semibold text-yellow-600">{pendiente.toFixed(1)}</span> {linea.item_unidad}
            {sumaTotal > 0 && <> · Seleccionado: <span className="font-semibold text-blue-600">{sumaTotal.toFixed(1)}</span></>}
          </p>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-8 text-xs" placeholder="Buscar rollo, tono, ancho..."
                value={search} onChange={e => setSearch(e.target.value)} data-testid="input-buscar-rollo" />
            </div>
          </div>
          {anchosUnicos.length > 1 && (
            <div>
              <Select value={filtroAncho} onValueChange={setFiltroAncho}>
                <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="filtro-ancho">
                  <SelectValue placeholder="Ancho" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos anchos</SelectItem>
                  {anchosUnicos.map(a => <SelectItem key={a} value={String(a)}>{a} cm</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {tonosUnicos.length > 1 && (
            <div>
              <Select value={filtroTono} onValueChange={setFiltroTono}>
                <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="filtro-tono">
                  <SelectValue placeholder="Tono" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos tonos</SelectItem>
                  {tonosUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Tabla de rollos */}
        <div className="flex-1 overflow-y-auto border rounded-md" onWheel={(e) => e.stopPropagation()}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Ancho</TableHead>
                <TableHead>Tono</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="w-[130px] text-center">Cantidad</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rollosFiltrados.map(r => {
                const cant = parseFloat(rollosCantidades[r.id]) || 0;
                return (
                  <TableRow key={r.id} className={cant > 0 ? 'bg-blue-50/50' : ''} data-testid={`rollo-row-${r.id}`}>
                    <TableCell className="font-mono text-xs">{r.numero_rollo || '-'}</TableCell>
                    <TableCell className="text-sm">{r.ancho ? `${r.ancho} cm` : '-'}</TableCell>
                    <TableCell className="text-sm">{r.tono || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{r.metraje_disponible.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      <NumericInput
                        className="h-7 w-[110px] text-center font-mono text-sm"
                        min={0} max={r.metraje_disponible} step={0.1}
                        value={rollosCantidades[r.id] || ''}
                        onChange={(e) => setRollosCantidades(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="0"
                        data-testid={`input-rollo-${r.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      {cant > 0 ? (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-1" onClick={() => limpiarRollo(r)}>
                          Quitar
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-1 text-blue-600" onClick={() => seleccionarTodo(r)}>
                          Todo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rollosFiltrados.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No hay rollos que coincidan</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={seleccionarTodosFiltrados}>
              Llenar pendiente FIFO
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={limpiarTodos}>
              Limpiar todo
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono">
              Total: <span className={`font-bold ${sumaTotal > 0 ? 'text-blue-700' : 'text-muted-foreground'}`}>{sumaTotal.toFixed(1)}</span>
              <span className="text-muted-foreground"> / {pendiente.toFixed(1)}</span>
            </span>
            <Button type="button" size="sm" onClick={onClose} data-testid="btn-confirmar-rollos">
              Confirmar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MaterialesTab = ({ registroId, totalPrendas, totalPrendasOriginales, modeloId, lineaNegocioId, lineasNegocio = [] }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Cantidades a reservar/dar salida por línea
  const [cantidades, setCantidades] = useState({});
  const [accion, setAccion] = useState('salida'); // 'reservar' o 'salida'

  // Modo extra: agregar items no incluidos en BOM
  const [modoExtra, setModoExtra] = useState(false);
  const [inventario, setInventario] = useState([]);
  const [extraItem, setExtraItem] = useState(null);
  const [extraCantidad, setExtraCantidad] = useState('');

  // Historial colapsable
  const [histReservasOpen, setHistReservasOpen] = useState(false);
  const [histSalidasOpen, setHistSalidasOpen] = useState(false);

  // Modal de rollos
  const [rollosModal, setRollosModal] = useState({ open: false, linea: null });
  const [rollosSearch, setRollosSearch] = useState('');
  const [rollosFiltroAncho, setRollosFiltroAncho] = useState('todos');
  const [rollosFiltroTono, setRollosFiltroTono] = useState('todos');
  // Cantidades por rollo: { "rollo_id": cantidad }
  const [rollosCantidades, setRollosCantidades] = useState({});

  // Copiar desde otro registro
  const [copiarOpen, setCopiarOpen] = useState(false);

  // Modal agregar material manual
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState(null);
  const [manualCantidad, setManualCantidad] = useState('');
  const [manualObs, setManualObs] = useState('');
  const [manualGuardando, setManualGuardando] = useState(false);

  // Modo migración
  const [modoMigracion, setModoMigracion] = useState(false);
  useEffect(() => {
    axios.get(`${API}/configuracion/modo-migracion`)
      .then(r => setModoMigracion(r.data?.activo === true))
      .catch(() => {});
  }, []);

  // BOM selector
  const [boms, setBoms] = useState([]);
  const [selectedBomId, setSelectedBomId] = useState(null);
  const [bomsLoading, setBomsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/registros/${registroId}/materiales`);
      setData(res.data);
    } catch (err) {
      toast.error('Error al cargar materiales');
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cargar BOMs del modelo
  useEffect(() => {
    if (!modeloId) return;
    setBomsLoading(true);
    axios.get(`${API}/bom?modelo_id=${modeloId}`)
      .then(res => {
        const list = res.data || [];
        setBoms(list);
        // Auto-seleccionar: APROBADO primero, sino el más reciente
        const aprobado = list.find(b => b.estado === 'APROBADO');
        if (aprobado) setSelectedBomId(aprobado.id);
        else if (list.length > 0) setSelectedBomId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setBomsLoading(false));
  }, [modeloId]);

  const generarRequerimiento = async () => {
    setGenerando(true);
    try {
      const params = selectedBomId ? `?bom_id=${selectedBomId}` : '';
      const res = await axios.post(`${API}/registros/${registroId}/generar-requerimiento${params}`);
      const bomInfo = res.data.bom_usado ? ` (${res.data.bom_usado.codigo} v${res.data.bom_usado.version})` : '';
      toast.success(`Requerimiento generado${bomInfo}: ${res.data.lineas_creadas} líneas creadas, ${res.data.lineas_actualizadas} actualizadas`);
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al generar requerimiento'));
    } finally {
      setGenerando(false);
    }
  };

  const setCantidad = (lineaKey, value) => {
    setCantidades(prev => ({ ...prev, [lineaKey]: value }));
  };

  const getLineaKey = (l) => `${l.item_id}_${l.talla_id || 'null'}`;

  const ejecutarReserva = async () => {
    const lineas = Object.entries(cantidades)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([key, cantidad]) => {
        const [item_id, talla_id] = key.split('_');
        return { item_id, talla_id: talla_id === 'null' ? null : talla_id, cantidad: parseFloat(cantidad) };
      });
    if (!lineas.length) return toast.error('Ingresa cantidades a reservar');
    setProcesando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/reservas`, { lineas });
      toast.success('Reserva creada');
      setCantidades({});
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al crear reserva'));
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarSalida = async () => {
    // Items sin control de rollos
    const lineasNormales = Object.entries(cantidades)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([key, cantidad]) => {
        const [item_id, talla_id] = key.split('_');
        return { item_id, talla_id: talla_id === 'null' ? null : talla_id, cantidad: parseFloat(cantidad) };
      });
    // Items con rollos
    const lineasRollos = Object.entries(rollosCantidades)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([rollo_id, cantidad]) => {
        // Buscar a qué item pertenece este rollo
        const linea = data?.lineas?.find(l => l.rollos_disponibles?.some(r => r.id === rollo_id));
        return {
          item_id: linea?.item_id,
          talla_id: linea?.talla_id || null,
          rollo_id,
          cantidad: parseFloat(cantidad),
        };
      }).filter(l => l.item_id);

    const todas = [...lineasNormales, ...lineasRollos];
    if (!todas.length) return toast.error('Ingresa cantidades para dar salida');
    setProcesando(true);
    let ok = 0, errores = [];
    try {
      for (const l of todas) {
        try {
          await axios.post(`${API}/inventario-salidas`, {
            item_id: l.item_id,
            cantidad: l.cantidad,
            registro_id: registroId,
            talla_id: l.talla_id,
            rollo_id: l.rollo_id || null,
            fecha: new Date().toISOString(),
            observaciones: 'Salida desde Materiales OP',
          });
          ok++;
        } catch (err) {
          errores.push(getErrorMsg(err, 'Error desconocido'));
        }
      }
      if (ok > 0) toast.success(`${ok} salida(s) registrada(s)`);
      if (errores.length > 0) toast.error(`${errores.length} error(es): ${errores[0]}`);
      setCantidades({});
      setRollosCantidades({});
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al registrar salida'));
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarSalidaExtra = async () => {
    if (!extraItem || !extraCantidad) return toast.error('Selecciona item y cantidad');
    setProcesando(true);
    try {
      await axios.post(`${API}/inventario-salidas`, {
        item_id: extraItem,
        cantidad: parseFloat(extraCantidad),
        registro_id: registroId,
        fecha: new Date().toISOString(),
        observaciones: 'Salida extra (fuera de BOM)',
      });
      toast.success('Salida extra registrada');
      setExtraItem(null);
      setExtraCantidad('');
      setModoExtra(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al registrar salida extra'));
    } finally {
      setProcesando(false);
    }
  };

  const anularReserva = async (reservaId) => {
    try {
      await axios.delete(`${API}/reservas/${reservaId}`);
      toast.success('Reserva anulada');
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al anular reserva'));
    }
  };

  const anularSalida = async (salidaId) => {
    if (!window.confirm('¿Anular esta salida? El stock será restaurado al inventario.')) return;
    try {
      await axios.delete(`${API}/inventario-salidas/${salidaId}`);
      toast.success('Salida anulada y stock restaurado');
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al anular salida'));
    }
  };

  const llenarPendientes = () => {
    if (!data?.lineas) return;
    const nuevas = {};
    data.lineas.forEach(l => {
      const pendiente = parseFloat(l.pendiente) || 0;
      if (pendiente > 0) {
        nuevas[getLineaKey(l)] = pendiente;
      }
    });
    setCantidades(nuevas);
  };

  const llenarReservado = () => {
    if (!data?.lineas) return;
    const nuevas = {};
    data.lineas.forEach(l => {
      const reservado = parseFloat(l.cantidad_reservada) || 0;
      const consumido = parseFloat(l.cantidad_consumida) || 0;
      const porConsumir = Math.max(0, reservado - consumido);
      if (porConsumir > 0) {
        nuevas[getLineaKey(l)] = porConsumir;
      }
    });
    setCantidades(nuevas);
    setAccion('salida');
  };

  // Cargar inventario para modo extra (filtrado por línea de negocio)
  const loadInventarioExtra = async () => {
    if (inventario.length) { setModoExtra(true); return; }
    try {
      const res = await axios.get(`${API}/inventario?all=true`);
      const items = Array.isArray(res.data) ? res.data : res.data.items || [];
      setInventario(items);
      setModoExtra(true);
    } catch { toast.error('Error al cargar inventario'); }
  };

  const openManualModal = async () => {
    if (!inventario.length) {
      try {
        const res = await axios.get(`${API}/inventario?all=true`);
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setInventario(items);
      } catch { toast.error('Error al cargar inventario'); return; }
    }
    setManualItem(null);
    setManualCantidad('');
    setManualObs('');
    setManualOpen(true);
  };

  const guardarManual = async () => {
    if (!manualItem || !manualCantidad || parseFloat(manualCantidad) <= 0) {
      return toast.error('Selecciona un item e ingresa cantidad');
    }
    setManualGuardando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/requerimiento-manual`, {
        item_id: manualItem,
        cantidad: parseFloat(manualCantidad),
        observaciones: manualObs,
      });
      toast.success('Material agregado y stock descontado');
      setManualOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al agregar material'));
    } finally {
      setManualGuardando(false);
    }
  };

  const eliminarManual = async (lineaId) => {
    if (!window.confirm('¿Eliminar esta línea de material manual?')) return;
    try {
      await axios.delete(`${API}/registros/${registroId}/requerimiento-manual/${lineaId}`);
      toast.success('Línea manual eliminada');
      fetchData();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al eliminar'));
    }
  };

  // Filtrar inventario por línea de negocio del registro
  const inventarioFiltrado = useMemo(() => {
    if (!lineaNegocioId) return inventario;
    return inventario.filter(i =>
      !i.linea_negocio_id || i.linea_negocio_id === lineaNegocioId
    );
  }, [inventario, lineaNegocioId]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /> <span className="ml-2">Cargando materiales...</span></div>;
  }

  const tieneReq = data?.tiene_requerimiento;
  const lineas = data?.lineas || [];
  const resumen = data?.resumen || {};
  const reservas = data?.reservas || [];
  const salidas = data?.salidas || [];
  const reservasActivas = reservas.filter(r => r.estado === 'ACTIVA');
  const lineaNombre = lineaNegocioId ? lineasNegocio.find(l => l.id === lineaNegocioId)?.nombre : null;

  return (
    <div className="space-y-4" data-testid="materiales-tab">
      {/* Header con acciones */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-base">Materiales de la OP</h4>
        <div className="flex items-center gap-2 flex-wrap">
          {boms.length > 1 && (
            <Select value={selectedBomId || ''} onValueChange={setSelectedBomId}>
              <SelectTrigger className="w-[200px] h-8 text-xs" data-testid="select-bom-materiales">
                <SelectValue placeholder="Seleccionar BOM" />
              </SelectTrigger>
              <SelectContent>
                {boms.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.codigo} (v{b.version}) {b.estado === 'APROBADO' ? '✓' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {boms.length === 1 && (
            <span className="text-xs text-muted-foreground border rounded px-2 py-1">
              {boms[0].codigo} (v{boms[0].version}) — {boms[0].estado}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={fetchData} data-testid="btn-refresh-materiales">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
          </Button>
          <Button type="button" size="sm" onClick={generarRequerimiento} disabled={generando || totalPrendas <= 0 || (boms.length > 0 && !selectedBomId)}
            data-testid="btn-generar-req"
          >
            {generando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
            {tieneReq ? 'Regenerar desde BOM' : 'Generar desde BOM'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openManualModal} data-testid="btn-agregar-manual">
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar manualmente
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCopiarOpen(true)} data-testid="btn-copiar-materiales">
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar desde otro
          </Button>
        </div>
      </div>

      {/* Filtro por línea de negocio */}
      <p className="text-xs text-muted-foreground">
        {lineaNombre
          ? <>Mostrando items de: <Badge variant="outline" className="text-[10px] py-0 px-1.5">{lineaNombre}</Badge></>
          : 'Mostrando todos los items'}
      </p>

      {/* Resumen rápido */}
      {tieneReq && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="py-2">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Requerido</p>
              <p className="text-lg font-bold" data-testid="resumen-requerido">{resumen.total_requerido?.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className="py-2">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Reservado</p>
              <p className="text-lg font-bold text-blue-600" data-testid="resumen-reservado">{resumen.total_reservado?.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className="py-2">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Consumido</p>
              <p className="text-lg font-bold text-green-600" data-testid="resumen-consumido">{resumen.total_consumido?.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className={`py-2 ${resumen.total_pendiente > 0 ? 'border-yellow-500/50' : 'border-green-500/50'}`}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Pendiente</p>
              <p className={`text-lg font-bold ${resumen.total_pendiente > 0 ? 'text-yellow-600' : 'text-green-600'}`}
                data-testid="resumen-pendiente">{resumen.total_pendiente?.toFixed(1)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sin requerimiento */}
      {!tieneReq && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="font-medium">Sin requerimiento de materiales</p>
            <p className="text-sm text-muted-foreground mt-1">
              {totalPrendas > 0
                ? 'Haz click en "Generar desde BOM" para calcular los materiales necesarios, o "Agregar manualmente" para añadir items sin BOM.'
                : 'Primero define las cantidades por talla en la pestaña Tallas, o usa "Agregar manualmente" para añadir materiales.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabla unificada */}
      {tieneReq && lineas.length > 0 && (
        <Card>
          <CardContent className="p-0">
            {/* Selector de acción y botón llenar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Accion:</Label>
                <div className="flex rounded-md border overflow-hidden">
                  <button type="button"
                    className={`px-3 py-1 text-xs font-medium transition-colors ${accion === 'salida' ? 'bg-green-600 text-white' : 'bg-background hover:bg-muted'}`}
                    onClick={() => setAccion('salida')} data-testid="btn-modo-salida"
                  >
                    <ArrowUpCircle className="h-3 w-3 inline mr-1" />Dar Salida
                  </button>
                  <button type="button"
                    className={`px-3 py-1 text-xs font-medium transition-colors ${accion === 'reservar' ? 'bg-blue-600 text-white' : 'bg-background hover:bg-muted'}`}
                    onClick={() => setAccion('reservar')} data-testid="btn-modo-reservar"
                  >
                    <PackageCheck className="h-3 w-3 inline mr-1" />Reservar
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {resumen.total_reservado > resumen.total_consumido && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                    onClick={llenarReservado} data-testid="btn-consumir-reservado"
                  >
                    <ArrowDownCircle className="h-3 w-3 mr-1" />Consumir reservado
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={llenarPendientes}
                  data-testid="btn-llenar-pendientes"
                >
                  Llenar pendientes
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCantidades({}); setRollosCantidades({}); }}
                  data-testid="btn-limpiar-cantidades"
                >
                  Limpiar
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead className="text-right">Req.</TableHead>
                    <TableHead className="text-right">Reserv.</TableHead>
                    <TableHead className="text-right">Salido</TableHead>
                    <TableHead className="text-right">Pend.</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="w-[120px] text-center">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l) => {
                    const key = getLineaKey(l);
                    const pendiente = parseFloat(l.pendiente) || 0;
                    const completo = pendiente <= 0;
                    const tieneRollos = l.control_por_rollos && l.rollos_disponibles?.length > 0;
                    // Calcular suma de rollos seleccionados para este item
                    const sumaRollos = tieneRollos
                      ? l.rollos_disponibles.reduce((s, r) => s + (parseFloat(rollosCantidades[r.id]) || 0), 0)
                      : 0;
                    const rollosUsados = tieneRollos
                      ? l.rollos_disponibles.filter(r => parseFloat(rollosCantidades[r.id]) > 0).length
                      : 0;
                    return (
                      <TableRow key={key} className={completo ? 'opacity-50' : ''} data-testid={`material-row-${key}`}>
                        <TableCell>
                          <div className="flex items-start gap-1">
                            <div>
                              <span className="text-sm font-medium">{l.item_nombre}</span>
                              {l.origen === 'MANUAL' && <Badge variant="secondary" className="ml-1.5 text-[10px] py-0 px-1">Manual</Badge>}
                              <span className="block text-xs text-muted-foreground font-mono">
                                {l.item_codigo} · {l.item_unidad}
                                {tieneRollos && <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">Rollos: {l.rollos_disponibles.length}</Badge>}
                              </span>
                            </div>
                            {l.origen === 'MANUAL' && parseFloat(l.cantidad_consumida) === 0 && parseFloat(l.cantidad_reservada) === 0 && (
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                                onClick={() => eliminarManual(l.id)} data-testid={`btn-eliminar-manual-${l.id}`}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {l.talla_nombre ? <Badge variant="outline" className="text-xs">{l.talla_nombre}</Badge> : <span className="text-xs text-muted-foreground">General</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{parseFloat(l.cantidad_requerida).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-600">{parseFloat(l.cantidad_reservada).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">{parseFloat(l.cantidad_consumida).toFixed(1)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${completo ? 'text-green-600' : 'text-yellow-600'}`}>
                          {completo ? <PackageCheck className="h-4 w-4 inline text-green-600" /> : pendiente.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{l.disponible?.toFixed(1) || '-'}</TableCell>
                        <TableCell className="text-center">
                          {!completo && (!tieneRollos || accion === 'reservar') && (
                            <NumericInput
                              className="h-7 w-[100px] text-center font-mono text-sm"
                              min={0} step={1}
                              value={cantidades[key] || ''}
                              onChange={(e) => setCantidad(key, e.target.value)}
                              placeholder="0"
                              data-testid={`input-cantidad-${key}`}
                            />
                          )}
                          {!completo && tieneRollos && accion === 'salida' && (
                            <Button type="button" variant="outline" size="sm"
                              className={`h-7 text-xs font-mono ${sumaRollos > 0 ? 'border-blue-400 text-blue-700 bg-blue-50' : ''}`}
                              onClick={() => { setRollosModal({ open: true, linea: l }); setRollosSearch(''); setRollosFiltroAncho('todos'); setRollosFiltroTono('todos'); }}
                              data-testid={`btn-seleccionar-rollos-${key}`}
                            >
                              <Layers className="h-3 w-3 mr-1" />
                              {sumaRollos > 0 ? `${sumaRollos.toFixed(1)} (${rollosUsados} rollos)` : 'Seleccionar rollos'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Botón de acción */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <Button type="button" variant="outline" size="sm" onClick={loadInventarioExtra} data-testid="btn-salida-extra">
                <Plus className="h-3.5 w-3.5 mr-1" /> Salida extra (fuera de BOM)
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={procesando || (Object.values(cantidades).every(v => !v || parseFloat(v) <= 0) && Object.values(rollosCantidades).every(v => !v || parseFloat(v) <= 0))}
                onClick={accion === 'salida' ? ejecutarSalida : ejecutarReserva}
                className={accion === 'salida' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
                data-testid="btn-ejecutar-accion"
              >
                {procesando && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                {accion === 'salida' ? (
                  <><ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Dar Salida</>
                ) : (
                  <><PackageCheck className="h-3.5 w-3.5 mr-1" /> Reservar</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Salida Extra */}
      {modoExtra && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Salida extra (fuera de BOM)</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModoExtra(false)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs">Item</Label>
                <SearchableSelect
                  value={extraItem}
                  onValueChange={setExtraItem}
                  options={inventarioFiltrado.filter(i => i.tipo_item === 'MP')}
                  placeholder="Buscar item..."
                  searchPlaceholder="Buscar por nombre o codigo..."
                  testId="combobox-extra-item"
                  renderOption={(o) => <><span className="font-mono text-xs mr-2 text-muted-foreground">{o.codigo}</span><span className="truncate">{o.nombre}</span></>}
                />
              </div>
              <div className="w-[120px]">
                <Label className="text-xs">Cantidad</Label>
                <NumericInput min={0} step={1} value={extraCantidad} onChange={(e) => setExtraCantidad(e.target.value)}
                  className="h-9" placeholder="0" data-testid="input-extra-cantidad" />
              </div>
              <Button type="button" size="sm" className="bg-green-600 hover:bg-green-700" disabled={procesando}
                onClick={ejecutarSalidaExtra} data-testid="btn-ejecutar-extra"
              >
                Dar Salida
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial Reservas */}
      {reservas.length > 0 && (
        <Collapsible open={histReservasOpen} onOpenChange={setHistReservasOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="w-full justify-between px-3 h-9">
              <span className="text-sm font-medium">
                Reservas ({reservas.length}) {reservasActivas.length > 0 && <Badge className="ml-1 text-xs">{reservasActivas.length} activas</Badge>}
              </span>
              {histReservasOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {reservas.map(r => (
              <Card key={r.id} className={r.estado !== 'ACTIVA' ? 'opacity-50' : ''}>
                <CardContent className="py-2 px-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.estado === 'ACTIVA' ? 'default' : 'secondary'} className="text-xs">{r.estado}</Badge>
                      <span className="text-xs text-muted-foreground">{r.fecha ? new Date(r.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : ''}</span>
                    </div>
                    {r.estado === 'ACTIVA' && (
                      <Button type="button" variant="outline" size="sm" className="text-destructive border-destructive/30 h-6 text-xs px-2"
                        onClick={() => anularReserva(r.id)} data-testid={`btn-anular-${r.id}`}
                      >
                        Anular
                      </Button>
                    )}
                  </div>
                  {r.lineas?.length > 0 && (
                    <div className="text-xs space-y-0.5 border-t pt-1 mt-1">
                      {r.lineas.map((l, i) => (
                        <div key={i} className="flex justify-between text-muted-foreground">
                          <span><span className="font-mono">{l.item_codigo}</span> — {l.item_nombre}{l.talla_nombre && ` (${l.talla_nombre})`}</span>
                          <span className="font-mono">{r.estado === 'ACTIVA' ? l.cantidad_activa : <span className="line-through">{parseFloat(l.cantidad_reservada).toFixed(1)}</span>} {l.item_unidad}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Historial Salidas */}
      {salidas.length > 0 && (
        <Collapsible open={histSalidasOpen} onOpenChange={setHistSalidasOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="w-full justify-between px-3 h-9">
              <span className="text-sm font-medium">Salidas registradas ({salidas.length})</span>
              {histSalidasOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Obs.</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salidas.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{s.fecha ? new Date(s.fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '-'}</TableCell>
                        <TableCell className="text-sm">{s.item_nombre}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{parseFloat(s.cantidad).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {s.costo_total ? `S/ ${parseFloat(s.costo_total).toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{s.observaciones || '-'}</TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm"
                            className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                            onClick={() => anularSalida(s.id)} data-testid={`btn-anular-salida-${s.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />Anular
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Modal Agregar Material Manual */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Agregar material manualmente
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {lineaNombre
                ? <>Mostrando items de: <span className="font-medium">{lineaNombre}</span></>
                : 'Mostrando todos los items'}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Item de inventario</Label>
              <SearchableSelect
                value={manualItem}
                onValueChange={setManualItem}
                options={inventarioFiltrado.filter(i => i.tipo_item === 'MP')}
                placeholder="Buscar item..."
                searchPlaceholder="Buscar por nombre o código..."
                testId="combobox-manual-item"
                renderOption={(o) => <><span className="font-mono text-xs mr-2 text-muted-foreground">{o.codigo}</span><span className="truncate">{o.nombre}</span></>}
              />
            </div>
            {manualItem && (() => {
              const sel = inventarioFiltrado.find(i => i.id === manualItem);
              return sel ? (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  Unidad: <span className="font-medium">{sel.unidad_medida}</span> · Stock: <span className="font-medium">{parseFloat(sel.stock_actual || 0).toFixed(1)}</span>
                </div>
              ) : null;
            })()}
            <div>
              <Label className="text-xs">Cantidad</Label>
              <NumericInput min={0} step={1} value={manualCantidad} onChange={(e) => setManualCantidad(e.target.value)}
                className="h-9" placeholder="0" data-testid="input-manual-cantidad" />
              <p className="text-xs text-muted-foreground mt-1">Esta cantidad se descontará del stock automáticamente</p>
            </div>
            {(() => {
              const sel = inventarioFiltrado.find(i => i.id === manualItem);
              const cant = parseFloat(manualCantidad) || 0;
              if (!modoMigracion || !sel || cant <= 0) return null;
              const stockActual = parseFloat(sel.stock_actual || 0);
              if (cant <= stockActual) return null;
              return (
                <div className="p-3 bg-yellow-50 border border-yellow-300 rounded">
                  <div className="flex items-start gap-2 text-sm text-yellow-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Stock quedará negativo temporalmente</strong>
                      <p className="text-xs mt-1">
                        Stock actual: {stockActual.toFixed(1)} · Se descontarán: {cant.toFixed(1)} · Quedará: {(stockActual - cant).toFixed(1)}
                      </p>
                      <p className="text-xs mt-1 text-yellow-700">
                        Esto es normal durante la carga inicial. Se regularizará al desactivar el modo carga inicial.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div>
              <Label className="text-xs">Observación (opcional)</Label>
              <Input value={manualObs} onChange={(e) => setManualObs(e.target.value)}
                placeholder="Motivo, referencia, etc." data-testid="input-manual-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={guardarManual} disabled={manualGuardando || !manualItem || !manualCantidad}>
              {manualGuardando && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Agregar y dar salida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Selector de Rollos */}
      <RollosModal
        open={rollosModal.open}
        linea={rollosModal.linea}
        rollosCantidades={rollosCantidades}
        setRollosCantidades={setRollosCantidades}
        onClose={() => setRollosModal({ open: false, linea: null })}
        search={rollosSearch}
        setSearch={setRollosSearch}
        filtroAncho={rollosFiltroAncho}
        setFiltroAncho={setRollosFiltroAncho}
        filtroTono={rollosFiltroTono}
        setFiltroTono={setRollosFiltroTono}
      />

      {/* Copiar materiales desde otro registro */}
      <CopiarDesdeRegistroDialog
        open={copiarOpen}
        onOpenChange={setCopiarOpen}
        registroDestinoId={registroId}
        cantidadDestino={totalPrendasOriginales ?? totalPrendas}
        tipo="materiales"
        onSuccess={fetchData}
      />
    </div>
  );
};

export default MaterialesTab;
