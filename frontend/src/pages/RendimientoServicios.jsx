import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  TrendingUp, Award, AlertTriangle, Search, RefreshCw, Download,
  ThumbsUp, ThumbsDown, BarChart2,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const fmt = (n) => (n || 0).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const getConfiabilidadStyle = (pct) => {
  if (pct == null) return { cls: 'text-muted-foreground', bg: '', label: 'N/A' };
  if (pct >= 80) return { cls: 'text-emerald-700', bg: 'bg-emerald-100', label: `${fmt(pct)}%` };
  if (pct >= 50) return { cls: 'text-amber-700', bg: 'bg-amber-100', label: `${fmt(pct)}%` };
  return { cls: 'text-red-700', bg: 'bg-red-100', label: `${fmt(pct)}%` };
};

const KpiCard = ({ label, value, sublabel, icon: Icon, color }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color || 'bg-muted'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
      </div>
    </CardContent>
  </Card>
);

export default function RendimientoServicios() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fechaDesde) params.append('fecha_desde', fechaDesde);
      if (fechaHasta) params.append('fecha_hasta', fechaHasta);
      const res = await axios.get(`${API}/api/reportes-produccion/rendimiento-servicios?${params}`);
      setData(res.data);
    } catch {
      toast.error('Error al cargar reporte');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      items = items.filter(r =>
        (r.persona || '').toLowerCase().includes(q) ||
        (r.servicio || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, busqueda]);

  const resumen = data?.resumen || {};

  const handleExportExcel = async () => {
    if (!filtered.length) return;
    const XLSX = (await import('xlsx')).default || await import('xlsx');
    const wsData = [
      ['Persona', 'Servicio', 'Tipo', 'OPs Asignadas', 'Completadas', 'A tiempo', 'Con atraso', 'Vencidos abiertos', 'Prom. días atraso', '% Confiabilidad', 'Prendas', 'Costo Total'],
      ...filtered.map(r => [
        r.persona,
        r.servicio,
        r.tipo_persona || '',
        r.total_movimientos,
        r.completados,
        r.a_tiempo,
        r.con_atraso,
        r.vencidos_abiertos,
        r.prom_dias_atraso,
        r.confiabilidad != null ? r.confiabilidad : 'N/A',
        r.total_prendas,
        r.costo_total,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:24},{wch:18},{wch:12},{wch:12},{wch:12},{wch:10},{wch:12},{wch:14},{wch:14},{wch:14},{wch:12},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rendimiento');
    XLSX.writeFile(wb, `rendimiento_servicios_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Excel exportado');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Rendimiento de Servicios Externos
          </h2>
          <p className="text-sm text-muted-foreground">Confiabilidad por proveedor y servicio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Promedio general"
          value={resumen.promedio_confiabilidad != null ? `${fmt(resumen.promedio_confiabilidad)}%` : 'N/A'}
          icon={BarChart2}
          color={resumen.promedio_confiabilidad >= 80 ? 'bg-emerald-100 text-emerald-600' : resumen.promedio_confiabilidad >= 50 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}
        />
        <KpiCard
          label="Proveedores evaluados"
          value={resumen.total_proveedores || 0}
          icon={TrendingUp}
          color="bg-blue-100 text-blue-600"
        />
        <KpiCard
          label="Mejor proveedor"
          value={resumen.mejor ? resumen.mejor.persona : 'N/A'}
          sublabel={resumen.mejor ? `${resumen.mejor.servicio} — ${fmt(resumen.mejor.confiabilidad)}%` : ''}
          icon={ThumbsUp}
          color="bg-emerald-100 text-emerald-600"
        />
        <KpiCard
          label="Peor proveedor"
          value={resumen.peor ? resumen.peor.persona : 'N/A'}
          sublabel={resumen.peor ? `${resumen.peor.servicio} — ${fmt(resumen.peor.confiabilidad)}%` : ''}
          icon={ThumbsDown}
          color="bg-red-100 text-red-600"
        />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar persona, servicio..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 w-[140px] text-xs" />
        <span className="text-xs text-muted-foreground">a</span>
        <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 w-[140px] text-xs" />
        {(fechaDesde || fechaHasta) && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setFechaDesde(''); setFechaHasta(''); setTimeout(fetchData, 0); }}>
            Limpiar
          </Button>
        )}
        <Button variant="default" size="sm" className="h-8 text-xs" onClick={fetchData} disabled={loading}>
          Aplicar
        </Button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin datos de rendimiento</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Persona / Proveedor</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Servicio</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">OPs</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">A tiempo</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Con atraso</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Vencidos</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Prom. atraso</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">% Confiabilidad</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">Prendas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const confStyle = getConfiabilidadStyle(item.confiabilidad);
                  return (
                    <tr key={`${item.persona_id}-${item.servicio_id}-${idx}`} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="p-2.5 font-medium whitespace-nowrap">
                        {item.persona}
                        {item.tipo_persona && (
                          <Badge variant="outline" className="ml-1.5 text-[9px]">{item.tipo_persona}</Badge>
                        )}
                      </td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.servicio}</td>
                      <td className="p-2.5 text-center font-mono">{item.total_movimientos}</td>
                      <td className="p-2.5 text-center font-mono text-emerald-600 font-medium">{item.a_tiempo}</td>
                      <td className="p-2.5 text-center font-mono text-red-600 font-medium">{item.con_atraso}</td>
                      <td className="p-2.5 text-center">
                        {item.vencidos_abiertos > 0 ? (
                          <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200">{item.vencidos_abiertos}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        {item.prom_dias_atraso > 0 ? (
                          <span className="text-red-600">{item.prom_dias_atraso}d</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${confStyle.bg} ${confStyle.cls}`}>
                          {confStyle.label}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground">{item.total_prendas.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
