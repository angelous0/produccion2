import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../components/ui/tooltip';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Filter, Package, Wrench, RefreshCw,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (d) => {
  if (!d) return '-';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
};

const estadoBadge = (estado) => {
  const map = {
    VENCIDO:     { cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300', icon: <AlertTriangle className="h-3 w-3" /> },
    EN_ARREGLO:  { cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300', icon: <Wrench className="h-3 w-3" /> },
    PARCIAL:     { cls: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300', icon: <Wrench className="h-3 w-3" /> },
    COMPLETADO:  { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
    SIN_ASIGNAR: { cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300', icon: <Clock className="h-3 w-3" /> },
  };
  const { cls, icon } = map[estado] || map.SIN_ASIGNAR;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`} data-testid={`badge-${estado}`}>
      {icon} {estado === 'SIN_ASIGNAR' ? 'SIN ASIGNAR' : estado}
    </span>
  );
};

export const ControlFallados = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({ filas: [], kpis: {} });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filtros, setFiltros] = useState({
    estado: '', servicio_id: '', persona_id: '', fecha_desde: '', fecha_hasta: '',
    solo_vencidos: false, solo_pendientes: false, linea_negocio_id: '',
  });
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [lineas, setLineas] = useState([]);

  const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => {
        if (v === true) p.set(k, 'true');
        else if (v && v !== '') p.set(k, v);
      });
      const res = await axios.get(`${API}/fallados-control?${p.toString()}`, { headers: hdrs() });
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const h = hdrs();
    Promise.allSettled([
      axios.get(`${API}/servicios-produccion`, { headers: h }),
      axios.get(`${API}/personas-produccion`, { headers: h }),
      axios.get(`${API}/lineas-negocio`, { headers: h }),
    ]).then(([s, p, l]) => {
      if (s.status === 'fulfilled') setServicios(s.value.data || []);
      if (p.status === 'fulfilled') setPersonas(p.value.data || []);
      if (l.status === 'fulfilled') setLineas(l.value.data || []);
    });
  }, []);

  const k = data.kpis || {};
  const filas = data.filas || [];
  const hasActiveFilters = Object.entries(filtros).some(([, v]) => v === true || (v && v !== ''));

  const clearFilters = () => setFiltros({
    estado: '', servicio_id: '', persona_id: '', fecha_desde: '', fecha_hasta: '',
    solo_vencidos: false, solo_pendientes: false, linea_negocio_id: '',
  });

  return (
    <div className="space-y-4" data-testid="control-fallados-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Vista operativa diaria — cada fila es un arreglo individual o un lote sin asignar</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="h-8 text-xs" data-testid="btn-filtros">
            <Filter className="h-3 w-3 mr-1" /> Filtros {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-4 text-[9px]">ON</Badge>}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={fetchData} className="h-8 text-xs" data-testid="btn-refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="kpi-section">
        <KpiCard label="Total Fallados" value={k.total_fallados || 0} icon={<XCircle className="h-4 w-4" />} color="zinc" />
        <KpiCard label="Pendientes" value={k.total_pendiente || 0} icon={<Clock className="h-4 w-4" />} color={k.total_pendiente > 0 ? 'amber' : 'zinc'} />
        <KpiCard label="Vencidos" value={k.total_vencidos || 0} icon={<AlertTriangle className="h-4 w-4" />} color={k.total_vencidos > 0 ? 'red' : 'zinc'} />
        <KpiCard label="Recuperado" value={k.total_recuperado || 0} icon={<CheckCircle2 className="h-4 w-4" />} color={k.total_recuperado > 0 ? 'emerald' : 'zinc'} />
        <KpiCard label="Liquidacion" value={k.total_liquidacion || 0} icon={<Package className="h-4 w-4" />} color={k.total_liquidacion > 0 ? 'orange' : 'zinc'} />
        <KpiCard label="Merma" value={k.total_merma || 0} icon={<AlertTriangle className="h-4 w-4" />} color={k.total_merma > 0 ? 'red' : 'zinc'} />
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card data-testid="filtros-panel">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
              <FilterSelect label="Estado" value={filtros.estado} onChange={v => setFiltros({ ...filtros, estado: v })} testId="filter-estado"
                options={[{v:'VENCIDO',l:'Vencido'},{v:'EN_ARREGLO',l:'En Arreglo'},{v:'PARCIAL',l:'Parcial'},{v:'COMPLETADO',l:'Completado'},{v:'SIN_ASIGNAR',l:'Sin Asignar'}]} />
              <FilterSelect label="Servicio" value={filtros.servicio_id} onChange={v => setFiltros({ ...filtros, servicio_id: v })} testId="filter-servicio"
                options={servicios.map(s => ({v:s.id,l:s.nombre}))} />
              <FilterSelect label="Persona" value={filtros.persona_id} onChange={v => setFiltros({ ...filtros, persona_id: v })} testId="filter-persona"
                options={personas.map(p => ({v:p.id,l:p.nombre}))} />
              {lineas.length > 0 && (
                <FilterSelect label="Linea Negocio" value={filtros.linea_negocio_id} onChange={v => setFiltros({ ...filtros, linea_negocio_id: v })} testId="filter-linea"
                  options={lineas.map(l => ({v:l.id,l:l.nombre}))} />
              )}
              <div>
                <Label className="text-[10px]">Desde</Label>
                <Input type="date" className="h-7 text-xs" value={filtros.fecha_desde} onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} data-testid="filter-desde" />
              </div>
              <div>
                <Label className="text-[10px]">Hasta</Label>
                <Input type="date" className="h-7 text-xs" value={filtros.fecha_hasta} onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} data-testid="filter-hasta" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={filtros.solo_vencidos} onCheckedChange={v => setFiltros({ ...filtros, solo_vencidos: v })} data-testid="filter-solo-vencidos" />
                  <span className="text-[10px]">Solo vencidos</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={filtros.solo_pendientes} onCheckedChange={v => setFiltros({ ...filtros, solo_pendientes: v })} data-testid="filter-solo-pendientes" />
                  <span className="text-[10px]">Solo pendientes</span>
                </label>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs" data-testid="btn-clear-filters">Limpiar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card data-testid="tabla-fallados">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Cargando...</div>
          ) : filas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-400" />
              <p className="text-sm font-medium">Sin fallados</p>
              <p className="text-xs">No hay registros que coincidan con los filtros</p>
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold w-16">Corte</TableHead>
                    <TableHead className="text-[11px] font-semibold">Modelo</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-16">Fallados</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-16">Enviado</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-16">Recup.</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-16">Pend.</TableHead>
                    <TableHead className="text-[11px] font-semibold">Servicio</TableHead>
                    <TableHead className="text-[11px] font-semibold">Persona</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-20">Envio</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-14">Dias</TableHead>
                    <TableHead className="text-[11px] font-semibold text-center w-24">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((r, idx) => {
                    const isSinAsignar = r.tipo_fila === 'SIN_ARREGLO';
                    const rowBg = r.estado === 'VENCIDO' ? 'bg-red-50/50 dark:bg-red-950/10' :
                      isSinAsignar ? 'bg-amber-50/30 dark:bg-amber-950/10' :
                      r.estado === 'COMPLETADO' ? 'bg-emerald-50/20 dark:bg-emerald-950/5' : '';
                    return (
                      <Tooltip key={r.arreglo_id || `sin-${r.registro_id}-${idx}`}>
                        <TooltipTrigger asChild>
                          <TableRow
                            className={`cursor-pointer transition-colors hover:bg-muted/50 ${rowBg}`}
                            onClick={() => navigate(`/registros/editar/${r.registro_id}`)}
                            data-testid={`row-${idx}`}
                          >
                            <TableCell className="font-mono font-bold text-sm">{r.n_corte}</TableCell>
                            <TableCell>
                              <div className="text-xs truncate max-w-[120px]">{r.modelo}</div>
                              {r.marca && <div className="text-[10px] text-muted-foreground">{r.marca}</div>}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">{r.total_fallados_registro}</TableCell>
                            <TableCell className="text-center font-mono font-semibold text-xs">{r.enviado || '-'}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-emerald-600">{r.recuperado || '-'}</TableCell>
                            <TableCell className="text-center">
                              <span className={`font-mono font-semibold text-xs ${r.pendiente > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>
                                {r.pendiente}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs truncate max-w-[100px]">{r.servicio || <span className="text-zinc-300">-</span>}</TableCell>
                            <TableCell className="text-xs truncate max-w-[100px]">{r.persona || <span className="text-zinc-300">-</span>}</TableCell>
                            <TableCell className="text-center text-[11px] text-muted-foreground">{fmtDate(r.fecha_envio)}</TableCell>
                            <TableCell className="text-center">
                              {r.dias > 0 ? (
                                <span className={`font-mono text-xs font-semibold ${r.estado === 'VENCIDO' ? 'text-red-600' : r.dias > 3 ? 'text-amber-600' : 'text-zinc-500'}`}>
                                  {r.dias}d
                                </span>
                              ) : (
                                <span className="text-zinc-300">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{estadoBadge(r.estado)}</TableCell>
                          </TableRow>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-[10px] max-w-xs">
                          <div className="space-y-0.5">
                            <div className="font-semibold">Corte {r.n_corte} — {r.modelo}</div>
                            {isSinAsignar ? (
                              <div className="text-amber-600">{r.pendiente} fallados pendientes de asignar a arreglo</div>
                            ) : (
                              <>
                                <div>Enviado: {r.enviado} | Rec: {r.recuperado} | Liq: {r.liquidacion} | Merma: {r.merma}</div>
                                {r.fecha_limite && <div>Limite: {fmtDate(r.fecha_limite)}</div>}
                              </>
                            )}
                            {r.linea_negocio && <div>Linea: {r.linea_negocio}</div>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
          {!loading && filas.length > 0 && (
            <div className="px-3 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground flex justify-between">
              <span>{k.total_registros} filas</span>
              <span>
                {k.total_vencidos} vencidos | {k.total_sin_asignar || 0} sin asignar | {k.total_pendiente} prendas pendientes
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KpiCard = ({ label, value, icon, color = 'zinc' }) => {
  const colors = {
    zinc: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
  };
  return (
    <Card className={`border ${colors[color] || colors.zinc}`} data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-3 flex items-center gap-2">
        <div className="opacity-70">{icon}</div>
        <div>
          <p className="text-[9px] uppercase tracking-wider opacity-70">{label}</p>
          <p className="text-xl font-bold font-mono leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const FilterSelect = ({ label, value, onChange, options, testId }) => (
  <div>
    <Label className="text-[10px]">{label}</Label>
    <Select value={value || '_all'} onValueChange={v => onChange(v === '_all' ? '' : v)}>
      <SelectTrigger className="h-7 text-xs" data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_all">Todos</SelectItem>
        {options.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export default ControlFallados;
