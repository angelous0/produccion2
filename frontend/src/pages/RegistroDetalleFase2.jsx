import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Checkbox } from '../components/ui/checkbox';
import {
  Scissors, Package, BookmarkCheck, LogOut, RefreshCw,
  AlertTriangle, CheckCircle2, Clock, Loader2, Plus, Lock, XCircle, Info, Layers,
  DollarSign, Trash2, Edit2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { NumericInput } from '../components/ui/numeric-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import MaterialesTab from '../components/MaterialesTab';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Tabla reutilizable con columnas ordenables.
 *
 * Props:
 *   rows:    array de objetos a renderizar
 *   columns: array de { key, label, align?, format?, cellClass? }
 *   initialSort: { key, dir: 'asc'|'desc' }
 *   footer:  ReactNode opcional (se renderiza después de las filas)
 *
 * Click en el encabezado cicla: desc → asc → sin orden (vuelve al initialSort).
 */
const SortableTable = ({ rows, columns, initialSort = null, footer = null }) => {
  const [sort, setSort] = useState(initialSort);
  const sortedRows = (() => {
    if (!sort || !sort.key) return rows;
    const key = sort.key;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  })();
  const handleSort = (key) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return initialSort;  // 3er click vuelve al orden inicial
    });
  };
  const SortIcon = ({ colKey }) => {
    if (!sort || sort.key !== colKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sort.dir === 'desc'
      ? <ArrowDown className="inline h-3 w-3 ml-1 text-primary" />
      : <ArrowUp className="inline h-3 w-3 ml-1 text-primary" />;
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map(col => (
            <TableHead
              key={col.key}
              className={`${col.align === 'right' ? 'text-right' : ''} cursor-pointer select-none hover:bg-muted/40 transition-colors`}
              onClick={() => handleSort(col.key)}
            >
              {col.label}
              <SortIcon colKey={col.key} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row, i) => (
          <TableRow key={i}>
            {columns.map(col => {
              const raw = row[col.key];
              const rendered = col.format ? col.format(raw) : raw;
              const alignClass = col.align === 'right' ? 'text-right font-mono' : '';
              return (
                <TableCell key={col.key} className={`${alignClass} ${col.cellClass || ''}`}>
                  {rendered}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
        {footer}
      </TableBody>
    </Table>
  );
};

// Helper: extract error message safely (avoid rendering objects as React children)
const getErrorMsg = (error, fallback = 'Error') => {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (detail.errores && Array.isArray(detail.errores)) return detail.errores.join(', ');
  if (detail.message) return detail.message;
  if (detail.error) return detail.error;
  return JSON.stringify(detail);
};

// ==================== PESTAÑA TALLAS (CORTE) ====================
const TallasTab = ({ registroId, onTotalChange }) => {
  const [data, setData] = useState({ tallas: [], total_prendas: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const debounceTimers = useRef({});

  const fetchTallas = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/registros/${registroId}/tallas`);
      setData(res.data);
      onTotalChange?.(res.data.total_prendas);
    } catch (error) {
      toast.error('Error al cargar tallas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (registroId) fetchTallas();
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, [registroId]);

  const handleCantidadChange = (tallaId, value) => {
    const cantidad = parseInt(value) || 0;
    
    // Actualizar localmente
    setData(prev => {
      const newTallas = prev.tallas.map(t => 
        t.talla_id === tallaId ? { ...t, cantidad_real: cantidad } : t
      );
      const newTotal = newTallas.reduce((sum, t) => sum + t.cantidad_real, 0);
      onTotalChange?.(newTotal);
      return { ...prev, tallas: newTallas, total_prendas: newTotal };
    });

    // Debounce para autosave
    if (debounceTimers.current[tallaId]) {
      clearTimeout(debounceTimers.current[tallaId]);
    }
    
    setSaving(prev => ({ ...prev, [tallaId]: true }));
    
    debounceTimers.current[tallaId] = setTimeout(async () => {
      try {
        await axios.put(`${API}/registros/${registroId}/tallas/${tallaId}`, {
          cantidad_real: cantidad
        });
      } catch (error) {
        toast.error('Error al guardar cantidad');
      } finally {
        setSaving(prev => ({ ...prev, [tallaId]: false }));
      }
    }, 500);
  };

  if (loading) {
    return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  if (data.tallas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
        <p>El modelo de este registro no tiene tallas asignadas.</p>
        <p className="text-sm">Asigna tallas al modelo desde la página de Modelos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Cantidades por Talla (Corte)</h3>
          <p className="text-sm text-muted-foreground">Ingresa la cantidad real cortada por talla</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Total: {data.total_prendas} prendas
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {data.tallas.map(t => (
          <div key={t.talla_id} className="relative">
            <label className="text-sm font-medium text-muted-foreground">{t.talla_nombre}</label>
            <div className="relative">
              <NumericInput
                min="0"
                value={t.cantidad_real}
                onChange={(e) => handleCantidadChange(t.talla_id, e.target.value)}
                className="mt-1 text-center font-mono"
                data-testid={`talla-input-${t.talla_id}`}
              />
              {saving[t.talla_id] && (
                <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// ==================== PESTAÑA REQUERIMIENTO ====================
const RequerimientoTab = ({ registroId, totalPrendas }) => {
  const [data, setData] = useState({ items: [], total_lineas: 0 });
  const [explosionInfo, setExplosionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchRequerimiento = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/bom/requerimiento/${registroId}`);
      setData(res.data);
    } catch {
      setData({ items: [], total_lineas: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (registroId) fetchRequerimiento();
  }, [registroId]);

  const handleGenerar = async () => {
    setGenerating(true);
    try {
      const regenerar = data.total_lineas > 0;
      const res = await axios.post(`${API}/bom/explosion/${registroId}`, {
        empresa_id: 7,
        regenerar,
      });
      setExplosionInfo(res.data);
      toast.success(`Requerimiento generado: ${res.data.resumen.total_lineas_mp} líneas MP`);
      fetchRequerimiento();
    } catch (error) {
      toast.error(getErrorMsg(error, 'Error al generar requerimiento'));
    } finally {
      setGenerating(false);
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'COMPLETO':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Completo</Badge>;
      case 'PARCIAL':
        return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />Parcial</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const items = data.items || [];
  const totalRequerido = items.reduce((s, i) => s + parseFloat(i.cantidad_requerida || 0), 0);
  const totalDeficit = items.reduce((s, i) => s + parseFloat(i.deficit || 0), 0);
  const totalCosto = items.reduce((s, i) => s + parseFloat(i.costo_estimado || 0), 0);
  const itemsDeficit = items.filter(i => parseFloat(i.deficit || 0) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Requerimiento de Materia Prima</h3>
          <p className="text-sm text-muted-foreground">
            Explosión BOM basada en {totalPrendas > 0 ? totalPrendas : '—'} prendas planificadas
          </p>
        </div>
        <Button onClick={handleGenerar} disabled={generating} data-testid="btn-generar-req">
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {items.length > 0 ? 'Regenerar' : 'Generar desde BOM'}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay requerimiento generado</p>
          <p className="text-sm text-muted-foreground">Haz clic en &quot;Generar desde BOM&quot; para calcular</p>
        </div>
      ) : (
        <>
          {/* Resumen cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold" data-testid="req-total-lineas">{items.length}</div>
                <p className="text-xs text-muted-foreground">Materiales</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600" data-testid="req-costo-total">{formatCurrency(totalCosto)}</div>
                <p className="text-xs text-muted-foreground">Costo Estimado</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${itemsDeficit > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="req-deficit-count">
                  {itemsDeficit}
                </div>
                <p className="text-xs text-muted-foreground">Items con Déficit</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600" data-testid="req-reservado">
                  {formatNumber(items.reduce((s, i) => s + parseFloat(i.cantidad_reservada || 0), 0))}
                </div>
                <p className="text-xs text-muted-foreground">Total Reservado</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de requerimiento */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Tipo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead className="text-right">Requerido</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Déficit</TableHead>
                <TableHead className="text-right">Costo Est.</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(l => {
                const deficit = parseFloat(l.deficit || 0);
                return (
                  <TableRow key={l.id} className={deficit > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{l.tipo_componente || '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{l.inventario_nombre || l.inv_codigo || '?'}</div>
                      {l.merma_pct > 0 && (
                        <div className="text-xs text-muted-foreground">+{parseFloat(l.merma_pct).toFixed(1)}% merma</div>
                      )}
                    </TableCell>
                    <TableCell>{l.talla_nombre || 'Todas'}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(l.cantidad_requerida)} {l.unidad_medida || ''}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(l.stock_actual)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${deficit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {deficit > 0 ? formatNumber(deficit) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.costo_estimado)}</TableCell>
                    <TableCell>{getEstadoBadge(l.estado)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Costo estimado es referencial (basado en costo promedio actual). El costo real se determina al consumir MP.
          </p>
        </>
      )}
    </div>
  );
};


// ==================== PESTAÑA RESERVAS ====================
const ReservasTab = ({ registroId }) => {
  const [requerimiento, setRequerimiento] = useState({ lineas: [] });
  const [reservas, setReservas] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState({});
  const [loading, setLoading] = useState(true);
  const [reservando, setReservando] = useState(false);
  const [cantidadesReservar, setCantidadesReservar] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, resRes] = await Promise.all([
        axios.get(`${API}/registros/${registroId}/requerimiento`).catch(() => ({ data: { lineas: [] } })),
        axios.get(`${API}/registros/${registroId}/reservas`).catch(() => ({ data: { reservas: [] } })),
      ]);
      setRequerimiento(reqRes.data);
      setReservas(resRes.data.reservas || []);

      // Obtener disponibilidad por item
      const itemIds = [...new Set(reqRes.data.lineas?.map(l => l.item_id) || [])];
      const dispMap = {};
      for (const itemId of itemIds) {
        try {
          const dispRes = await axios.get(`${API}/inventario/${itemId}/disponibilidad`);
          dispMap[itemId] = dispRes.data;
        } catch (e) {
          dispMap[itemId] = { disponible: 0 };
        }
      }
      setDisponibilidad(dispMap);

      // Inicializar cantidades a reservar con el pendiente
      const inicial = {};
      (reqRes.data.lineas || []).forEach(l => {
        const key = `${l.item_id}_${l.talla_id || 'null'}`;
        inicial[key] = Math.min(l.pendiente_reservar, dispMap[l.item_id]?.disponible || 0);
      });
      setCantidadesReservar(inicial);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (registroId) fetchData();
  }, [registroId]);

  const handleReservarTodo = async () => {
    const lineas = requerimiento.lineas
      .filter(l => {
        const key = `${l.item_id}_${l.talla_id || 'null'}`;
        return cantidadesReservar[key] > 0;
      })
      .map(l => ({
        item_id: l.item_id,
        talla_id: l.talla_id || null,
        cantidad: cantidadesReservar[`${l.item_id}_${l.talla_id || 'null'}`]
      }));

    if (lineas.length === 0) {
      toast.error('No hay cantidades para reservar');
      return;
    }

    setReservando(true);
    try {
      await axios.post(`${API}/registros/${registroId}/reservas`, { lineas });
      toast.success('Reserva creada exitosamente');
      fetchData();
    } catch (error) {
      toast.error(getErrorMsg(error, 'Error al crear reserva'));
    } finally {
      setReservando(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  if (requerimiento.lineas.length === 0) {
    return (
      <div className="text-center py-8 border-2 border-dashed rounded-lg">
        <BookmarkCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">Primero genera el requerimiento desde la pestaña anterior</p>
      </div>
    );
  }

  // Mostrar TODOS los items (no solo pendientes) para poder reservar más
  const itemsConDisponibilidad = requerimiento.lineas.filter(l => (disponibilidad[l.item_id]?.disponible || 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Reservar Materia Prima</h3>
          <p className="text-sm text-muted-foreground">Bloquea stock para este registro (puedes reservar más del requerimiento original)</p>
        </div>
        <Button onClick={handleReservarTodo} disabled={reservando || itemsConDisponibilidad.length === 0} data-testid="btn-reservar">
          {reservando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookmarkCheck className="h-4 w-4 mr-2" />}
          Reservar Seleccionados
        </Button>
      </div>

      {itemsConDisponibilidad.length === 0 ? (
        <div className="text-center py-4 bg-yellow-50 rounded-lg">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
          <p className="text-yellow-700">No hay stock disponible para reservar</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Requerido</TableHead>
              <TableHead className="text-right">Ya Reservado</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead className="text-right w-[150px]">A Reservar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsConDisponibilidad.map(l => {
              const key = `${l.item_id}_${l.talla_id || 'null'}`;
              const disp = disponibilidad[l.item_id]?.disponible || 0;
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.item_nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.item_codigo}
                      {l.control_por_rollos && <Badge variant="outline" className="ml-2 text-xs">TELA</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{l.talla_nombre || 'Todas'}</TableCell>
                  <TableCell className="text-right font-mono">{parseFloat(l.cantidad_requerida).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-blue-600">{parseFloat(l.cantidad_reservada).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="text-green-600">{disp.toFixed(2)}</span>
                  </TableCell>
                  <TableCell>
                    <NumericInput
                      min="0"
                      max={disp}
                      step="0.01"
                      value={cantidadesReservar[key]}
                      onChange={(e) => setCantidadesReservar(prev => ({
                        ...prev,
                        [key]: Math.min(parseFloat(e.target.value) || 0, disp)
                      }))}
                      className="text-right font-mono"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {reservas.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-2">Historial de Reservas</h4>
          <div className="space-y-2">
            {reservas.map(r => (
              <Card key={r.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.estado === 'ACTIVA' ? 'default' : 'secondary'}>{r.estado}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(r.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
                      </span>
                      <span className="text-xs text-muted-foreground">({r.lineas?.length || 0} líneas)</span>
                    </div>
                    {r.estado === 'ACTIVA' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 h-7 text-xs"
                        onClick={async () => {
                          try {
                            await axios.delete(`${API}/reservas/${r.id}`);
                            toast.success('Reserva anulada');
                            fetchData();
                          } catch (err) {
                            toast.error(getErrorMsg(err, 'Error al anular reserva'));
                          }
                        }}
                        data-testid={`btn-anular-reserva-${r.id}`}
                      >
                        Anular Reserva
                      </Button>
                    )}
                  </div>
                  {/* Detalle de líneas */}
                  {r.lineas && r.lineas.length > 0 && (
                    <div className="text-xs space-y-1 border-t pt-2">
                      {r.lineas.map((l, idx) => (
                        <div key={idx} className="flex items-center justify-between text-muted-foreground">
                          <span>
                            <span className="font-mono">{l.item_codigo}</span> — {l.item_nombre}
                            {l.talla_nombre && <span className="ml-1">({l.talla_nombre})</span>}
                          </span>
                          <span className="font-mono">
                            {r.estado === 'ACTIVA' ? (
                              <span className="text-green-600">{l.cantidad_activa}</span>
                            ) : (
                              <span className="line-through">{l.cantidad_reservada}</span>
                            )}
                            {' '}{l.item_unidad}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ==================== PESTAÑA SALIDAS ====================
const SalidasTab = ({ registroId }) => {
  const [requerimiento, setRequerimiento] = useState({ lineas: [] });
  const [salidas, setSalidas] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [modoExtra, setModoExtra] = useState(false);
  
  // Estado para cantidades en lote (por item_id + talla_id)
  const [cantidadesLote, setCantidadesLote] = useState({});
  // Estado para rollos seleccionados (por item_id_talla_id) - ahora es un array de {rollo, cantidad}
  const [rollosSeleccionados, setRollosSeleccionados] = useState({});
  // Estado para datos de rollos por item
  const [rollosData, setRollosData] = useState({});
  
  // Modal de selección de rollos (MÚLTIPLE)
  const [rolloModalOpen, setRolloModalOpen] = useState(false);
  const [rolloModalLinea, setRolloModalLinea] = useState(null);
  const [rolloModalSearch, setRolloModalSearch] = useState('');
  // Rollos seleccionados en el modal: { [rolloId]: cantidad }
  const [rolloModalSelections, setRolloModalSelections] = useState({});
  
  // Form state para modo extra
  const [selectedItemExtra, setSelectedItemExtra] = useState(null);
  const [selectedRolloExtra, setSelectedRolloExtra] = useState('');
  const [cantidadExtra, setCantidadExtra] = useState('');
  const [rollosDisponiblesExtra, setRollosDisponiblesExtra] = useState([]);
  const [observacionesExtra, setObservacionesExtra] = useState('');
  const [motivoExtra, setMotivoExtra] = useState('Consumo adicional');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reqRes, salRes, invRes] = await Promise.all([
        axios.get(`${API}/registros/${registroId}/requerimiento`).catch(() => ({ data: { lineas: [] } })),
        axios.get(`${API}/inventario-salidas?registro_id=${registroId}`).catch(() => ({ data: [] })),
        axios.get(`${API}/inventario?all=true`).catch(() => ({ data: [] })),
      ]);
      setRequerimiento(reqRes.data);
      setSalidas(salRes.data);
      const invData = Array.isArray(invRes.data) ? invRes.data : invRes.data.items || [];
      setInventario(invData);
      
      // Cargar rollos para items que lo necesitan
      const itemsConRollos = (reqRes.data.lineas || []).filter(l => l.control_por_rollos && l.pendiente_consumir > 0);
      const rollosPromises = itemsConRollos.map(async (l) => {
        try {
          const res = await axios.get(`${API}/inventario/${l.item_id}`);
          return { itemId: l.item_id, rollos: res.data.rollos || [] };
        } catch {
          return { itemId: l.item_id, rollos: [] };
        }
      });
      const rollosResults = await Promise.all(rollosPromises);
      const rollosMap = {};
      rollosResults.forEach(r => {
        const rollosActivos = r.rollos.filter(ro => ro.activo && ro.metraje_disponible > 0);
        rollosMap[r.itemId] = rollosActivos;
      });
      setRollosData(rollosMap);
      
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (registroId) fetchData();
  }, [registroId]);

  const getLineaKey = (linea) => `${linea.item_id}_${linea.talla_id || 'null'}`;

  // Copiar máximo pendiente a cantidad (para items SIN rollo)
  const copiarMaximo = (linea) => {
    const key = getLineaKey(linea);
    setCantidadesLote(prev => ({ ...prev, [key]: parseFloat(linea.pendiente_consumir) }));
  };

  // Abrir modal de selección de rollos
  const abrirModalRollo = (linea) => {
    setRolloModalLinea(linea);
    setRolloModalSearch('');
    setRolloModalSelections({});
    setRolloModalOpen(true);
  };

  // Toggle selección de un rollo con cantidad completa
  const toggleRolloSelection = (rollo) => {
    setRolloModalSelections(prev => {
      if (prev[rollo.id]) {
        // Deseleccionar
        const { [rollo.id]: _, ...rest } = prev;
        return rest;
      } else {
        // Seleccionar con cantidad completa
        return { ...prev, [rollo.id]: rollo.metraje_disponible };
      }
    });
  };

  // Cambiar cantidad de un rollo seleccionado
  const cambiarCantidadRollo = (rolloId, cantidad, maxDisponible) => {
    const numCantidad = parseFloat(cantidad) || 0;
    if (numCantidad <= 0) {
      // Si es 0, deseleccionar
      setRolloModalSelections(prev => {
        const { [rolloId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setRolloModalSelections(prev => ({
        ...prev,
        [rolloId]: Math.min(numCantidad, maxDisponible)
      }));
    }
  };

  // Seleccionar todos los rollos
  const seleccionarTodosRollos = () => {
    const pendiente = parseFloat(rolloModalLinea?.pendiente_consumir || 0);
    let acumulado = 0;
    const nuevasSelecciones = {};
    
    for (const rollo of rollosFiltrados) {
      if (acumulado >= pendiente) break;
      const disponible = parseFloat(rollo.metraje_disponible);
      const necesario = Math.min(disponible, pendiente - acumulado);
      nuevasSelecciones[rollo.id] = necesario;
      acumulado += necesario;
    }
    
    setRolloModalSelections(nuevasSelecciones);
  };

  // Calcular total seleccionado en el modal
  const totalSeleccionadoModal = Object.values(rolloModalSelections).reduce((sum, c) => sum + (c || 0), 0);

  // Confirmar selección de rollos desde el modal
  const confirmarRollos = () => {
    const selecciones = Object.entries(rolloModalSelections)
      .filter(([_, cantidad]) => cantidad > 0)
      .map(([rolloId, cantidad]) => {
        const rollo = rollosFiltrados.find(r => r.id === rolloId);
        return { rollo, cantidad };
      });
    
    if (selecciones.length === 0) {
      toast.error('Selecciona al menos un rollo');
      return;
    }
    
    const key = getLineaKey(rolloModalLinea);
    const totalCantidad = selecciones.reduce((sum, s) => sum + s.cantidad, 0);
    
    setCantidadesLote(prev => ({ ...prev, [key]: totalCantidad }));
    setRollosSeleccionados(prev => ({ ...prev, [key]: selecciones }));
    setRolloModalOpen(false);
    toast.success(`${selecciones.length} rollo(s) seleccionado(s): ${totalCantidad.toFixed(2)}m total`);
  };

  // Filtrar rollos en el modal
  const rollosFiltrados = rolloModalLinea 
    ? (rollosData[rolloModalLinea.item_id] || []).filter(r => {
        if (!rolloModalSearch) return true;
        const search = rolloModalSearch.toLowerCase();
        return (r.numero_rollo?.toLowerCase().includes(search) || 
                r.tono?.toLowerCase().includes(search));
      })
    : [];

  const limpiarTodo = () => {
    setCantidadesLote({});
    setRollosSeleccionados({});
  };

  const registrarTodasLasSalidas = async () => {
    const salidasARegistrar = pendientes.filter(linea => {
      const key = getLineaKey(linea);
      const cantidad = cantidadesLote[key];
      if (!cantidad || cantidad <= 0) return false;
      // Para items con rollo, verificar que haya rollos seleccionados
      if (linea.control_por_rollos && (!rollosSeleccionados[key] || rollosSeleccionados[key].length === 0)) return false;
      return true;
    });

    if (salidasARegistrar.length === 0) {
      toast.error('No hay salidas válidas para registrar');
      return;
    }

    setProcesando(true);
    let exitosas = 0;
    let errores = [];

    for (const linea of salidasARegistrar) {
      const key = getLineaKey(linea);
      
      if (linea.control_por_rollos) {
        // Para items con rollo, registrar una salida por cada rollo seleccionado
        const selecciones = rollosSeleccionados[key] || [];
        for (const { rollo, cantidad } of selecciones) {
          try {
            await axios.post(`${API}/inventario-salidas`, {
              item_id: linea.item_id,
              cantidad: cantidad,
              registro_id: registroId,
              talla_id: linea.talla_id || null,
              rollo_id: rollo.id,
              observaciones: ''
            });
            exitosas++;
          } catch (error) {
            errores.push(`${linea.item_nombre} (${rollo.numero_rollo || 'rollo'}): ${getErrorMsg(error)}`);
          }
        }
      } else {
        // Para items sin rollo, una sola salida
        const cantidad = cantidadesLote[key];
        try {
          await axios.post(`${API}/inventario-salidas`, {
            item_id: linea.item_id,
            cantidad: cantidad,
            registro_id: registroId,
            talla_id: linea.talla_id || null,
            rollo_id: null,
            observaciones: ''
          });
          exitosas++;
        } catch (error) {
          errores.push(`${linea.item_nombre}: ${getErrorMsg(error)}`);
        }
      }
    }

    setProcesando(false);
    
    if (exitosas > 0) {
      toast.success(`${exitosas} salida(s) registrada(s) correctamente`);
      setCantidadesLote({});
      setRollosSeleccionados({});
      fetchData();
    }
    
    if (errores.length > 0) {
      toast.error(`Errores: ${errores.join(', ')}`);
    }
  };

  // Modo Extra handlers
  const handleSelectItemExtra = async (itemId) => {
    const item = inventario.find(i => i.id === itemId);
    if (!item) return;
    
    setSelectedItemExtra({
      item_id: item.id,
      item_nombre: item.nombre,
      item_codigo: item.codigo,
      item_unidad: item.unidad_medida,
      control_por_rollos: item.control_por_rollos,
      talla_id: null,
      pendiente_consumir: item.stock_actual
    });
    setSelectedRolloExtra('');
    setCantidadExtra('');
    setRollosDisponiblesExtra([]);

    if (item.control_por_rollos) {
      try {
        const res = await axios.get(`${API}/inventario/${item.id}`);
        const rollosActivos = (res.data.rollos || []).filter(r => r.activo && r.metraje_disponible > 0);
        setRollosDisponiblesExtra(rollosActivos);
        // Auto-seleccionar el mejor rollo
        if (rollosActivos.length > 0) {
          const mejor = rollosActivos.sort((a, b) => b.metraje_disponible - a.metraje_disponible)[0];
          setSelectedRolloExtra(mejor.id);
        }
      } catch (error) {
        toast.error('Error al cargar rollos');
      }
    }
  };

  const handleCrearSalidaExtra = async () => {
    if (!selectedItemExtra) {
      toast.error('Selecciona un item');
      return;
    }
    
    const cant = parseFloat(cantidadExtra);
    if (!cant || cant <= 0) {
      toast.error('Ingresa una cantidad válida');
      return;
    }

    if (selectedItemExtra.control_por_rollos && !selectedRolloExtra) {
      toast.error('Selecciona un rollo para este item');
      return;
    }

    setProcesando(true);
    try {
      await axios.post(`${API}/inventario-salidas/extra`, {
        item_id: selectedItemExtra.item_id,
        cantidad: cant,
        registro_id: registroId,
        talla_id: selectedItemExtra.talla_id || null,
        rollo_id: selectedItemExtra.control_por_rollos ? selectedRolloExtra : null,
        observaciones: observacionesExtra,
        motivo: motivoExtra
      });
      toast.success('Salida extra registrada');
      setSelectedItemExtra(null);
      setCantidadExtra('');
      setSelectedRolloExtra('');
      setObservacionesExtra('');
      setMotivoExtra('Consumo adicional');
      fetchData();
    } catch (error) {
      toast.error(getErrorMsg(error, 'Error al crear salida'));
    } finally {
      setProcesando(false);
    }
  };

  const usarTodoRolloExtra = () => {
    const rollo = rollosDisponiblesExtra.find(r => r.id === selectedRolloExtra);
    if (rollo) {
      setCantidadExtra(rollo.metraje_disponible.toString());
    }
  };

  if (loading) {
    return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const pendientes = requerimiento.lineas.filter(l => l.pendiente_consumir > 0);
  const totalARegistrar = Object.values(cantidadesLote).reduce((sum, c) => sum + (c || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Registrar Salidas de MP</h3>
          <p className="text-sm text-muted-foreground">
            {modoExtra ? 'Salida extra: sin validar reserva previa' : 'Ingresa las cantidades y registra todas de una vez'}
          </p>
        </div>
        <Button 
          variant={modoExtra ? "default" : "outline"}
          onClick={() => {
            setModoExtra(!modoExtra);
            setSelectedItemExtra(null);
            setCantidadExtra('');
            setSelectedRolloExtra('');
          }}
          data-testid="btn-modo-extra"
        >
          <Plus className="h-4 w-4 mr-2" />
          {modoExtra ? 'Modo Extra ACTIVO' : 'Salida Extra'}
        </Button>
      </div>

      {modoExtra ? (
        /* MODO EXTRA: Seleccionar cualquier item del inventario */
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Seleccionar Item del Inventario</CardTitle>
              <CardDescription>Cualquier item con stock disponible</CardDescription>
            </CardHeader>
            <CardContent>
              <Select onValueChange={handleSelectItemExtra}>
                <SelectTrigger data-testid="select-item-extra">
                  <SelectValue placeholder="Buscar item..." />
                </SelectTrigger>
                <SelectContent>
                  {inventario.filter(i => parseFloat(i.stock_actual) > 0).map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.codigo} - {i.nombre} ({i.stock_actual} disp.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Formulario de salida extra */}
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-700">Nueva Salida Extra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedItemExtra ? (
                <>
                  <div className="p-3 bg-orange-100/50 rounded-lg">
                    <div className="font-medium">{selectedItemExtra.item_nombre}</div>
                    <div className="text-sm text-muted-foreground">
                      Stock disponible: {parseFloat(selectedItemExtra.pendiente_consumir).toFixed(2)} {selectedItemExtra.item_unidad}
                    </div>
                  </div>

                  {selectedItemExtra.control_por_rollos && (
                    <div>
                      <label className="text-sm font-medium">Rollo *</label>
                      <Select value={selectedRolloExtra} onValueChange={setSelectedRolloExtra}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rollo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {rollosDisponiblesExtra.map(r => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.numero_rollo || r.id.slice(0, 8)} - {r.metraje_disponible}m disp.
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedRolloExtra && (
                        <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0" onClick={usarTodoRolloExtra}>
                          Usar todo el rollo
                        </Button>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium">Cantidad *</label>
                    <NumericInput
                      min="0"
                      step="0.01"
                      value={cantidadExtra}
                      onChange={(e) => setCantidadExtra(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Motivo</label>
                    <Select value={motivoExtra} onValueChange={setMotivoExtra}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consumo adicional">Consumo adicional</SelectItem>
                        <SelectItem value="Reposición por defecto">Reposición por defecto</SelectItem>
                        <SelectItem value="Ajuste de producción">Ajuste de producción</SelectItem>
                        <SelectItem value="Material dañado">Material dañado</SelectItem>
                        <SelectItem value="Otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={handleCrearSalidaExtra} 
                    disabled={procesando}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    {procesando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Registrar Salida Extra
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Selecciona un item del inventario
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : pendientes.length === 0 && requerimiento.lineas.length > 0 ? (
        <div className="text-center py-4 bg-green-50 rounded-lg">
          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
          <p className="text-green-700">Todo el requerimiento ha sido consumido</p>
          <p className="text-sm text-green-600 mt-1">¿Necesitas más? Usa el botón &quot;Salida Extra&quot;</p>
        </div>
      ) : requerimiento.lineas.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <LogOut className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Primero genera y reserva el requerimiento</p>
          <p className="text-sm text-muted-foreground mt-1">O usa &quot;Salida Extra&quot; para consumir sin reserva</p>
        </div>
      ) : (
        /* MODO NORMAL: Tabla editable en lote */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Items con Reserva Pendiente</CardTitle>
              <Button variant="outline" size="sm" onClick={limpiarTodo}>
                Limpiar Todo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="w-[200px]">Acción</TableHead>
                  <TableHead className="w-[120px] text-right">A Consumir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.map((linea) => {
                  const key = getLineaKey(linea);
                  const cantidadActual = cantidadesLote[key] || 0;
                  const rolloSelec = rollosSeleccionados[key];
                  const esRollo = linea.control_por_rollos;
                  
                  return (
                    <TableRow key={key}>
                      <TableCell>
                        <div className="font-medium">{linea.item_nombre}</div>
                        <div className="text-xs text-muted-foreground">{linea.item_codigo}</div>
                      </TableCell>
                      <TableCell>
                        {linea.talla_nombre || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {parseFloat(linea.pendiente_consumir).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {esRollo ? (
                          /* ITEM CON ROLLO: Botón para abrir modal */
                          <Button
                            variant={rolloSelec && rolloSelec.length > 0 ? "default" : "outline"}
                            size="sm"
                            onClick={() => abrirModalRollo(linea)}
                            className="w-full"
                          >
                            {rolloSelec && rolloSelec.length > 0 ? (
                              <>
                                <Layers className="h-4 w-4 mr-2" />
                                {rolloSelec.length} rollo(s) ({cantidadActual}m)
                              </>
                            ) : (
                              <>
                                <Layers className="h-4 w-4 mr-2" />
                                Seleccionar Rollos
                              </>
                            )}
                          </Button>
                        ) : (
                          /* ITEM SIN ROLLO: Botón para copiar máximo */
                          <Button
                            variant={cantidadActual > 0 ? "default" : "outline"}
                            size="sm"
                            onClick={() => copiarMaximo(linea)}
                            className="w-full"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            {cantidadActual > 0 ? `Consumir ${cantidadActual}` : 'Usar Todo'}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {cantidadActual > 0 ? (
                          <Badge variant="default" className="font-mono">
                            {parseFloat(cantidadActual).toFixed(2)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Barra de acción */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm">
                <span className="text-muted-foreground">Total a registrar: </span>
                <span className="font-mono font-bold">{totalARegistrar.toFixed(2)}</span>
              </div>
              <Button 
                onClick={registrarTodasLasSalidas}
                disabled={procesando || totalARegistrar === 0}
                className="min-w-[200px]"
              >
                {procesando ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Registrar Todas las Salidas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial de salidas */}
      {salidas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historial de Salidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead>Rollo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salidas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{new Date(s.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</TableCell>
                      <TableCell>{s.item_nombre || s.item_id?.slice(0, 8)}</TableCell>
                      <TableCell>{s.talla_nombre || '-'}</TableCell>
                      <TableCell>{s.numero_rollo || '-'}</TableCell>
                      <TableCell className="text-right font-mono">{parseFloat(s.cantidad).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL DE SELECCIÓN MÚLTIPLE DE ROLLOS */}
      <Dialog open={rolloModalOpen} onOpenChange={setRolloModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Seleccionar Rollos - {rolloModalLinea?.item_nombre}
            </DialogTitle>
            <DialogDescription>
              Pendiente a consumir: <strong>{rolloModalLinea ? parseFloat(rolloModalLinea.pendiente_consumir).toFixed(2) : 0}</strong> metros
              {Object.keys(rolloModalSelections).length > 0 && (
                <span className="ml-2">| Seleccionado: <strong>{totalSeleccionadoModal.toFixed(2)}</strong> m</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Buscador + Seleccionar Todos */}
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por número de rollo o tono..."
                value={rolloModalSearch}
                onChange={(e) => setRolloModalSearch(e.target.value)}
                className="flex-1"
                data-testid="rollo-modal-search"
              />
              <Button variant="outline" size="sm" onClick={seleccionarTodosRollos} data-testid="btn-seleccionar-todos-rollos">
                Sel. Todos
              </Button>
            </div>

            {/* Lista de rollos con checkboxes */}
            <div className="border rounded-lg max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Rollo</TableHead>
                    <TableHead>Tono</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="w-[130px] text-right">A Consumir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay rollos disponibles
                      </TableCell>
                    </TableRow>
                  ) : (
                    rollosFiltrados.map((rollo) => {
                      const isSelected = !!rolloModalSelections[rollo.id];
                      return (
                        <TableRow 
                          key={rollo.id}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted'}`}
                          onClick={() => toggleRolloSelection(rollo)}
                          data-testid={`rollo-row-${rollo.id}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRolloSelection(rollo)}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`rollo-checkbox-${rollo.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono font-medium">{rollo.numero_rollo}</TableCell>
                          <TableCell>{rollo.tono || '-'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {parseFloat(rollo.metraje_disponible).toFixed(2)} m
                          </TableCell>
                          <TableCell className="text-right">
                            {isSelected ? (
                              <NumericInput
                                min="0.01"
                                max={rollo.metraje_disponible}
                                step="0.01"
                                value={rolloModalSelections[rollo.id]}
                                onChange={(e) => cambiarCantidadRollo(rollo.id, e.target.value, rollo.metraje_disponible)}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono w-24 h-8 text-right ml-auto"
                                data-testid={`rollo-cantidad-${rollo.id}`}
                              />
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Resumen de selección */}
            {Object.keys(rolloModalSelections).length > 0 && (
              <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">Rollos seleccionados: </span>
                  <strong>{Object.keys(rolloModalSelections).length}</strong>
                  <span className="mx-2">|</span>
                  <span className="text-muted-foreground">Total: </span>
                  <strong className="font-mono">{totalSeleccionadoModal.toFixed(2)} m</strong>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRolloModalSelections({})}>
                  Limpiar
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRolloModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarRollos} disabled={Object.keys(rolloModalSelections).length === 0} data-testid="btn-confirmar-rollos">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar ({Object.keys(rolloModalSelections).length} rollos)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};



// ==================== PESTAÑA COSTOS DE SERVICIO ====================
export const CostosTab = ({ registroId, empresaId = 8 }) => {
  const [costos, setCostos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ descripcion: '', monto: '', proveedor_texto: '', fecha: '' });
  const [editingId, setEditingId] = useState(null);

  const fetchCostos = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/registros/${registroId}/costos-servicio`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCostos(res.data.costos || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Error al cargar costos');
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { if (registroId) fetchCostos(); }, [registroId, fetchCostos]);

  const handleSubmit = async () => {
    if (!form.descripcion || !form.monto) {
      toast.error('Descripción y monto son requeridos');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (editingId) {
        await axios.put(`${API}/registros/${registroId}/costos-servicio/${editingId}`, 
          { descripcion: form.descripcion, monto: parseFloat(form.monto), proveedor_texto: form.proveedor_texto || null, fecha: form.fecha || null },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Costo actualizado');
      } else {
        await axios.post(`${API}/registros/${registroId}/costos-servicio`,
          { empresa_id: empresaId, registro_id: registroId, descripcion: form.descripcion, monto: parseFloat(form.monto), proveedor_texto: form.proveedor_texto || null, fecha: form.fecha || null },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Costo registrado');
      }
      setForm({ descripcion: '', monto: '', proveedor_texto: '', fecha: '' });
      setEditingId(null);
      fetchCostos();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al guardar'));
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/registros/${registroId}/costos-servicio/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Costo eliminado');
      fetchCostos();
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const handleEdit = (costo) => {
    setEditingId(costo.id);
    setForm({ 
      descripcion: costo.descripcion, 
      monto: costo.monto.toString(), 
      proveedor_texto: costo.proveedor_texto || '',
      fecha: costo.fecha || '' 
    });
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="costos-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Otros Costos</h3>
          <p className="text-xs text-muted-foreground">Costos adicionales no cubiertos por los movimientos de producción (ej: flete, empaque)</p>
        </div>
        <Badge variant="outline" className="font-mono text-base">
          Total: S/ {total.toFixed(2)}
        </Badge>
      </div>

      {/* Formulario */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-4 gap-3">
            <Input
              placeholder="Descripción del servicio"
              value={form.descripcion}
              onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className="col-span-2"
              data-testid="costo-descripcion"
            />
            <Input
              placeholder="Proveedor (opcional)"
              value={form.proveedor_texto}
              onChange={(e) => setForm(f => ({ ...f, proveedor_texto: e.target.value }))}
              data-testid="costo-proveedor"
            />
            <div className="flex gap-2">
              <NumericInput
                placeholder="Monto"
                value={form.monto}
                onChange={(e) => setForm(f => ({ ...f, monto: e.target.value }))}
                className="font-mono"
                data-testid="costo-monto"
              />
              <Button type="button" onClick={handleSubmit} data-testid="btn-guardar-costo">
                {editingId ? 'Actualizar' : 'Agregar'}
              </Button>
              {editingId && (
                <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm({ descripcion: '', monto: '', proveedor_texto: '', fecha: '' }); }}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {costos.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-sm">{c.fecha}</TableCell>
              <TableCell>{c.descripcion}</TableCell>
              <TableCell className="text-muted-foreground">{c.proveedor_texto || '-'}</TableCell>
              <TableCell className="text-right font-mono font-semibold">S/ {parseFloat(c.monto).toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {costos.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                No hay costos registrados
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};



// ==================== PESTAÑA CIERRE PRODUCCIÓN ====================
export const CierreTab = ({ registroId, registro, empresaId = 8, onCierreComplete }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [cierre, setCierre] = useState(null);
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [reabrirSaving, setReabrirSaving] = useState(false);

  const fetchPreview = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      // Check if already closed
      const cierreRes = await axios.get(`${API}/registros/${registroId}/cierre-produccion`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: null }));
      
      if (cierreRes.data) {
        setCierre(cierreRes.data);
        setLoading(false);
        return;
      }
      
      const res = await axios.get(`${API}/registros/${registroId}/preview-cierre`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreview(res.data);
    } catch (err) {
      if (err.response?.status !== 400) toast.error('Error al cargar preview');
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { if (registroId) fetchPreview(); }, [registroId, fetchPreview]);

  const handleRevertirCierre = async () => {
    if (motivoReapertura.trim().length < 5) { toast.error('El motivo debe tener al menos 5 caracteres'); return; }
    setReabrirSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/registros/${registroId}/reabrir-cierre`,
        { motivo: motivoReapertura.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Cierre revertido exitosamente');
      setReabrirOpen(false);
      setMotivoReapertura('');
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al revertir cierre');
    } finally { setReabrirSaving(false); }
  };

  const handleCierre = async () => {
    if (!preview?.puede_cerrar) {
      toast.error('No se puede cerrar: falta asignar PT o no hay prendas');
      return;
    }
    setProcesando(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/registros/${registroId}/cierre-produccion`, {
        empresa_id: empresaId,
        qty_terminada: preview.qty_terminada
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(res.data.message);
      if (onCierreComplete) onCierreComplete();
      fetchPreview();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al cerrar'));
    } finally {
      setProcesando(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  // If already closed, show cierre info
  if (cierre) {
    return (
      <div className="space-y-4" data-testid="cierre-completado">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <h3 className="text-lg font-semibold">Cierre Completado</h3>
            <Badge className="bg-green-500">CERRADA</Badge>
          </div>
          <Button type="button" variant="outline" size="sm"
            className="text-amber-600 border-amber-300 hover:bg-amber-50 gap-1.5"
            onClick={() => setReabrirOpen(true)}
            data-testid="btn-revertir-cierre">
            <RotateCcw className="h-4 w-4" /> Revertir cierre
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Fecha Cierre</p>
                <p className="font-semibold font-mono">{cierre.fecha}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Qty Terminada</p>
                <p className="font-semibold font-mono">{parseFloat(cierre.qty_terminada).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo MP</p>
                <p className="font-semibold font-mono">S/ {parseFloat(cierre.costo_mp).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo Servicios</p>
                <p className="font-semibold font-mono">S/ {parseFloat(cierre.costo_servicios).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Otros Costos</p>
                <p className="font-semibold font-mono">S/ {parseFloat(cierre.otros_costos || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CIF</p>
                <p className="font-semibold font-mono">S/ {parseFloat(cierre.costo_cif || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo Total</p>
                <p className="text-xl font-bold font-mono">S/ {parseFloat(cierre.costo_total).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo Unit PT</p>
                <p className="text-xl font-bold font-mono text-primary">S/ {parseFloat(cierre.costo_unit_pt).toFixed(4)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diálogo revertir cierre */}
        <Dialog open={reabrirOpen} onOpenChange={(v) => { if (!v) { setReabrirOpen(false); setMotivoReapertura(''); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-600" /> Revertir cierre de producción
              </DialogTitle>
              <DialogDescription>Esta acción deshace el cierre y restaura el registro a estado editable.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Se revertirán los siguientes cambios:
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 ml-4 list-disc">
                  <li>El ingreso de <strong>{parseFloat(cierre.qty_terminada).toFixed(0)} prendas</strong> al inventario PT será eliminado</li>
                  <li>El stock del artículo PT disminuirá en esa cantidad</li>
                  <li>El estado del registro volverá a <strong>Producto Terminado</strong></li>
                  <li>Podrás volver a ejecutar el cierre con datos corregidos</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Motivo <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={motivoReapertura}
                  onChange={(e) => setMotivoReapertura(e.target.value)}
                  placeholder="Ej: Error en cantidad de prendas, costo de insumo incorrecto..."
                />
                {motivoReapertura.length > 0 && motivoReapertura.trim().length < 5 && (
                  <p className="text-xs text-red-500">Mínimo 5 caracteres</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReabrirOpen(false); setMotivoReapertura(''); }} disabled={reabrirSaving}>Cancelar</Button>
              <Button variant="destructive" onClick={handleRevertirCierre}
                disabled={motivoReapertura.trim().length < 5 || reabrirSaving}
                data-testid="btn-confirmar-revertir">
                {reabrirSaving ? 'Revirtiendo...' : <><RotateCcw className="h-4 w-4 mr-1.5" /> Revertir cierre</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!preview) return <p className="text-center text-muted-foreground py-8">No se pudo cargar el preview de cierre</p>;

  return (
    <div className="space-y-4" data-testid="cierre-tab">
      {/* Banner de envío a Tienda — evento posterior al cierre de producción */}
      {preview.estado === 'Tienda' && preview.fecha_envio_tienda && (
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Enviado a Tienda
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Despachado el {new Date(preview.fecha_envio_tienda).toLocaleString('es-PE', {
                  timeZone: 'America/Lima',
                  day: '2-digit', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Preview de Cierre</h3>
        {!preview.pt_item && preview.estado !== 'Tienda' && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Falta asignar PT
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Artículo PT</p>
              {preview.pt_item ? (
                <p className="font-semibold">{preview.pt_item.codigo} - {preview.pt_item.nombre}</p>
              ) : (
                <p className="text-destructive text-sm">Asigne un artículo PT en el formulario de edición</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Prendas Terminadas</p>
              <p className="font-semibold font-mono">{preview.qty_terminada}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado</p>
              <Badge variant="outline">{preview.estado}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detalle MP */}
      {preview.salidas_mp_detalle?.length > 0 && (() => {
        const qtyFinal = parseFloat(preview.qty_terminada || preview.cif_detalle?.prendas_lote || 0);
        const mpRows = preview.salidas_mp_detalle.map(s => {
          const cant = parseFloat(s.cantidad_total || 0);
          const cost = parseFloat(s.costo_total || 0);
          // Costo unitario MP = costo del material ÷ cantidad final del lote
          // (indica cuánto aporta cada material al costo por prenda)
          const costoUnit = qtyFinal > 0 ? cost / qtyFinal : 0;
          return { ...s, _cant: cant, _cost: cost, _costoUnit: costoUnit };
        });
        const totalMP = mpRows.reduce((s, r) => s + r._cost, 0);
        const totalMPUnit = qtyFinal > 0 ? totalMP / qtyFinal : 0;
        return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Consumos de MP (FIFO)</CardTitle>
          </CardHeader>
          <CardContent>
            <SortableTable
              rows={mpRows}
              columns={[
                { key: 'codigo', label: 'Código', cellClass: 'font-mono', align: 'left' },
                { key: 'nombre', label: 'Nombre', align: 'left' },
                { key: '_cant', label: 'Cantidad', align: 'right', format: (v) => v.toFixed(2) },
                { key: '_cost', label: 'Costo Total', align: 'right', format: (v) => `S/ ${v.toFixed(2)}` },
                { key: '_costoUnit', label: 'Costo Unit.', align: 'right', format: (v) => `S/ ${v.toFixed(4)}`, cellClass: 'text-muted-foreground' },
              ]}
              initialSort={{ key: '_cost', dir: 'desc' }}
              footer={(
                <TableRow className="border-t-2 bg-muted/40 font-semibold">
                  <TableCell colSpan={3} className="font-bold">TOTAL MP</TableCell>
                  <TableCell className="text-right font-mono">S/ {totalMP.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-primary">S/ {totalMPUnit.toFixed(4)}</TableCell>
                </TableRow>
              )}
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              Costo unitario = costo total del material ÷ cantidad final terminada del lote ({qtyFinal > 0 ? qtyFinal.toFixed(0) : '—'} prendas). Click en los encabezados para ordenar.
            </p>
          </CardContent>
        </Card>
        );
      })()}

      {/* Detalle Servicios (Movimientos de Producción) */}
      {preview.movimientos_detalle?.length > 0 && (() => {
        // Totales para footer
        const qtyFinal = parseFloat(preview.qty_terminada || preview.cif_detalle?.prendas_lote || 0);
        const servRows = preview.movimientos_detalle.map(m => {
          const cant = parseFloat(m.cantidad_total || 0);
          const cost = parseFloat(m.costo_total || 0);
          const costoUnit = cant > 0 ? cost / cant : 0;
          return { ...m, _cant: cant, _cost: cost, _costoUnit: costoUnit };
        });
        const totalServicios = servRows.reduce((s, m) => s + m._cost, 0);
        const totalCostoUnit = qtyFinal > 0 ? totalServicios / qtyFinal : 0;
        return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Servicios de Producción (Movimientos)</CardTitle>
          </CardHeader>
          <CardContent>
            <SortableTable
              rows={servRows}
              columns={[
                { key: 'servicio_nombre', label: 'Servicio', align: 'left', format: (v) => v || 'Sin nombre' },
                { key: '_cant', label: 'Cantidad', align: 'right', format: (v) => v.toFixed(0) },
                { key: '_cost', label: 'Costo Total', align: 'right', format: (v) => `S/ ${v.toFixed(2)}` },
                { key: '_costoUnit', label: 'Costo Unit.', align: 'right', format: (v) => `S/ ${v.toFixed(4)}`, cellClass: 'text-muted-foreground' },
              ]}
              initialSort={{ key: '_cost', dir: 'desc' }}
              footer={(
                <TableRow className="border-t-2 bg-muted/40 font-semibold">
                  <TableCell className="font-bold">TOTAL SERVICIOS</TableCell>
                  <TableCell className="text-right font-mono">
                    {qtyFinal > 0 ? qtyFinal.toFixed(0) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    S/ {totalServicios.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    S/ {totalCostoUnit.toFixed(4)}
                  </TableCell>
                </TableRow>
              )}
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              Costo unitario = costo total del servicio ÷ cantidad procesada. El total unitario usa la cantidad final terminada del lote. Click en los encabezados para ordenar.
            </p>
          </CardContent>
        </Card>
        );
      })()}

      {/* Resumen */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Costo MP</p>
              <p className="text-lg font-bold font-mono">S/ {preview.costo_mp.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Costo Servicios</p>
              <p className="text-lg font-bold font-mono">S/ {preview.costo_servicios.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Otros Costos</p>
              <p className="text-lg font-bold font-mono">S/ {(preview.otros_costos || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">CIF</p>
              <p className="text-lg font-bold font-mono">S/ {(preview.costo_cif || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Costo Total</p>
              <p className="text-xl font-bold font-mono">S/ {preview.costo_total.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Costo Unit PT</p>
              <p className="text-xl font-bold font-mono text-primary">S/ {preview.costo_unit_pt.toFixed(4)}</p>
            </div>
          </div>
          {/* Desglose CIF */}
          {preview.cif_detalle && preview.costo_cif > 0 && (
            <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">Desglose CIF:</p>
              <div className="grid grid-cols-3 gap-2">
                <p>Gastos CIF: S/ {(preview.cif_detalle.gastos_cif || 0).toFixed(2)}</p>
                <p>Depreciacion: S/ {(preview.cif_detalle.depreciacion || 0).toFixed(2)}</p>
                <p>Total CIF mes: S/ {(preview.cif_detalle.total_cif_mes || 0).toFixed(2)}</p>
              </div>
              <p className="mt-1">
                Periodo: {preview.cif_detalle.periodo} | Prendas lote: {preview.cif_detalle.prendas_lote || 0}
                {preview.cif_detalle.total_prendas_mes > 0 && (
                  <span> de {preview.cif_detalle.total_prendas_mes} totales ({preview.cif_detalle.proporcion_pct}%)</span>
                )}
              </p>
              <p className="mt-1 font-medium text-foreground">
                CIF asignado a este lote: S/ {(preview.cif_detalle.cif_asignado || 0).toFixed(2)}
              </p>
              {preview.cif_detalle.fecha_inicio_real && preview.cif_detalle.fecha_creacion &&
                preview.cif_detalle.fecha_inicio_real !== preview.cif_detalle.fecha_creacion && (
                <p className="mt-1 text-amber-600 flex items-center gap-1">
                  Inicio real: {preview.cif_detalle.fecha_inicio_real} | Registrado: {preview.cif_detalle.fecha_creacion}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          onClick={handleCierre}
          disabled={!preview.puede_cerrar || procesando}
          className="gap-2"
          data-testid="btn-ejecutar-cierre"
        >
          {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Ejecutar Cierre de Producción
        </Button>
      </div>
    </div>
  );
};


// ==================== COMPONENTE PRINCIPAL ====================
export const RegistroDetalleFase2 = ({ registroId, registro, onEstadoChange }) => {
  const [totalPrendas, setTotalPrendas] = useState(0);
  const [estadoActual, setEstadoActual] = useState(registro?.estado);
  const [showCerrarDialog, setShowCerrarDialog] = useState(false);
  const [showAnularDialog, setShowAnularDialog] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Actualizar estado cuando cambie el registro
  useEffect(() => {
    setEstadoActual(registro?.estado);
  }, [registro?.estado]);

  // Cargar resumen para mostrar en el diálogo de confirmación
  const cargarResumen = async () => {
    setLoadingResumen(true);
    try {
      const res = await axios.get(`${API}/registros/${registroId}/resumen`);
      setResumen(res.data);
    } catch (error) {
      toast.error('Error al cargar resumen');
    } finally {
      setLoadingResumen(false);
    }
  };

  const handleOpenCerrar = async () => {
    await cargarResumen();
    setShowCerrarDialog(true);
  };

  const handleOpenAnular = async () => {
    await cargarResumen();
    setShowAnularDialog(true);
  };

  const handleCerrarOP = async () => {
    setProcesando(true);
    try {
      const res = await axios.post(`${API}/registros/${registroId}/cerrar`);
      toast.success(`OP cerrada. ${res.data.reservas_liberadas_total > 0 ? `Se liberaron ${res.data.reservas_liberadas_total} unidades de reserva.` : ''}`);
      setEstadoActual('CERRADA');
      onEstadoChange?.('CERRADA');
      setShowCerrarDialog(false);
    } catch (error) {
      toast.error(getErrorMsg(error, 'Error al cerrar OP'));
    } finally {
      setProcesando(false);
    }
  };

  const handleAnularOP = async () => {
    setProcesando(true);
    try {
      const res = await axios.post(`${API}/registros/${registroId}/anular`);
      toast.success(`OP anulada. ${res.data.reservas_liberadas_total > 0 ? `Se liberaron ${res.data.reservas_liberadas_total} unidades de reserva.` : ''}`);
      setEstadoActual('ANULADA');
      onEstadoChange?.('ANULADA');
      setShowAnularDialog(false);
    } catch (error) {
      toast.error(getErrorMsg(error, 'Error al anular OP'));
    } finally {
      setProcesando(false);
    }
  };

  const estaInactiva = estadoActual === 'CERRADA' || estadoActual === 'ANULADA';

  if (!registroId) {
    return <div className="text-center py-8 text-muted-foreground">Selecciona un registro</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header con estado y botones de acción */}
      {registro && (
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-lg">N° Corte: {registro.n_corte}</Badge>
            <Badge 
              className={
                estadoActual === 'CERRADA' ? 'bg-gray-500' : 
                estadoActual === 'ANULADA' ? 'bg-red-500' : ''
              }
            >
              {estadoActual}
            </Badge>
            {registro.urgente && <Badge variant="destructive">URGENTE</Badge>}
          </div>
          
          {/* Botones de Cerrar/Anular */}
          {!estaInactiva && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleOpenCerrar}
                data-testid="btn-cerrar-op"
              >
                <Lock className="h-4 w-4 mr-2" />
                Cerrar OP
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleOpenAnular}
                data-testid="btn-anular-op"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Anular OP
              </Button>
            </div>
          )}

          {/* Mensaje si está inactiva */}
          {estaInactiva && (
            <Badge variant="secondary" className="gap-2">
              <Info className="h-4 w-4" />
              {estadoActual === 'CERRADA' ? 'OP cerrada - Solo lectura' : 'OP anulada - Solo lectura'}
            </Badge>
          )}
        </div>
      )}

      <Tabs defaultValue="tallas" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="tallas" data-testid="tab-tallas">
            <Scissors className="h-4 w-4 mr-2" />
            Tallas
          </TabsTrigger>
          <TabsTrigger value="materiales" data-testid="tab-materiales">
            <Package className="h-4 w-4 mr-2" />
            Materiales
          </TabsTrigger>
          <TabsTrigger value="costos" data-testid="tab-costos">
            <DollarSign className="h-4 w-4 mr-2" />
            Otros Costos
          </TabsTrigger>
          <TabsTrigger value="cierre" data-testid="tab-cierre">
            <Lock className="h-4 w-4 mr-2" />
            Cierre
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tallas" className="mt-4">
          <TallasTab registroId={registroId} onTotalChange={setTotalPrendas} />
        </TabsContent>

        <TabsContent value="materiales" className="mt-4">
          <MaterialesTab registroId={registroId} totalPrendas={totalPrendas} />
        </TabsContent>

        <TabsContent value="costos" className="mt-4">
          <CostosTab registroId={registroId} empresaId={registro?.empresa_id || 7} />
        </TabsContent>

        <TabsContent value="cierre" className="mt-4">
          <CierreTab registroId={registroId} registro={registro} empresaId={registro?.empresa_id || 7} onCierreComplete={() => {
            setEstadoActual('CERRADA');
            if (onEstadoChange) onEstadoChange();
          }} />
        </TabsContent>
      </Tabs>

      {/* Dialog de confirmación para CERRAR */}
      <AlertDialog open={showCerrarDialog} onOpenChange={setShowCerrarDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Cerrar Orden de Producción
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>¿Estás seguro de cerrar esta OP? Esta acción:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Cambiará el estado a <strong>CERRADA</strong></li>
                  <li>Liberará automáticamente todas las reservas pendientes</li>
                  <li>No permitirá nuevas reservas ni salidas</li>
                </ul>
                
                {loadingResumen ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : resumen && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total Prendas:</span>
                          <p className="font-bold">{resumen.total_prendas}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Salidas Realizadas:</span>
                          <p className="font-bold">{resumen.salidas?.total_salidas || 0}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Reservas Pendientes a Liberar:</span>
                          <p className="font-bold text-orange-500">
                            {(resumen.reservas?.total_reservado - resumen.reservas?.total_liberado).toFixed(2)} unidades
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={procesando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCerrarOP} 
              disabled={procesando || loadingResumen}
              className="bg-primary"
            >
              {procesando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Cierre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación para ANULAR */}
      <AlertDialog open={showAnularDialog} onOpenChange={setShowAnularDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Anular Orden de Producción
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>¿Estás seguro de <strong className="text-destructive">ANULAR</strong> esta OP? Esta acción:</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>Cambiará el estado a <strong className="text-destructive">ANULADA</strong></li>
                  <li>Liberará automáticamente todas las reservas pendientes</li>
                  <li>NO revertirá las salidas de inventario ya realizadas</li>
                  <li>No permitirá nuevas reservas ni salidas</li>
                </ul>
                
                {loadingResumen ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : resumen && (
                  <Card className="bg-destructive/10 border-destructive/20">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total Prendas:</span>
                          <p className="font-bold">{resumen.total_prendas}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Salidas (no se revierten):</span>
                          <p className="font-bold text-amber-600">{resumen.salidas?.total_salidas || 0}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Reservas a Liberar:</span>
                          <p className="font-bold text-orange-500">
                            {(resumen.reservas?.total_reservado - resumen.reservas?.total_liberado).toFixed(2)} unidades
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={procesando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAnularOP} 
              disabled={procesando || loadingResumen}
              className="bg-destructive hover:bg-destructive/90"
            >
              {procesando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Anulación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RegistroDetalleFase2;
