import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteBalanceTerceros = () => {
  const [data, setData] = useState(null);
  const [filtros, setFiltros] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterServicio, setFilterServicio] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/filtros`).then(res => setFiltros(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterServicio && filterServicio !== '_all') params.append('servicio_id', filterServicio);
    axios.get(`${API}/reportes-produccion/balance-terceros?${params}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filterServicio]);

  const resumenArr = data?.resumen_servicio
    ? Object.entries(data.resumen_servicio).map(([srv, v]) => ({
        name: srv, enviadas: v.enviadas, recibidas: v.recibidas, en_poder: v.en_poder,
      }))
    : [];

  return (
    <div className="space-y-4" data-testid="reporte-balance-terceros">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Balance por Terceros</h2>
          <p className="text-muted-foreground text-sm">Prendas y costos agrupados por servicio y persona</p>
        </div>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Select value={filterServicio} onValueChange={setFilterServicio}>
              <SelectTrigger className="w-[220px]" data-testid="filter-servicio">
                <SelectValue placeholder="Filtrar por Servicio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los servicios</SelectItem>
                {(filtros?.servicios || []).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterServicio && (
              <Button variant="outline" size="sm" onClick={() => setFilterServicio('')}>Limpiar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico resumen por servicio */}
      {resumenArr.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Resumen por Servicio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={resumenArr} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="enviadas" fill="#3b82f6" name="Enviadas" radius={[0, 4, 4, 0]} />
                <Bar dataKey="recibidas" fill="#10b981" name="Recibidas" radius={[0, 4, 4, 0]} />
                <Bar dataKey="en_poder" fill="#f59e0b" name="En Poder" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabla detallada */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Servicio</th>
                    <th className="text-left p-3 font-medium">Persona</th>
                    <th className="text-center p-3 font-medium">Tipo</th>
                    <th className="text-right p-3 font-medium">Lotes</th>
                    <th className="text-right p-3 font-medium">Enviadas</th>
                    <th className="text-right p-3 font-medium">Recibidas</th>
                    <th className="text-right p-3 font-medium">Diferencia</th>
                    <th className="text-right p-3 font-medium">Costo Total</th>
                    <th className="text-right p-3 font-medium">En Poder</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.balance || []).map((b, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{b.servicio}</td>
                      <td className="p-3">{b.persona || '-'}</td>
                      <td className="p-3 text-center">
                        {b.tipo_persona && (
                          <Badge variant={b.tipo_persona === 'EXTERNO' ? 'outline' : 'secondary'} className="text-[10px]">
                            {b.tipo_persona}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{b.lotes}</td>
                      <td className="p-3 text-right font-mono">{b.total_enviadas.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{b.total_recibidas.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">
                        {b.total_diferencia > 0 ? (
                          <span className="text-destructive">{b.total_diferencia}</span>
                        ) : b.total_diferencia}
                      </td>
                      <td className="p-3 text-right font-mono">S/ {b.costo_total.toFixed(2)}</td>
                      <td className="p-3 text-right">
                        {b.prendas_en_poder > 0 ? (
                          <Badge variant="secondary" className="font-mono">{b.prendas_en_poder.toLocaleString()}</Badge>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                    </tr>
                  ))}
                  {(data?.balance || []).length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Sin datos</td></tr>
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
