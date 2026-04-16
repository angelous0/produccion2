import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Package, DollarSign, TrendingUp, Loader2, ChevronRight, ChevronDown, Layers, Wrench, Shirt, Info } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// ==================== MODAL DETALLE WIP ====================

function WIPDetalleModal({ registroId, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!registroId) return;
    const token = localStorage.getItem('token');
    axios.get(`${API}/reportes/wip/${registroId}/detalle`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => setDetalle(r.data))
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoading(false));
  }, [registroId]);

  return (
    <Dialog open={!!registroId} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : detalle ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                Desglose WIP — Corte {detalle.registro.n_corte}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{detalle.registro.modelo_nombre} · {detalle.registro.linea_negocio_nombre || 'Sin línea'}</p>
            </DialogHeader>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Costo MP</p>
                  <p className="text-lg font-bold font-mono text-blue-700">{formatCurrency(detalle.resumen.total_mp)}</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Servicios</p>
                  <p className="text-lg font-bold font-mono text-purple-700">{formatCurrency(detalle.resumen.total_servicios)}</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total WIP</p>
                  <p className="text-lg font-bold font-mono text-amber-700">{formatCurrency(detalle.resumen.total_costo)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Tallas producidas */}
            {detalle.tallas.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><Shirt className="h-4 w-4" /> Prendas por talla ({detalle.resumen.total_prendas} total)</h3>
                <div className="flex flex-wrap gap-2">
                  {detalle.tallas.map((t, i) => (
                    <Badge key={i} variant="secondary" className="font-mono">
                      {t.talla_nombre}: {t.cantidad_real}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* MP consumido */}
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><Layers className="h-4 w-4 text-blue-500" /> Materia Prima consumida ({detalle.mp.length} items)</h3>
              {detalle.mp.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin consumos registrados</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Código</TableHead>
                        <TableHead className="text-xs">Nombre</TableHead>
                        <TableHead className="text-xs">Talla</TableHead>
                        <TableHead className="text-right text-xs">Cant.</TableHead>
                        <TableHead className="text-right text-xs">C. Unit.</TableHead>
                        <TableHead className="text-right text-xs">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.mp.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{m.codigo}</TableCell>
                          <TableCell className="text-xs">{m.item_nombre}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.talla_nombre || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNumber(m.cantidad)} {m.unidad_medida}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatCurrency(m.costo_unitario)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(m.costo_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Servicios */}
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><Wrench className="h-4 w-4 text-purple-500" /> Servicios / Mano de obra ({detalle.servicios.length})</h3>
              {detalle.servicios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin servicios registrados</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Servicio</TableHead>
                        <TableHead className="text-xs">Observaciones</TableHead>
                        <TableHead className="text-right text-xs">Cant. Enviada</TableHead>
                        <TableHead className="text-right text-xs">Costo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.servicios.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{s.servicio_nombre || '—'}</TableCell>
                          <TableCell className="text-xs">{s.observaciones || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{s.cantidad_enviada ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(s.costo_calculado)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MODAL DETALLE PT ====================

function CIFDetallePanel({ cif }) {
  if (!cif || !cif.periodo) return <p className="text-xs text-muted-foreground italic">Sin detalle CIF guardado.</p>;
  return (
    <div className="space-y-3 pt-2">
      {/* Cómo se calculó el prorrateo */}
      <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Prorrateo — Período {cif.periodo}</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <span className="text-muted-foreground">Total CIF del mes</span>
          <span className="font-mono font-semibold">{formatCurrency(cif.total_cif_mes)}</span>
          <span className="text-muted-foreground text-[11px] pl-2">· Gastos CIF</span>
          <span className="font-mono text-[11px]">{formatCurrency(cif.gastos_cif)}</span>
          <span className="text-muted-foreground text-[11px] pl-2">· Depreciación</span>
          <span className="font-mono text-[11px]">{formatCurrency(cif.depreciacion)}</span>
          <span className="text-muted-foreground mt-1">Prendas de este lote</span>
          <span className="font-mono mt-1">{formatNumber(cif.prendas_lote)}</span>
          <span className="text-muted-foreground">Total prendas del mes</span>
          <span className="font-mono">{formatNumber(cif.total_prendas_mes)}</span>
          <span className="text-muted-foreground">Proporción</span>
          <span className="font-mono font-semibold text-blue-600">{cif.proporcion_pct}%</span>
          <span className="text-muted-foreground">CIF asignado al lote</span>
          <span className="font-mono font-bold text-amber-700">{formatCurrency(cif.cif_asignado)}</span>
        </div>
      </div>
      {/* Listado de transacciones CIF del mes */}
      {cif.detalle && cif.detalle.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Transacciones CIF del mes ({cif.detalle.length})</p>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[10px]">Fecha</TableHead>
                  <TableHead className="text-[10px]">Categoría</TableHead>
                  <TableHead className="text-[10px]">Descripción</TableHead>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-right text-[10px]">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cif.detalle.map((d, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="font-mono py-1">{d.fecha ? new Date(d.fecha).toLocaleDateString('es-PE') : '—'}</TableCell>
                    <TableCell className="py-1">{d.categoria || '—'}</TableCell>
                    <TableCell className="py-1 max-w-[160px] truncate">{d.descripcion || '—'}</TableCell>
                    <TableCell className="py-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${d.origen === 'factura' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {d.origen === 'factura' ? 'Factura' : 'Gasto'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono py-1">{formatCurrency(d.monto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {(!cif.detalle || cif.detalle.length === 0) && (
        <p className="text-xs text-muted-foreground">Sin transacciones CIF registradas en este período.</p>
      )}
    </div>
  );
}

function PTDetalleModal({ itemId, onClose }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cifExpandido, setCifExpandido] = useState(null); // índice del cierre expandido

  useEffect(() => {
    if (!itemId) return;
    const token = localStorage.getItem('token');
    axios.get(`${API}/reportes/pt-valorizado/${itemId}/detalle`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => setDetalle(r.data))
      .catch(() => toast.error('Error al cargar detalle'))
      .finally(() => setLoading(false));
  }, [itemId]);

  return (
    <Dialog open={!!itemId} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : detalle ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-green-500" />
                Desglose PT — {detalle.item.codigo}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{detalle.item.nombre} · {detalle.item.linea_negocio_nombre || 'Sin línea'}</p>
            </DialogHeader>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-green-50 dark:bg-green-950/30 border-green-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Stock Actual</p>
                  <p className="text-lg font-bold font-mono text-green-700">{formatNumber(detalle.resumen.stock_actual)}</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Costo Promedio</p>
                  <p className="text-lg font-bold font-mono text-blue-700">{formatCurrency(detalle.resumen.costo_promedio)}</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="text-lg font-bold font-mono text-amber-700">{formatCurrency(detalle.resumen.valor_total)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Capas FIFO */}
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><Layers className="h-4 w-4 text-blue-500" /> Capas FIFO ({detalle.resumen.total_capas})</h3>
              {detalle.fifo_capas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin capas de inventario activas</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Fecha Ingreso</TableHead>
                        <TableHead className="text-right text-xs">Ingresado</TableHead>
                        <TableHead className="text-right text-xs">Disponible</TableHead>
                        <TableHead className="text-right text-xs">Costo Unit.</TableHead>
                        <TableHead className="text-right text-xs">Valor Capa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.fifo_capas.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{c.fecha ? new Date(c.fecha).toLocaleDateString('es-PE') : '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNumber(c.cantidad)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatNumber(c.cantidad_disponible)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatCurrency(c.costo_unitario)}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(c.valor_capa)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Órdenes cerradas */}
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-1 mb-2"><Shirt className="h-4 w-4 text-green-600" /> Órdenes de producción cerradas ({detalle.resumen.total_cierres})</h3>
              {detalle.cierres.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin órdenes cerradas</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">N° Corte</TableHead>
                        <TableHead className="text-xs">Modelo</TableHead>
                        <TableHead className="text-xs">Cierre</TableHead>
                        <TableHead className="text-right text-xs">Prendas</TableHead>
                        <TableHead className="text-right text-xs">Costo MP</TableHead>
                        <TableHead className="text-right text-xs">Servicios</TableHead>
                        <TableHead className="text-right text-xs">CIF</TableHead>
                        <TableHead className="text-right text-xs">Total</TableHead>
                        <TableHead className="w-6"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.cierres.map((c, i) => (
                        <>
                          <TableRow key={i}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setCifExpandido(cifExpandido === i ? null : i)}>
                            <TableCell className="font-mono text-xs font-semibold">{c.n_corte}</TableCell>
                            <TableCell className="text-xs">{c.modelo_nombre}</TableCell>
                            <TableCell className="text-xs font-mono">{c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-PE') : '—'}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{c.total_prendas}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatCurrency(c.costo_mp)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatCurrency(c.costo_servicios)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              <span className={c.costo_cif > 0 ? 'text-amber-700 font-medium' : ''}>
                                {formatCurrency(c.costo_cif)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(c.costo_total)}</TableCell>
                            <TableCell className="w-6 text-muted-foreground">
                              {cifExpandido === i ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </TableCell>
                          </TableRow>
                          {cifExpandido === i && (
                            <TableRow key={`cif-${i}`}>
                              <TableCell colSpan={9} className="bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                                <div className="flex items-center gap-1 mb-2">
                                  <Info className="h-3.5 w-3.5 text-amber-600" />
                                  <span className="text-xs font-semibold text-amber-700">Detalle CIF — OP {c.n_corte}</span>
                                </div>
                                <CIFDetallePanel cif={c.cif_detalle} />
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MP VALORIZADO ====================

export function ReporteMPValorizado({ categoria = 'todos', lineaNegocioId = 'todos' }) {
  const { empresaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ empresa_id: empresaId || 6 });
      if (categoria && categoria !== 'todos') params.set('categoria', categoria);
      if (lineaNegocioId && lineaNegocioId !== 'todos') params.set('linea_negocio_id', lineaNegocioId);

      const res = await axios.get(`${API}/reportes/mp-valorizado?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      toast.error('Error al cargar reporte MP');
    } finally {
      setLoading(false);
    }
  }, [categoria, lineaNegocioId, empresaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="reporte-mp-valorizado">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventario MP Valorizado</h1>
          <p className="text-muted-foreground">Materia prima con stock y valorización FIFO</p>
        </div>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Valor Total MP</p>
              <p className="text-xl font-bold font-mono" data-testid="total-valor-mp">{formatCurrency(data.resumen.valor_total_inventario)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Línea de Negocio</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">Costo Prom.</TableHead>
                <TableHead className="text-right">Valor Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.codigo}</TableCell>
                  <TableCell>
                    {item.nombre}
                    {item.control_por_rollos && <Badge variant="outline" className="ml-2 text-xs">Rollos</Badge>}
                  </TableCell>
                  <TableCell>
                    {item.categoria && <Badge variant="secondary" className="text-xs">{item.categoria}</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.linea_negocio_nombre || '—'}</TableCell>
                  <TableCell>{item.unidad_medida}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(item.stock_actual)}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(item.total_reservado)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatNumber(item.disponible)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.costo_promedio)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valor_total)}</TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No hay items de MP</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== WIP ====================

export function ReporteWIP({ lineaNegocioId = 'todos' }) {
  const { empresaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalleId, setDetalleId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ empresa_id: empresaId || 6 });
      if (lineaNegocioId && lineaNegocioId !== 'todos') params.set('linea_negocio_id', lineaNegocioId);

      const res = await axios.get(`${API}/reportes/wip?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      toast.error('Error al cargar reporte WIP');
    } finally {
      setLoading(false);
    }
  }, [lineaNegocioId, empresaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="reporte-wip">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WIP - Trabajo en Proceso</h1>
          <p className="text-muted-foreground">Registros en producción con costos acumulados · clic en una fila para ver el desglose</p>
        </div>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total WIP</p>
              <p className="text-xl font-bold font-mono" data-testid="total-wip">{formatCurrency(data.resumen.total_wip)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Corte</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Línea de Negocio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PT Asignado</TableHead>
                <TableHead className="text-right">Prendas</TableHead>
                <TableHead className="text-right">Costo MP</TableHead>
                <TableHead className="text-right">Costo Servicios</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.ordenes || []).map((reg) => (
                <TableRow
                  key={reg.id}
                  className="cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-950/20 transition-colors"
                  onClick={() => setDetalleId(reg.id)}
                >
                  <TableCell className="font-mono font-semibold">{reg.n_corte}</TableCell>
                  <TableCell>{reg.modelo_nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{reg.linea_negocio_nombre || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{reg.estado || reg.estado_op}</Badge></TableCell>
                  <TableCell>
                    {reg.pt_codigo ? (
                      <span className="font-mono text-sm">{reg.pt_codigo}</span>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Sin PT</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{reg.total_prendas}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(reg.costo_mp)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(reg.costo_servicio)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(reg.costo_wip)}</TableCell>
                  <TableCell className="text-muted-foreground"><ChevronRight className="h-4 w-4" /></TableCell>
                </TableRow>
              ))}
              {(data.ordenes || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No hay registros en proceso</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <WIPDetalleModal registroId={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}

// ==================== PT VALORIZADO ====================

export function ReportePTValorizado({ categoria = 'todos', lineaNegocioId = 'todos' }) {
  const { empresaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalleId, setDetalleId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ empresa_id: empresaId || 6 });
      if (categoria && categoria !== 'todos') params.set('categoria', categoria);
      if (lineaNegocioId && lineaNegocioId !== 'todos') params.set('linea_negocio_id', lineaNegocioId);

      const res = await axios.get(`${API}/reportes/pt-valorizado?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      toast.error('Error al cargar reporte PT');
    } finally {
      setLoading(false);
    }
  }, [categoria, lineaNegocioId, empresaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6" data-testid="reporte-pt-valorizado">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventario PT Valorizado</h1>
          <p className="text-muted-foreground">Producto terminado con stock y valorización · clic en una fila para ver el desglose</p>
        </div>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Valor Total PT</p>
              <p className="text-xl font-bold font-mono" data-testid="total-valor-pt">{formatCurrency(data.resumen.valor_total_pt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Línea de Negocio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Costo Prom.</TableHead>
                <TableHead className="text-right">Valor Stock</TableHead>
                <TableHead className="text-right">OPs Cerradas</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-green-50/60 dark:hover:bg-green-950/20 transition-colors"
                  onClick={() => setDetalleId(item.id)}
                >
                  <TableCell className="font-mono">{item.codigo}</TableCell>
                  <TableCell>{item.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.linea_negocio_nombre || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(item.stock_actual)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.costo_promedio)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valor_total)}</TableCell>
                  <TableCell className="text-right font-mono">{item.total_cierres}</TableCell>
                  <TableCell className="text-muted-foreground"><ChevronRight className="h-4 w-4" /></TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay items PT</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PTDetalleModal itemId={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  );
}
