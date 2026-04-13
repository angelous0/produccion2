import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { DollarSign, Lock, Search, X, Loader2, Package, Scissors, Truck, Receipt, FileDown } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => 'S/ ' + (n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => (n || 0).toLocaleString('es-PE');

export default function CostoPorLote() {
  const [data, setData] = useState({ items: [], totales: {} });
  const [loading, setLoading] = useState(true);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCerrado, setFiltroCerrado] = useState('');
  const [orden, setOrden] = useState('costo_desc');

  // Detalle dialog
  const [detalle, setDetalle] = useState(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/reportes-produccion/costo-lote`)
      .then(r => setData(r.data || { items: [], totales: {} }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const abrirDetalle = (lote) => {
    setDetalleOpen(true);
    setDetalleLoading(true);
    setDetalle(null);
    axios.get(`${API}/reportes-produccion/costo-lote/${lote.id}/detalle`)
      .then(r => setDetalle(r.data))
      .catch(() => setDetalle(null))
      .finally(() => setDetalleLoading(false));
  };

  // Filtrar y ordenar
  const items = useMemo(() => {
    let list = [...(data.items || [])];
    if (busqueda) {
      const q = busqueda.toLowerCase();
      list = list.filter(l =>
        (l.n_corte || '').toString().toLowerCase().includes(q) ||
        (l.modelo || '').toLowerCase().includes(q) ||
        (l.marca || '').toLowerCase().includes(q)
      );
    }
    if (filtroEstado) list = list.filter(l => l.estado === filtroEstado);
    if (filtroCerrado === 'cerrado') list = list.filter(l => l.cerrado);
    if (filtroCerrado === 'abierto') list = list.filter(l => !l.cerrado);
    if (orden === 'costo_desc') list.sort((a, b) => b.costo_total - a.costo_total);
    else if (orden === 'costo_asc') list.sort((a, b) => a.costo_total - b.costo_total);
    else if (orden === 'unitario_desc') list.sort((a, b) => b.costo_unitario - a.costo_unitario);
    return list;
  }, [data.items, busqueda, filtroEstado, filtroCerrado, orden]);

  const kpis = useMemo(() => {
    const t = { mp: 0, serv: 0, otros: 0, cif: 0, total: 0, prendas: 0, lotes: items.length };
    items.forEach(l => {
      t.mp += l.costo_mp; t.serv += l.costo_servicios; t.otros += l.costo_otros;
      t.cif += l.costo_cif; t.total += l.costo_total; t.prendas += l.cantidad_prendas;
    });
    t.promUnitario = t.prendas > 0 ? t.total / t.prendas : 0;
    return t;
  }, [items]);

  const estados = useMemo(() => {
    const set = new Set((data.items || []).map(l => l.estado).filter(Boolean));
    return [...set].sort();
  }, [data.items]);

  const hayFiltros = busqueda || filtroEstado || filtroCerrado;
  const limpiarFiltros = () => { setBusqueda(''); setFiltroEstado(''); setFiltroCerrado(''); };

  const estadoColor = (e) => {
    if (e === 'Costura' || e === 'en_proceso') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (e === 'completado') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (e === 'paralizado') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    return '';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" /> Costo por Lote
        </h2>
        <p className="text-sm text-muted-foreground">Costos completos por lote: MP + Servicios + Otros + CIF</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Costo Total</p>
          <p className="text-xl font-bold text-primary font-mono">{fmt(kpis.total)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{kpis.lotes} lotes</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Costo Prom / Prenda</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{fmt(kpis.promUnitario)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{fmtNum(kpis.prendas)} prendas</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Materia Prima</p>
          <p className="text-xl font-bold font-mono">{fmt(kpis.mp)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{kpis.total > 0 ? Math.round(kpis.mp / kpis.total * 100) : 0}% del total</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Servicios + Otros + CIF</p>
          <p className="text-xl font-bold font-mono">{fmt(kpis.serv + kpis.otros + kpis.cif)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{kpis.total > 0 ? Math.round((kpis.serv + kpis.otros + kpis.cif) / kpis.total * 100) : 0}% del total</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar corte, modelo, marca..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>{estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filtroCerrado} onValueChange={setFiltroCerrado}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Cierre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cerrado">Cerrados</SelectItem>
            <SelectItem value="abierto">Abiertos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orden} onValueChange={setOrden}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="costo_desc">Mayor costo</SelectItem>
            <SelectItem value="costo_asc">Menor costo</SelectItem>
            <SelectItem value="unitario_desc">Mayor costo/prenda</SelectItem>
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-9 text-xs">
            <X className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sin datos de costo registrados</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Corte</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Modelo</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Estado</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Prendas</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">MP</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Servicios</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Otros</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">CIF</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">Total</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground">S/ Prenda</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr
                  key={l.id}
                  className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => abrirDetalle(l)}
                >
                  <td className="px-2 py-2 font-bold whitespace-nowrap">
                    {l.n_corte}
                    {l.cerrado && <Lock className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                    {l.urgente && <span className="ml-1 text-red-500 text-xs font-bold">!</span>}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{l.modelo || '—'}</td>
                  <td className="px-2 py-2">
                    <Badge variant="outline" className={`text-[10px] ${estadoColor(l.estado)}`}>{l.estado || '—'}</Badge>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{fmtNum(l.cantidad_prendas)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{fmt(l.costo_mp)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{fmt(l.costo_servicios)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{fmt(l.costo_otros)}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{l.cerrado ? fmt(l.costo_cif) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-2 text-right font-bold font-mono text-primary">{fmt(l.costo_total)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-600 text-xs">{fmt(l.costo_unitario)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/50 border-t font-bold">
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">TOTALES</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmtNum(kpis.prendas)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmt(kpis.mp)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmt(kpis.serv)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmt(kpis.otros)}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{fmt(kpis.cif)}</td>
                <td className="px-2 py-2 text-right font-mono text-primary">{fmt(kpis.total)}</td>
                <td className="px-2 py-2 text-right font-mono text-emerald-600 text-xs">{fmt(kpis.promUnitario)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Dialog Detalle */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detalleLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detalle ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    Corte {detalle.n_corte} — {detalle.modelo}
                    {detalle.cerrado && <Badge variant="secondary" className="text-[10px]"><Lock className="h-3 w-3 mr-1" />Cerrado</Badge>}
                    {detalle.urgente && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
                  </DialogTitle>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => window.open(`${API}/reportes-produccion/costo-lote/${detalle.registro_id}/detalle-pdf`, '_blank')}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{detalle.marca} &middot; {detalle.estado}</p>
              </DialogHeader>

              {/* Resumen de costos */}
              <div className="grid grid-cols-5 gap-2 mt-4">
                {[
                  { label: 'MP', value: detalle.resumen.costo_mp, color: 'text-blue-600', icon: Package },
                  { label: 'Servicios', value: detalle.resumen.costo_servicios, color: 'text-violet-600', icon: Scissors },
                  { label: 'Otros', value: detalle.resumen.costo_otros, color: 'text-amber-600', icon: Receipt },
                  { label: 'CIF', value: detalle.resumen.costo_cif, color: 'text-orange-600', icon: Truck },
                  { label: 'TOTAL', value: detalle.resumen.costo_total, color: 'text-primary font-bold', icon: DollarSign },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border p-2.5 text-center">
                    <c.icon className={`h-4 w-4 mx-auto mb-1 ${c.color}`} />
                    <p className="text-[10px] text-muted-foreground uppercase">{c.label}</p>
                    <p className={`text-sm font-mono font-semibold ${c.color}`}>{fmt(c.value)}</p>
                  </div>
                ))}
              </div>

              {/* Barra proporcional */}
              {detalle.resumen.costo_total > 0 && (
                <div className="flex rounded-full h-3 overflow-hidden mt-3">
                  {detalle.resumen.costo_mp > 0 && <div className="bg-blue-500" style={{ width: `${(detalle.resumen.costo_mp / detalle.resumen.costo_total * 100)}%` }} title={`MP: ${Math.round(detalle.resumen.costo_mp / detalle.resumen.costo_total * 100)}%`} />}
                  {detalle.resumen.costo_servicios > 0 && <div className="bg-violet-500" style={{ width: `${(detalle.resumen.costo_servicios / detalle.resumen.costo_total * 100)}%` }} title={`Servicios: ${Math.round(detalle.resumen.costo_servicios / detalle.resumen.costo_total * 100)}%`} />}
                  {detalle.resumen.costo_otros > 0 && <div className="bg-amber-500" style={{ width: `${(detalle.resumen.costo_otros / detalle.resumen.costo_total * 100)}%` }} title={`Otros: ${Math.round(detalle.resumen.costo_otros / detalle.resumen.costo_total * 100)}%`} />}
                  {detalle.resumen.costo_cif > 0 && <div className="bg-orange-500" style={{ width: `${(detalle.resumen.costo_cif / detalle.resumen.costo_total * 100)}%` }} title={`CIF: ${Math.round(detalle.resumen.costo_cif / detalle.resumen.costo_total * 100)}%`} />}
                </div>
              )}
              <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />MP</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" />Servicios</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Otros</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />CIF</span>
              </div>

              {/* Detalle MP */}
              {detalle.detalle_mp?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Materia Prima ({detalle.detalle_mp.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Material</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Cant.</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_mp.map((m, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5">
                              <span className="font-medium">{m.item}</span>
                              {m.codigo && <span className="text-muted-foreground ml-1">({m.codigo})</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{m.cantidad}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(m.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={2} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-blue-600">{fmt(detalle.detalle_mp.reduce((s, m) => s + m.costo, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalle Servicios */}
              {detalle.detalle_servicios?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-2 flex items-center gap-1">
                    <Scissors className="h-3.5 w-3.5" /> Servicios ({detalle.detalle_servicios.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Servicio</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Persona</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Env.</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Tarifa</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_servicios.map((s, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 font-medium">{s.servicio}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{s.persona || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{s.enviadas}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">S/ {s.tarifa}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(s.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={4} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-violet-600">{fmt(detalle.detalle_servicios.reduce((s, m) => s + m.costo, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Detalle Otros Costos */}
              {detalle.detalle_otros?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" /> Otros Costos ({detalle.detalle_otros.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Descripcion</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Proveedor</th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Fecha</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.detalle_otros.map((o, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5 font-medium">{o.descripcion}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{o.proveedor || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{o.fecha || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">{fmt(o.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 border-t">
                        <tr>
                          <td colSpan={3} className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Subtotal</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-600">{fmt(detalle.detalle_otros.reduce((s, o) => s + o.monto, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* CIF nota */}
              {detalle.cerrado && detalle.resumen.costo_cif > 0 && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-1 flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" /> CIF (Costos Indirectos de Fabricacion)
                  </h4>
                  <p className="text-sm font-mono font-bold text-orange-600">{fmt(detalle.resumen.costo_cif)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Calculado al momento del cierre del lote</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">No se pudo cargar el detalle</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
