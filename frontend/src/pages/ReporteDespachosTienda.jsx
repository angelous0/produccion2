import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  Store, Package, CalendarDays, DollarSign, RefreshCw,
  Search, ChevronUp, ChevronDown, ArrowUpDown, ExternalLink, Download,
} from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const KpiCard = ({ label, value, icon: Icon, color = 'text-primary' }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center bg-muted`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={`text-xl font-bold ${color} truncate`}>{value}</p>
      </div>
    </CardContent>
  </Card>
);

// Rangos rápidos predefinidos
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => {
  const dt = new Date(); dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
};
const firstOfMonthISO = () => {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const ReporteDespachosTienda = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(daysAgoISO(30));
  const [hasta, setHasta] = useState(todayISO());
  const [busqueda, setBusqueda] = useState('');
  const [sort, setSort] = useState({ key: 'fecha_envio_tienda', dir: 'desc' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/reportes-produccion/despachos-tienda`, {
        params: { desde, hasta },
      });
      setData(res.data);
    } catch {
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const items = useMemo(() => {
    if (!data?.items) return [];
    let arr = data.items;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      arr = arr.filter(it =>
        (it.n_corte || '').toLowerCase().includes(q) ||
        (it.modelo || '').toLowerCase().includes(q) ||
        (it.marca || '').toLowerCase().includes(q) ||
        (it.linea_negocio || '').toLowerCase().includes(q)
      );
    }
    if (sort?.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      arr = [...arr].sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
      });
    }
    return arr;
  }, [data, busqueda, sort]);

  const handleSort = (key) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return { key: 'fecha_envio_tienda', dir: 'desc' };
    });
  };

  const SortIcon = ({ colKey }) => {
    if (!sort || sort.key !== colKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sort.dir === 'desc'
      ? <ChevronDown className="inline h-3 w-3 ml-1 text-primary" />
      : <ChevronUp className="inline h-3 w-3 ml-1 text-primary" />;
  };

  const setRango = (d) => {
    setDesde(d);
    setHasta(todayISO());
  };

  const handleExportExcel = async () => {
    if (!items.length) return;
    const XLSX = (await import('xlsx')).default || await import('xlsx');
    const wsData = [
      ['Corte', 'Modelo', 'Marca', 'Línea', 'Fecha Envío', 'Prendas', 'Costo Total', 'Costo Unit.'],
      ...items.map(r => [
        r.n_corte + (r.urgente ? ' (URG)' : ''),
        r.modelo || '',
        r.marca || '',
        r.linea_negocio || '',
        r.fecha_envio_tienda ? new Date(r.fecha_envio_tienda).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '',
        r.prendas,
        r.costo_total || 0,
        r.costo_unitario || 0,
      ]),
      [],
      ['TOTAL', '', '', '', '', resumen.total_prendas, resumen.total_valor, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:12},{wch:24},{wch:16},{wch:18},{wch:20},{wch:10},{wch:14},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Despachos Tienda');
    XLSX.writeFile(wb, `despachos_tienda_${desde}_${hasta}.xlsx`);
    toast.success('Excel exportado');
  };

  const resumen = data?.resumen || { total_lotes: 0, total_prendas: 0, total_valor: 0 };

  return (
    <div className="space-y-4" data-testid="reporte-despachos-tienda">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-5 w-5 text-emerald-600" /> Despachos a Tienda
          </h2>
          <p className="text-sm text-muted-foreground">Lotes enviados al local comercial en el rango seleccionado</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!items.length}>
            <Download className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className={`h-3.5 w-3.5 sm:mr-1 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Filtros de fecha */}
      <Card>
        <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Desde</span>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-8 text-xs w-[140px]" />
            <span className="text-xs text-muted-foreground">Hasta</span>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-8 text-xs w-[140px]" />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRango(daysAgoISO(7))}>7 días</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRango(daysAgoISO(30))}>30 días</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRango(firstOfMonthISO())}>Este mes</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRango(daysAgoISO(90))}>90 días</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDesde('2000-01-01'); setHasta(todayISO()); }}>Todo</Button>
          </div>
          <div className="relative sm:ml-auto sm:max-w-xs sm:flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar corte, modelo, marca..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Lotes despachados" value={resumen.total_lotes} icon={Store} color="text-emerald-600" />
        <KpiCard label="Prendas a tienda" value={resumen.total_prendas.toLocaleString('es-PE')} icon={Package} color="text-blue-600" />
        <KpiCard label="Valor despachado" value={`S/ ${resumen.total_valor.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`} icon={DollarSign} color="text-violet-600" />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Store className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Sin lotes despachados en el rango seleccionado
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="text-left p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('n_corte')}>
                    Corte <SortIcon colKey="n_corte" />
                  </th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('modelo')}>
                    Modelo <SortIcon colKey="modelo" />
                  </th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('marca')}>
                    Marca <SortIcon colKey="marca" />
                  </th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('linea_negocio')}>
                    Línea <SortIcon colKey="linea_negocio" />
                  </th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('fecha_envio_tienda')}>
                    Fecha Envío <SortIcon colKey="fecha_envio_tienda" />
                  </th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('prendas')}>
                    Prendas <SortIcon colKey="prendas" />
                  </th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('costo_total')}>
                    Costo Total <SortIcon colKey="costo_total" />
                  </th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('costo_unitario')}>
                    Costo Unit. <SortIcon colKey="costo_unitario" />
                  </th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.registro_id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="p-2.5 font-mono font-semibold whitespace-nowrap">
                      {it.n_corte}
                      {it.urgente && <span className="ml-1 text-[9px] text-red-600 font-bold">URG</span>}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">{it.modelo}</td>
                    <td className="p-2.5 whitespace-nowrap text-muted-foreground">{it.marca}</td>
                    <td className="p-2.5 whitespace-nowrap text-muted-foreground">{it.linea_negocio}</td>
                    <td className="p-2.5 text-center whitespace-nowrap font-mono">
                      {it.fecha_envio_tienda ? new Date(it.fecha_envio_tienda).toLocaleString('es-PE', {
                        timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      }) : '—'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">{it.prendas.toLocaleString('es-PE')}</td>
                    <td className="p-2.5 text-right font-mono">
                      {it.costo_total > 0 ? `S/ ${it.costo_total.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">
                      {it.costo_unitario > 0 ? `S/ ${it.costo_unitario.toFixed(4)}` : '—'}
                    </td>
                    <td className="p-2.5 text-center">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/registros/editar/${it.registro_id}`)} title="Abrir registro">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {/* Footer totales */}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="p-2.5 font-bold" colSpan={5}>TOTAL ({items.length} lotes)</td>
                  <td className="p-2.5 text-right font-mono">
                    {items.reduce((s, it) => s + (it.prendas || 0), 0).toLocaleString('es-PE')}
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    S/ {items.reduce((s, it) => s + (it.costo_total || 0), 0).toFixed(2)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-primary">
                    {(() => {
                      const totPrendas = items.reduce((s, it) => s + (it.prendas || 0), 0);
                      const totCosto = items.reduce((s, it) => s + (it.costo_total || 0), 0);
                      return totPrendas > 0 ? `S/ ${(totCosto / totPrendas).toFixed(4)}` : '—';
                    })()}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReporteDespachosTienda;
