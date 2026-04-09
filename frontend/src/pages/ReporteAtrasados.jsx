import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, AlertTriangle, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtDate(val) {
  if (!val) return '-';
  try { const d = new Date(val); if (isNaN(d)) return val; return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getFullYear()).slice(-2)}`; } catch { return val; }
}

export const ReporteAtrasados = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/atrasados`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4" data-testid="reporte-atrasados">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lotes Atrasados</h2>
          <p className="text-muted-foreground text-sm">Registros con entregas o movimientos vencidos</p>
        </div>
      </div>

      {data && <Badge variant="destructive">{data.total} lotes atrasados</Badge>}

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
                    <th className="text-right p-3 font-medium">Días proceso</th>
                    <th className="text-left p-3 font-medium">Motivo atraso</th>
                    <th className="text-right p-3 font-medium">Días atraso</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.registros || []).map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-atrasado-${r.n_corte}`}>
                      <td className="p-3">
                        <span className="font-mono font-semibold">{r.n_corte}</span>
                        {r.urgente && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500" />}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.modelo_nombre}</td>
                      <td className="p-3"><Badge variant="outline">{r.estado}</Badge></td>
                      <td className="p-3 text-right font-mono">{r.total_prendas.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">{r.dias_proceso}d</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          {r.entrega_vencida && (
                            <div className="flex items-center gap-1 text-destructive text-xs">
                              <Clock className="h-3 w-3" /> Entrega vencida ({fmtDate(r.fecha_entrega_final)})
                            </div>
                          )}
                          {r.movs_vencidos > 0 && (
                            <div className="flex items-center gap-1 text-amber-600 text-xs">
                              <AlertTriangle className="h-3 w-3" /> {r.movs_vencidos} mov. vencidos
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        {r.dias_atraso_entrega > 0 && (
                          <Badge variant="destructive">{r.dias_atraso_entrega}d</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/reportes/trazabilidad/${r.id}`)}>
                            Trazabilidad
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/registros/editar/${r.id}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(data?.registros || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">Sin lotes atrasados</td>
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
