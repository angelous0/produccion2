import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  PauseCircle, CheckCircle2, Clock, AlertTriangle, ArrowRight, Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteParalizados = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [soloActivas, setSoloActivas] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = soloActivas ? '?solo_activas=true' : '';
      const res = await fetch(`${API}/reportes/paralizados${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [soloActivas]);

  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-pulse text-muted-foreground text-sm">Cargando paralizaciones...</div></div>;
  if (!data) return <div className="text-sm text-muted-foreground text-center py-8">No se pudieron cargar los datos</div>;

  const { paralizaciones, resumen, motivos } = data;

  const formatFecha = (str) => {
    if (!str) return '-';
    try {
      const d = new Date(str);
      return d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return str; }
  };

  return (
    <div className="space-y-4" data-testid="reporte-paralizados">
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card data-testid="kpi-activas">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activas</span>
              <PauseCircle className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600">{resumen.activas}</p>
            <p className="text-xs text-muted-foreground">{resumen.prendas_afectadas.toLocaleString()} prendas afectadas</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-resueltas">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resueltas</span>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-green-600">{resumen.resueltas}</p>
            <p className="text-xs text-muted-foreground">historial</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-total">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold">{resumen.total}</p>
            <p className="text-xs text-muted-foreground">paralizaciones</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-dias-prom">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dias Promedio</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{resumen.dias_promedio}</p>
            <p className="text-xs text-muted-foreground">duracion promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* Motivos */}
      {motivos.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">Motivos de Paralizacion</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {motivos.map((m) => (
                <Badge key={m.motivo} variant="outline" className="text-xs py-1 px-2.5">
                  {m.motivo} <span className="ml-1.5 font-bold">{m.cantidad}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtro + Tabla */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PauseCircle className="h-4 w-4" /> Paralizaciones ({paralizaciones.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Solo activas</span>
              <Switch
                checked={soloActivas}
                onCheckedChange={setSoloActivas}
                data-testid="filtro-solo-activas"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {paralizaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay paralizaciones registradas</p>
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
                      data-testid={`row-paralizacion-${p.n_corte}`}
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
                      <TableCell>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Comentarios de activas */}
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
  );
};
