import { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, Package, AlertTriangle, CheckCircle, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export default function DashboardEjecutivo() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/registros/?limit=500`);
        const data = (res.data && res.data.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
        const activos = data.filter(r => r.estado_op !== 'CERRADA');
        const atrasados = data.filter(r => r.fecha_entrega_final && new Date(r.fecha_entrega_final) < new Date() && r.estado_op !== 'CERRADA');
        const terminados = data.filter(r => r.estado_op === 'CERRADA');
        const totalPrendas = activos.reduce((s, r) => s + (r.cantidad_divisiones || 0), 0);
        setStats({ activos: activos.length, atrasados: atrasados.length, terminados: terminados.length, totalPrendas });
      } catch(e) { setStats({ activos: 0, atrasados: 0, terminados: 0, totalPrendas: 0 }); }
      finally { setLoading(false); }
    })();
  }, []);
  const kpis = stats ? [
    { label: 'Lotes Activos', value: stats.activos, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' },
    { label: 'Prendas en Proceso', value: stats.totalPrendas.toLocaleString(), icon: Package, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
    { label: 'Atrasados', value: stats.atrasados, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950' },
    { label: 'Completados', value: stats.terminados, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950' },
  ] : [];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Dashboard Ejecutivo
        </h2>
        <p className="text-sm text-muted-foreground">Resumen de KPIs de produccion en tiempo real</p>
      </div>
      {loading ? (<div className="flex items-center justify-center h-40 text-muted-foreground">Cargando...</div>) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle></CardHeader>
              <CardContent>
                <div className={"inline-flex items-center gap-2 px-3 py-2 rounded-lg " + kpi.bg}>
                  <kpi.icon className={"h-5 w-5 " + kpi.color} />
                  <span className={"text-2xl font-bold " + kpi.color}>{kpi.value}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Proximamente: OTD, productividad por persona, mermas del mes</p>
      </div>
    </div>
  );
}