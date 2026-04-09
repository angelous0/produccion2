import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { AlertTriangle, Package, Wrench, Clock } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteTrazabilidadKPIs = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API}/reportes/trazabilidad-kpis`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Cargando KPIs...</div>;
  if (!data) return <div className="text-center py-8 text-muted-foreground">Error al cargar datos</div>;

  const { kpis, mermas_por_servicio, arreglos_vencidos, arreglos_por_responsable } = data;

  return (
    <div className="space-y-4" data-testid="reporte-trazabilidad-kpis">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="kpi-mermas">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground font-medium">Mermas</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">{kpis.mermas_total}</div>
            <div className="text-[10px] text-muted-foreground">{kpis.mermas_eventos} eventos</div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-fallados">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground font-medium">Fallados</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{kpis.fallados_total}</div>
            <div className="text-[10px] text-muted-foreground">{kpis.fallados_eventos} detecciones</div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-arreglos">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground font-medium">Arreglos</span>
            </div>
            <div className="text-2xl font-bold">{kpis.arreglos_total}</div>
            <div className="text-[10px] text-muted-foreground">{kpis.arreglos_recuperadas} recuperadas / {kpis.arreglos_liquidadas} liquidadas</div>
          </CardContent>
        </Card>
        <Card data-testid="kpi-vencidos">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-rose-500" />
              <span className="text-xs text-muted-foreground font-medium">Arreglos Vencidos</span>
            </div>
            <div className="text-2xl font-bold text-rose-600">{kpis.arreglos_vencidos}</div>
            <div className="text-[10px] text-muted-foreground">fuera de plazo</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mermas por servicio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Mermas por Servicio
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                  <TableHead className="text-right">Prendas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mermas_por_servicio || []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-xs py-4">Sin mermas registradas</TableCell></TableRow>
                ) : mermas_por_servicio.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{s.servicio || 'Sin servicio'}</TableCell>
                    <TableCell className="text-right font-mono">{s.eventos}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-amber-600">{s.total_prendas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Arreglos por responsable */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4 text-blue-500" /> Arreglos por Responsable
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Recuperadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(arreglos_por_responsable || []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">Sin arreglos registrados</TableCell></TableRow>
                ) : arreglos_por_responsable.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{s.responsable}</TableCell>
                    <TableCell className="text-right font-mono">{s.total_arreglos}</TableCell>
                    <TableCell className="text-right font-mono">{s.prendas_enviadas}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{s.prendas_recuperadas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Arreglos vencidos detalle */}
      {(arreglos_vencidos || []).length > 0 && (
        <Card className="border-rose-200 dark:border-rose-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
              <Clock className="h-4 w-4" /> Arreglos Vencidos ({arreglos_vencidos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corte</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Prendas</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead className="text-right">Dias Vencido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arreglos_vencidos.map((a, i) => (
                  <TableRow key={i} className="bg-rose-50/50 dark:bg-rose-950/20">
                    <TableCell className="font-mono font-medium">{a.n_corte}</TableCell>
                    <TableCell className="text-sm">{a.servicio_nombre || '-'}</TableCell>
                    <TableCell className="text-sm">{a.persona_nombre || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{a.cantidad}</TableCell>
                    <TableCell className="text-xs">{formatDate(a.fecha_envio)}</TableCell>
                    <TableCell className="text-xs text-rose-600 font-medium">{formatDate(a.fecha_limite)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-rose-600">{a.dias_vencido}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
