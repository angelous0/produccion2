import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteEnProceso = () => {
  const [data, setData] = useState(null);
  const [filtros, setFiltros] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterModelo, setFilterModelo] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/filtros`).then(res => setFiltros(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterEstado && filterEstado !== '_all') params.append('estado', filterEstado);
    if (filterModelo && filterModelo !== '_all') params.append('modelo_id', filterModelo);
    axios.get(`${API}/reportes-produccion/en-proceso?${params}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filterEstado, filterModelo]);

  return (
    <div className="space-y-4" data-testid="reporte-en-proceso">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Producción en Proceso</h2>
          <p className="text-muted-foreground text-sm">Registros activos con detalle de avance</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[180px]" data-testid="filter-estado">
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
              <SelectTrigger className="w-[200px]" data-testid="filter-modelo">
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
              <Button variant="outline" size="sm" onClick={() => { setFilterEstado(''); setFilterModelo(''); }}>
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      {data && (
        <div className="flex gap-3 text-sm">
          <Badge variant="secondary">{data.total} registros</Badge>
        </div>
      )}

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Corte</th>
                    <th className="text-left p-3 font-medium">Modelo</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-right p-3 font-medium">Prendas</th>
                    <th className="text-right p-3 font-medium">Días</th>
                    <th className="text-center p-3 font-medium">Movs</th>
                    <th className="text-left p-3 font-medium">Entrega</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.registros || []).map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-${r.n_corte}`}>
                      <td className="p-3">
                        <span className="font-mono font-semibold">{r.n_corte}</span>
                        {r.urgente && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500" />}
                        {r.dividido_desde_registro_id && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1">DIV</Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.modelo_nombre}</td>
                      <td className="p-3">
                        <Badge variant="outline">{r.estado}</Badge>
                      </td>
                      <td className="p-3 text-right font-mono">{r.total_prendas.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{r.dias_proceso}d</td>
                      <td className="p-3 text-center">
                        <span className="font-mono text-xs">
                          {r.movimientos_cerrados}/{r.total_movimientos}
                        </span>
                        {r.movs_vencidos > 0 && (
                          <Badge variant="destructive" className="ml-1 text-[10px] px-1">{r.movs_vencidos} venc</Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {r.fecha_entrega_final ? (
                          <span className={new Date(r.fecha_entrega_final) < new Date() ? 'text-destructive font-medium' : ''}>
                            {formatDate(r.fecha_entrega_final)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/reportes/trazabilidad/${r.id}`)} data-testid={`traza-${r.n_corte}`}>
                            Trazabilidad
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/registros/editar/${r.id}`)} data-testid={`edit-${r.n_corte}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(data?.registros || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">No hay registros en proceso</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
