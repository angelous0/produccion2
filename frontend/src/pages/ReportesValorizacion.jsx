import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatNumber } from '../lib/utils';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Package, DollarSign, TrendingUp, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

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

export function ReporteWIP({ lineaNegocioId = 'todos' }) {
  const { empresaId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
          <p className="text-muted-foreground">Registros en producción con costos acumulados</p>
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
                <TableHead>Estado</TableHead>
                <TableHead>PT Asignado</TableHead>
                <TableHead className="text-right">Prendas</TableHead>
                <TableHead className="text-right">Costo MP</TableHead>
                <TableHead className="text-right">Costo Servicios</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.ordenes || []).map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell className="font-mono font-semibold">{reg.n_corte}</TableCell>
                  <TableCell>{reg.modelo_nombre}</TableCell>
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
                </TableRow>
              ))}
              {(data.ordenes || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay registros en proceso</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportePTValorizado({ categoria = 'todos', lineaNegocioId = 'todos' }) {
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
          <p className="text-muted-foreground">Producto terminado con stock y valorización</p>
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
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Costo Prom.</TableHead>
                <TableHead className="text-right">Valor Stock</TableHead>
                <TableHead className="text-right">OPs Cerradas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.codigo}</TableCell>
                  <TableCell>{item.nombre}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(item.stock_actual)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.costo_promedio)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valor_total)}</TableCell>
                  <TableCell className="text-right font-mono">{item.total_cierres}</TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay items PT</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
