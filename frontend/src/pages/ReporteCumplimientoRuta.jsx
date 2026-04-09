import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstadoBadge = ({ estado }) => {
  if (estado === 'COMPLETADA') return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">Completada</Badge>;
  if (estado === 'EN_CURSO') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px]">En Curso</Badge>;
  return <Badge variant="outline" className="text-[10px]">Pendiente</Badge>;
};

export const ReporteCumplimientoRuta = () => {
  const [data, setData] = useState(null);
  const [filtros, setFiltros] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterRuta, setFilterRuta] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/filtros`).then(res => setFiltros(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRuta && filterRuta !== '_all') params.append('ruta_id', filterRuta);
    axios.get(`${API}/reportes-produccion/cumplimiento-ruta?${params}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filterRuta]);

  return (
    <div className="space-y-4" data-testid="reporte-cumplimiento-ruta">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cumplimiento de Ruta</h2>
          <p className="text-muted-foreground text-sm">Etapas ejecutadas vs esperadas por cada registro</p>
        </div>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Select value={filterRuta} onValueChange={setFilterRuta}>
              <SelectTrigger className="w-[220px]" data-testid="filter-ruta">
                <SelectValue placeholder="Filtrar por Ruta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas las rutas</SelectItem>
                {(filtros?.rutas || []).map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterRuta && (
              <Button variant="outline" size="sm" onClick={() => setFilterRuta('')}>Limpiar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {data && <Badge variant="secondary">{data.total} registros con ruta</Badge>}

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
                    <th className="text-left p-3 font-medium">Ruta</th>
                    <th className="text-right p-3 font-medium">Prendas</th>
                    <th className="text-center p-3 font-medium">Cumplimiento</th>
                    <th className="text-left p-3 font-medium">Etapas</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.registros || []).map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-cumpl-${r.n_corte}`}>
                      <td className="p-3">
                        <span className="font-mono font-semibold">{r.n_corte}</span>
                        {r.urgente && <Badge variant="destructive" className="ml-1 text-[10px] px-1">URG</Badge>}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.modelo_nombre}</td>
                      <td className="p-3 text-muted-foreground">{r.ruta_nombre}</td>
                      <td className="p-3 text-right font-mono">{r.total_prendas.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* Progress bar */}
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${r.pct_cumplimiento}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{r.pct_cumplimiento}%</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {r.completadas}/{r.total_etapas} etapas
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.detalle_etapas || []).map((e, i) => (
                            <div key={i} className="flex items-center gap-0.5">
                              {e.estado === 'COMPLETADA' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                              {e.estado === 'EN_CURSO' && <Clock className="h-3 w-3 text-amber-500" />}
                              {e.estado === 'PENDIENTE' && <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                              <span className={`text-[10px] ${
                                e.estado === 'COMPLETADA' ? 'text-emerald-600' :
                                e.estado === 'EN_CURSO' ? 'text-amber-600' : 'text-muted-foreground'
                              }`}>
                                {e.nombre}
                              </span>
                              {i < r.detalle_etapas.length - 1 && <span className="text-muted-foreground mx-0.5">→</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/reportes/trazabilidad/${r.id}`)}>
                          Detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(data?.registros || []).length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin datos</td></tr>
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
