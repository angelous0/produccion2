import { useState, useCallback } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { toast } from 'sonner';
import { Search, FileSpreadsheet, Loader2, BarChart3 } from 'lucide-react';
import { formatCurrency, formatNumber } from '../lib/utils';
import { useEffect } from 'react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIAS = [
  { value: 'todos', label: 'Todas las categorías' },
  { value: 'Telas', label: 'Telas' },
  { value: 'Avios', label: 'Avíos' },
  { value: 'Otros', label: 'Otros' },
  { value: 'PT', label: 'PT' },
];

const hoy = new Date().toISOString().slice(0, 10);
const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export function KardexGeneral() {
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [lineaNegocioId, setLineaNegocioId] = useState('todos');
  const [categoria, setCategoria] = useState('todos');
  const [search, setSearch] = useState('');
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API}/lineas-negocio`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setLineasNegocio(r.data || []))
      .catch(() => {});
  }, []);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    if (lineaNegocioId !== 'todos') p.set('linea_negocio_id', lineaNegocioId);
    if (categoria !== 'todos') p.set('categoria', categoria);
    if (search.trim()) p.set('search', search.trim());
    return p;
  }, [fechaInicio, fechaFin, lineaNegocioId, categoria, search]);

  const handleGenerar = async () => {
    if (!fechaInicio || !fechaFin) { toast.error('Selecciona un rango de fechas'); return; }
    if (fechaInicio > fechaFin) { toast.error('La fecha inicio debe ser menor o igual a la fecha fin'); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/inventario/kardex-general?${buildParams()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResultado(res.data);
      if (res.data.total_items === 0) toast.info('No se encontraron items con movimientos en ese rango');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al generar el reporte');
    } finally { setLoading(false); }
  };

  const handleExportar = async () => {
    if (!fechaInicio || !fechaFin) { toast.error('Selecciona un rango de fechas'); return; }
    setExportando(true);
    try {
      const token = localStorage.getItem('token');
      const params = buildParams();
      params.set('formato', 'xlsx');
      const res = await axios.get(`${API}/inventario/kardex-general?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `kardex_general_${fechaInicio}_${fechaFin}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel descargado');
    } catch { toast.error('Error al exportar'); }
    finally { setExportando(false); }
  };

  const items = resultado?.items || [];

  const categoriaColor = {
    'Telas': 'bg-blue-100 text-blue-700',
    'Avios': 'bg-purple-100 text-purple-700',
    'PT':    'bg-green-100 text-green-700',
    'Otros': 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold">Kardex General</h1>
          <p className="text-sm text-muted-foreground">Saldo inicial, movimientos y saldo final por item en un rango de fechas</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha Inicio <span className="text-red-500">*</span></Label>
              <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha Fin <span className="text-red-500">*</span></Label>
              <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Línea de Negocio</Label>
              <Select value={lineaNegocioId} onValueChange={setLineaNegocioId}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las líneas</SelectItem>
                  {lineasNegocio.map(l => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerar()}
                className="pl-8 text-sm"
              />
            </div>
            <Button onClick={handleGenerar} disabled={loading} className="gap-2 min-w-[140px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              Generar Reporte
            </Button>
            <Button variant="outline" onClick={handleExportar} disabled={exportando || !resultado} className="gap-2">
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-green-600" />}
              Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      {resultado && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Items con movimiento</p>
              <p className="text-2xl font-bold font-mono text-blue-700">{resultado.total_items}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Valor Saldo Final Total</p>
              <p className="text-xl font-bold font-mono text-amber-700">{formatCurrency(resultado.total_valor_saldo)}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Ingresos</p>
              <p className="text-xl font-bold font-mono text-green-700">
                {formatNumber(items.reduce((s, i) => s + i.ingresos, 0))}
              </p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Salidas</p>
              <p className="text-xl font-bold font-mono text-red-700">
                {formatNumber(items.reduce((s, i) => s + i.salidas, 0))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabla */}
      {resultado && items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-semibold">Código</TableHead>
                    <TableHead className="text-xs font-semibold">Nombre</TableHead>
                    <TableHead className="text-xs font-semibold">Categoría</TableHead>
                    <TableHead className="text-xs font-semibold">Línea de Negocio</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Unidad</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Saldo Inicial</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-green-700">Ingresos</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-red-700">Salidas</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-blue-700">Saldo Final</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Costo Prom.</TableHead>
                    <TableHead className="text-xs font-semibold text-right text-amber-700">Valor Saldo Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                      <TableCell className="font-mono text-xs font-semibold">{item.codigo}</TableCell>
                      <TableCell className="text-xs max-w-[200px]">
                        <span className="line-clamp-2">{item.nombre}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${categoriaColor[item.categoria] || 'bg-gray-100 text-gray-700'}`}>
                          {item.categoria || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.linea_negocio_nombre || '—'}</TableCell>
                      <TableCell className="text-xs text-center text-muted-foreground">{item.unidad_medida}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatNumber(item.saldo_inicial)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-green-700 font-medium">
                        {item.ingresos > 0 ? `+${formatNumber(item.ingresos)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-red-700 font-medium">
                        {item.salidas > 0 ? `-${formatNumber(item.salidas)}` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs font-bold ${item.saldo_final < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {formatNumber(item.saldo_final)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatCurrency(item.costo_promedio)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-amber-700">
                        {formatCurrency(item.valor_saldo_final)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Fila de totales */}
            <div className="border-t bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{items.length} items</span>
              <div className="flex items-center gap-6 text-xs">
                <span className="text-muted-foreground">Total ingresos: <span className="font-mono font-semibold text-green-700">{formatNumber(items.reduce((s, i) => s + i.ingresos, 0))}</span></span>
                <span className="text-muted-foreground">Total salidas: <span className="font-mono font-semibold text-red-700">{formatNumber(items.reduce((s, i) => s + i.salidas, 0))}</span></span>
                <span className="text-muted-foreground font-semibold">Valor saldo final: <span className="font-mono text-amber-700 text-sm">{formatCurrency(resultado.total_valor_saldo)}</span></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {resultado && items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No se encontraron items con movimientos en el rango seleccionado.</p>
        </div>
      )}

      {!resultado && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Selecciona un rango de fechas y presiona <strong>Generar Reporte</strong></p>
        </div>
      )}
    </div>
  );
}

export default KardexGeneral;
