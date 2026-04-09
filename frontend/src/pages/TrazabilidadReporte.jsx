import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Shield, AlertTriangle, Search, ArrowLeft, Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TrazabilidadReporte = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/reporte-trazabilidad`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando reporte...</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Error al cargar datos</div>;

  const registros = (data.registros || []).filter(r => {
    const matchSearch = !search || r.n_corte.toLowerCase().includes(search.toLowerCase()) || r.modelo.toLowerCase().includes(search.toLowerCase());
    const matchFiltro = filtro === 'todos' ||
      (filtro === 'con_fallados' && r.fallados_total > 0) ||
      (filtro === 'con_mermas' && r.merma > 0) ||
      (filtro === 'con_vencidos' && r.vencidos > 0) ||
      (filtro === 'con_novedades' && r.tiene_novedades) ||
      (filtro === 'sin_novedades' && !r.tiene_novedades);
    return matchSearch && matchFiltro;
  });

  const t = data.totales;

  return (
    <div className="space-y-4 p-4 max-w-[98vw] mx-auto" data-testid="trazabilidad-reporte">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="btn-volver">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Reporte de Trazabilidad
          </h1>
          <p className="text-xs text-muted-foreground">{t.registros} registros | {t.cantidad_inicial} prendas totales</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: 'Total Prendas', value: t.cantidad_inicial, color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200' },
          { label: 'Normal', value: t.normal, color: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' },
          { label: 'Fallados', value: t.total_fallados, color: t.total_fallados > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200' : 'bg-zinc-50 border-zinc-200' },
          { label: 'En Arreglo', value: t.en_arreglo, color: t.en_arreglo > 0 ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200' : 'bg-zinc-50 border-zinc-200' },
          { label: 'Recuperado', value: t.recuperado, color: t.recuperado > 0 ? 'bg-green-50 dark:bg-green-950/30 border-green-200' : 'bg-zinc-50 border-zinc-200' },
          { label: 'Mermas', value: t.merma, color: t.merma > 0 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200' : 'bg-zinc-50 border-zinc-200' },
          { label: 'Vencidos', value: t.vencidos, color: t.vencidos > 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200' : 'bg-zinc-50 border-zinc-200' },
        ].map((k, i) => (
          <div key={i} className={`rounded-lg border p-2.5 text-center ${k.color}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className="text-lg font-bold font-mono">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar corte, modelo..."
            className="pl-8 h-9 text-sm" data-testid="input-search-traz" />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[180px] h-9 text-sm" data-testid="select-filtro-traz">
            <Filter className="h-3 w-3 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="con_novedades">Con novedades</SelectItem>
            <SelectItem value="con_fallados">Con fallados</SelectItem>
            <SelectItem value="con_mermas">Con mermas</SelectItem>
            <SelectItem value="con_vencidos">Con vencidos</SelectItem>
            <SelectItem value="sin_novedades">Sin novedades</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{registros.length} resultados</span>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-muted/80 backdrop-blur-sm">
                  <TableHead className="text-[11px] font-semibold">Corte</TableHead>
                  <TableHead className="text-[11px] font-semibold">Estado</TableHead>
                  <TableHead className="text-[11px] font-semibold">Modelo</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Inicial</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Normal</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Fallados</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">F.Pendiente</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Arreglo</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Recuperado</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Liquidacion</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Mermas</TableHead>
                  <TableHead className="text-[11px] font-semibold text-center">Alertas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map(r => (
                  <TableRow key={r.id} className={`cursor-pointer hover:bg-muted/40 ${r.vencidos > 0 ? 'bg-red-50/50 dark:bg-red-950/5' : ''}`}
                    onClick={() => navigate(`/registros/editar/${r.id}`)} data-testid={`traz-row-${r.id}`}>
                    <TableCell className="text-xs font-semibold">{r.n_corte}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{r.estado}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.modelo}{r.marca ? ` (${r.marca})` : ''}</TableCell>
                    <TableCell className="text-xs text-center font-mono font-semibold">{r.cantidad_inicial}</TableCell>
                    <TableCell className="text-xs text-center font-mono text-emerald-600">{r.normal || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.total_fallados > 0 ? 'text-red-600 font-semibold' : ''}`}>{r.total_fallados || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.fallado_pendiente > 0 ? 'text-orange-600 font-semibold' : ''}`}>{r.fallado_pendiente || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.en_arreglo > 0 ? 'text-violet-600' : ''}`}>{r.en_arreglo || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.recuperado > 0 ? 'text-green-600' : ''}`}>{r.recuperado || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.liquidacion > 0 ? 'text-orange-600' : ''}`}>{r.liquidacion || '-'}</TableCell>
                    <TableCell className={`text-xs text-center font-mono ${r.merma > 0 ? 'text-amber-600' : ''}`}>{r.merma || '-'}</TableCell>
                    <TableCell className="text-center">
                      {r.vencidos > 0 && <Badge variant="destructive" className="text-[9px] h-4">{r.vencidos} venc.</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {registros.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sin registros</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrazabilidadReporte;
