import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function fmtDate(val) {
  if (!val) return '-';
  try { const d = new Date(val); if (isNaN(d)) return val; return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getFullYear()).slice(-2)}`; } catch { return val; }
}

export const ReporteWIPEtapa = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/wip-etapa`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const etapas = data?.etapas || [];
  const totalPrendas = etapas.reduce((s, e) => s + e.prendas, 0);
  const totalLotes = etapas.reduce((s, e) => s + e.lotes, 0);

  const chartData = etapas.map((e, i) => ({
    name: e.etapa, lotes: e.lotes, prendas: e.prendas, fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-4" data-testid="reporte-wip-etapa">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">WIP por Etapa</h2>
          <p className="text-muted-foreground text-sm">Distribución de lotes y prendas por etapa actual</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="flex gap-3">
        <Badge variant="secondary">{totalLotes} lotes</Badge>
        <Badge variant="secondary">{totalPrendas.toLocaleString()} prendas</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
      ) : (
        <>
          {/* Gráfico */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4" />
                  Prendas por Etapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="prendas" fill="#3b82f6" name="Prendas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabla */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Etapa</th>
                      <th className="text-right p-3 font-medium">Lotes</th>
                      <th className="text-right p-3 font-medium">Prendas</th>
                      <th className="text-right p-3 font-medium">% Prendas</th>
                      <th className="text-right p-3 font-medium">Urgentes</th>
                      <th className="text-left p-3 font-medium">Lote más antiguo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapas.map((e, i) => (
                      <tr key={e.etapa} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="font-medium">{e.etapa}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono">{e.lotes}</td>
                        <td className="p-3 text-right font-mono">{e.prendas.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono">{totalPrendas > 0 ? ((e.prendas / totalPrendas) * 100).toFixed(1) : 0}%</td>
                        <td className="p-3 text-right">
                          {e.urgentes > 0 ? <Badge variant="destructive">{e.urgentes}</Badge> : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {e.lote_mas_antiguo ? fmtDate(e.lote_mas_antiguo) : '-'}
                        </td>
                      </tr>
                    ))}
                    {etapas.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
