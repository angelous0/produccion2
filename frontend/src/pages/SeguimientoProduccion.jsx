import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Activity, Layers, AlertTriangle, PauseCircle, Clock, CheckCircle2,
  ExternalLink, ArrowRight, Filter, Shirt, Flame, CalendarClock,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export const SeguimientoProduccion = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'wip-etapa';
  const navigate = useNavigate();

  // KPI data
  const [enProcesoData, setEnProcesoData] = useState(null);
  const [wipData, setWipData] = useState(null);
  const [atrasadosData, setAtrasadosData] = useState(null);
  const [paralizadosData, setParalizadosData] = useState(null);
  const [filtros, setFiltros] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterEstado, setFilterEstado] = useState('');
  const [filterModelo, setFilterModelo] = useState('');

  // Paralizados filter
  const [soloActivas, setSoloActivas] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const params = new URLSearchParams();
    if (filterEstado && filterEstado !== '_all') params.append('estado', filterEstado);
    if (filterModelo && filterModelo !== '_all') params.append('modelo_id', filterModelo);

    const safe = (p) => p.catch(() => null);
    const [ep, wip, atr, filtrosRes] = await Promise.all([
      safe(axios.get(`${API}/reportes-produccion/en-proceso?${params}`)),
      safe(axios.get(`${API}/reportes-produccion/wip-etapa`)),
      safe(axios.get(`${API}/reportes-produccion/atrasados`)),
      safe(axios.get(`${API}/reportes-produccion/filtros`)),
    ]);

    setEnProcesoData(ep?.data || null);
    setWipData(wip?.data || null);
    setAtrasadosData(atr?.data || null);
    setFiltros(filtrosRes?.data || null);
    setLoading(false);
  }, [filterEstado, filterModelo]);

  const fetchParalizados = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = soloActivas ? '?solo_activas=true' : '';
      const res = await fetch(`${API}/reportes/paralizados${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setParalizadosData(await res.json());
    } catch { /* ignore */ }
  }, [soloActivas]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchParalizados(); }, [fetchParalizados]);

  // KPI calculations
  const registros = enProcesoData?.registros || [];
  const totalLotes = enProcesoData?.total || registros.length;
  const totalPrendas = registros.reduce((s, r) => s + (r.total_prendas || 0), 0);
  const lotesUrgentes = registros.filter(r => r.urgente).length;
  const movsVencidos = registros.reduce((s, r) => s + (r.movs_vencidos || 0), 0);

  // Alertas: fusionar urgentes + atrasados + movs vencidos
  const buildAlertas = () => {
    const alertMap = new Map();
    const addAlert = (r, tipo) => {
      if (!alertMap.has(r.id)) {
        alertMap.set(r.id, { ...r, alertas: [] });
      }
      const entry = alertMap.get(r.id);
      if (!entry.alertas.includes(tipo)) entry.alertas.push(tipo);
    };
    registros.forEach(r => {
      if (r.urgente) addAlert(r, 'URGENTE');
      if (r.movs_vencidos > 0) addAlert(r, 'MOV_VENCIDO');
    });
    (atrasadosData?.registros || []).forEach(r => {
      addAlert(r, 'ATRASADO');
    });
    return Array.from(alertMap.values()).sort((a, b) => b.alertas.length - a.alertas.length);
  };
  const alertas = buildAlertas();

  // WIP
  const etapas = wipData?.etapas || [];
  const wipTotalPrendas = etapas.reduce((s, e) => s + e.prendas, 0);
  const chartData = etapas.map((e, i) => ({
    name: e.etapa, lotes: e.lotes, prendas: e.prendas, fill: COLORS[i % COLORS.length],
  }));

  // Paralizados helpers
  const paralizaciones = paralizadosData?.paralizaciones || [];
  const pResumen = paralizadosData?.resumen || {};
  const pMotivos = paralizadosData?.motivos || [];
  const formatFecha = (str) => {
    if (!str) return '-';
    try {
      return new Date(str).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return str; }
  };

  const getDiasEnEtapa = (lote_mas_antiguo) => {
    if (!lote_mas_antiguo) return 0;
    const diff = Date.now() - new Date(lote_mas_antiguo).getTime();
    return Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0);
  };

  const alertaBadge = (tipo) => {
    switch (tipo) {
      case 'URGENTE':
        return <Badge className="bg-red-600 text-white text-[10px] px-1.5 gap-0.5"><Flame className="h-2.5 w-2.5" />URGENTE</Badge>;
      case 'MOV_VENCIDO':
        return <Badge className="bg-amber-500 text-white text-[10px] px-1.5 gap-0.5"><CalendarClock className="h-2.5 w-2.5" />MOV. VENC.</Badge>;
      case 'ATRASADO':
        return <Badge className="bg-red-700 text-white text-[10px] px-1.5 gap-0.5"><Clock className="h-2.5 w-2.5" />ATRASADO</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" data-testid="seguimiento-produccion">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Seguimiento de Produccion</h2>
        <p className="text-sm text-muted-foreground">Monitoreo de lotes, etapas y cumplimiento</p>
      </div>

      {/* SECCION 1: KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lotes Activos</span>
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{loading ? '-' : totalLotes}</p>
            <p className="text-xs text-muted-foreground">en proceso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Prendas</span>
              <Shirt className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold">{loading ? '-' : totalPrendas.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">en produccion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lotes Urgentes</span>
              <Flame className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold">
              {loading ? '-' : lotesUrgentes}
              {lotesUrgentes > 0 && <Badge variant="destructive" className="ml-2 text-[10px]">!</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">prioridad alta</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Movs. Vencidos</span>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold">
              {loading ? '-' : movsVencidos}
              {movsVencidos > 0 && <Badge variant="destructive" className="ml-2 text-[10px]">!</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">requieren atencion</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Estado / Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                {(filtros?.estados || []).map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterModelo} onValueChange={setFilterModelo}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los modelos</SelectItem>
                {(filtros?.modelos || []).map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterEstado || filterModelo) && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setFilterEstado(''); setFilterModelo(''); }}>
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECCION 2: 3 TABS */}
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="wip-etapa" className="text-xs gap-1.5" data-testid="tab-wip-etapa">
            <Layers className="h-3.5 w-3.5" /> WIP por Etapa
          </TabsTrigger>
          <TabsTrigger value="alertas" className="text-xs gap-1.5" data-testid="tab-alertas">
            <AlertTriangle className="h-3.5 w-3.5" /> Alertas
            {alertas.length > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">{alertas.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="paralizados" className="text-xs gap-1.5" data-testid="tab-paralizados">
            <PauseCircle className="h-3.5 w-3.5" /> Paralizados
            {(pResumen.activas || 0) > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">{pResumen.activas}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: WIP por Etapa */}
        <TabsContent value="wip-etapa">
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
            ) : (
              <>
                {chartData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Prendas por Etapa
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                          <Bar dataKey="prendas" fill="#3b82f6" name="Prendas" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-medium">Etapa</th>
                            <th className="text-right p-3 font-medium">Lotes</th>
                            <th className="text-right p-3 font-medium">Prendas</th>
                            <th className="text-right p-3 font-medium">% Prendas</th>
                            <th className="text-right p-3 font-medium">Urgentes</th>
                            <th className="text-right p-3 font-medium">Dias prom. en etapa</th>
                            <th className="text-left p-3 font-medium">Lote mas antiguo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {etapas.map((e, i) => {
                            const diasEtapa = getDiasEnEtapa(e.lote_mas_antiguo);
                            const alerta = diasEtapa > 7;
                            return (
                              <tr key={e.etapa} className={`border-b hover:bg-muted/30 transition-colors ${alerta ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                    <span className="font-medium">{e.etapa}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right font-mono">{e.lotes}</td>
                                <td className="p-3 text-right font-mono">{e.prendas.toLocaleString()}</td>
                                <td className="p-3 text-right font-mono">{wipTotalPrendas > 0 ? ((e.prendas / wipTotalPrendas) * 100).toFixed(1) : 0}%</td>
                                <td className="p-3 text-right">
                                  {e.urgentes > 0 ? <Badge variant="destructive">{e.urgentes}</Badge> : <span className="text-muted-foreground">0</span>}
                                </td>
                                <td className="p-3 text-right">
                                  <span className={`font-mono ${alerta ? 'text-amber-600 font-semibold' : ''}`}>
                                    {diasEtapa}d
                                    {alerta && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                                  </span>
                                </td>
                                <td className="p-3 text-sm text-muted-foreground">
                                  {e.lote_mas_antiguo ? formatDate(e.lote_mas_antiguo) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                          {etapas.length === 0 && (
                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin datos de etapas</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: Alertas */}
        <TabsContent value="alertas">
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
            ) : alertas.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                  <p className="text-lg font-semibold text-green-700 dark:text-green-400">Todo en orden</p>
                  <p className="text-sm text-muted-foreground mt-1">No hay lotes que requieran atencion inmediata</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {alertas.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => navigate(`/registros/editar/${r.id}`)}
                      >
                        <div className="flex flex-wrap gap-1 min-w-[140px]">
                          {r.alertas.map(tipo => (
                            <span key={tipo}>{alertaBadge(tipo)}</span>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-semibold text-sm">Corte {r.n_corte}</span>
                          <span className="text-muted-foreground text-sm mx-2">—</span>
                          <span className="text-sm text-muted-foreground">{r.modelo_nombre}</span>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">{r.estado}</Badge>
                        <span className="font-mono text-sm text-right w-16 shrink-0">{(r.total_prendas || 0).toLocaleString()} pzas</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: Paralizados */}
        <TabsContent value="paralizados">
          <div className="space-y-4">
            {/* KPIs paralizados */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activas</span>
                    <PauseCircle className="h-4 w-4 text-red-500" />
                  </div>
                  <p className="text-3xl font-bold text-red-600">{pResumen.activas || 0}</p>
                  <p className="text-xs text-muted-foreground">{(pResumen.prendas_afectadas || 0).toLocaleString()} prendas afectadas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resueltas</span>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-green-600">{pResumen.resueltas || 0}</p>
                  <p className="text-xs text-muted-foreground">historial</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</span>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="text-3xl font-bold">{pResumen.total || 0}</p>
                  <p className="text-xs text-muted-foreground">paralizaciones</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dias Promedio</span>
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-3xl font-bold">{pResumen.dias_promedio || 0}</p>
                  <p className="text-xs text-muted-foreground">duracion promedio</p>
                </CardContent>
              </Card>
            </div>

            {/* Motivos */}
            {pMotivos.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold">Motivos de Paralizacion</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {pMotivos.map((m) => (
                      <Badge key={m.motivo} variant="outline" className="text-xs py-1 px-2.5">
                        {m.motivo} <span className="ml-1.5 font-bold">{m.cantidad}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabla paralizaciones */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PauseCircle className="h-4 w-4" /> Paralizaciones ({paralizaciones.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Solo activas</span>
                    <Switch checked={soloActivas} onCheckedChange={setSoloActivas} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {paralizaciones.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                    <p className="text-lg font-semibold text-green-700 dark:text-green-400">Sin paralizaciones activas</p>
                    <p className="text-sm text-muted-foreground mt-1">Produccion fluyendo con normalidad</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-10">Estado</TableHead>
                          <TableHead className="text-xs">Corte</TableHead>
                          <TableHead className="text-xs">Modelo</TableHead>
                          <TableHead className="text-xs">Motivo</TableHead>
                          <TableHead className="text-xs">Servicio</TableHead>
                          <TableHead className="text-xs">Persona</TableHead>
                          <TableHead className="text-xs">Inicio</TableHead>
                          <TableHead className="text-xs">Fin</TableHead>
                          <TableHead className="text-xs text-right">Dias</TableHead>
                          <TableHead className="text-xs">Prendas</TableHead>
                          <TableHead className="text-xs w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paralizaciones.map((p) => (
                          <TableRow
                            key={p.id}
                            className={`cursor-pointer hover:bg-accent/50 ${p.activa ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}
                            onClick={() => navigate(`/registros/editar/${p.registro_id}`)}
                          >
                            <TableCell>
                              {p.activa ? (
                                <Badge className="bg-red-600 text-white text-[10px] px-1.5">Activa</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 text-green-600 border-green-300">Resuelta</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">
                              {p.n_corte}
                              {p.urgente && <span className="ml-1 text-[9px] font-bold text-red-600">URG</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.modelo_nombre || '-'}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="secondary" className="text-[10px]">{p.motivo || 'Sin motivo'}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.servicio || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.persona || '-'}</TableCell>
                            <TableCell className="text-xs font-mono">{formatFecha(p.fecha_inicio)}</TableCell>
                            <TableCell className="text-xs font-mono">{p.activa ? '-' : formatFecha(p.fecha_fin)}</TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">
                              <span className={p.activa && p.dias > 3 ? 'text-red-600' : p.activa ? 'text-amber-600' : ''}>
                                {p.dias}d
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{(p.prendas || 0).toLocaleString()}</TableCell>
                            <TableCell><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {paralizaciones.filter(p => p.activa && p.comentario).length > 0 && (
                  <div className="border-t p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Comentarios de paralizaciones activas</p>
                    {paralizaciones.filter(p => p.activa && p.comentario).map((p) => (
                      <div key={p.id} className="text-xs p-2 rounded border bg-red-50/30 dark:bg-red-950/10">
                        <span className="font-semibold">Corte {p.n_corte}</span>
                        <span className="text-muted-foreground ml-1">({p.motivo})</span>
                        <span className="mx-1">—</span>
                        <span className="italic">{p.comentario}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
