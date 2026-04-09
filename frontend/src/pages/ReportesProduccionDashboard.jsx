import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Activity, AlertTriangle, Clock, Package, GitBranch, TrendingUp, Layers, Users, Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const ESTADO_COLORS = {
  'Para Corte': '#94a3b8', 'En Corte': '#f59e0b', 'Costura': '#3b82f6',
  'Estampado': '#8b5cf6', 'Bordado': '#ec4899', 'Lavanderia': '#06b6d4',
  'Acabado': '#10b981', 'Atraque/Ojal': '#f97316', 'Almacén PT': '#22c55e',
};

const KpiCard = ({ title, value, icon: Icon, color = 'primary', onClick, testId }) => (
  <Card
    className={`cursor-pointer hover:shadow-md transition-shadow ${onClick ? 'hover:border-primary/50' : ''}`}
    onClick={onClick}
    data-testid={testId}
  >
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <div className={`h-9 w-9 rounded-lg bg-${color}/10 flex items-center justify-center`}>
        <Icon className={`h-5 w-5 text-${color}`} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </CardContent>
  </Card>
);

export const ReportesProduccionDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/dashboard`)
      .then(res => setData(res.data))
      .catch(err => console.error('Error loading dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="reportes-dashboard-loading">
        <div className="animate-pulse text-muted-foreground">Cargando reportes...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-12">Error al cargar datos</div>;
  }

  const estadoData = (data.distribucion_estado || []).map((d, i) => ({
    ...d, name: d.estado, value: d.cantidad,
    fill: ESTADO_COLORS[d.estado] || COLORS[i % COLORS.length],
  }));

  const servicioData = (data.por_servicio || []).map(s => ({
    name: s.servicio, enviadas: s.enviadas, recibidas: s.recibidas, lotes: s.lotes,
  }));

  return (
    <div className="space-y-6" data-testid="reportes-produccion-dashboard">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reportes de Producción</h2>
        <p className="text-muted-foreground">Panel de control operativo - Reportes P0</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="En Proceso"
          value={data.total_en_proceso}
          icon={Activity}
          testId="kpi-en-proceso"
          onClick={() => navigate('/reportes/en-proceso')}
        />
        <KpiCard
          title="Prendas en Proceso"
          value={data.total_prendas_proceso.toLocaleString()}
          icon={Package}
          testId="kpi-prendas"
        />
        <KpiCard
          title="Lotes Atrasados"
          value={data.atrasados}
          icon={AlertTriangle}
          color="destructive"
          testId="kpi-atrasados"
          onClick={() => navigate('/reportes/atrasados')}
        />
        <KpiCard
          title="Movimientos Abiertos"
          value={data.movimientos_abiertos}
          icon={Clock}
          testId="kpi-movs-abiertos"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Lotes Fraccionados"
          value={data.lotes_fraccionados}
          icon={GitBranch}
          testId="kpi-fraccionados"
          onClick={() => navigate('/reportes/lotes-fraccionados')}
        />
        <KpiCard
          title="Etapas Activas"
          value={estadoData.length}
          icon={Layers}
          testId="kpi-etapas"
          onClick={() => navigate('/reportes/wip-etapa')}
        />
        <KpiCard
          title="Servicios con Carga"
          value={servicioData.length}
          icon={Users}
          testId="kpi-servicios"
          onClick={() => navigate('/reportes/balance-terceros')}
        />
        <KpiCard
          title="Trazabilidad General"
          value="Ver"
          icon={Shield}
          testId="kpi-trazabilidad-general"
          onClick={() => navigate('/reportes/trazabilidad-general')}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* WIP por Etapa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              WIP por Etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {estadoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={estadoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {estadoData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name) => [`${value} lotes`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                Sin lotes en proceso
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {estadoData.map(e => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.fill }} />
                  <span>{e.name}</span>
                  <Badge variant="secondary" className="font-mono text-[10px] px-1 py-0">{e.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Carga por Servicio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Prendas por Servicio (en proceso)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {servicioData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={servicioData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="enviadas" fill="#3b82f6" name="Enviadas" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="recibidas" fill="#10b981" name="Recibidas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Sin movimientos
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acceso Rápido a Reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Producción en Proceso', to: '/reportes/en-proceso', icon: Activity },
              { label: 'WIP por Etapa', to: '/reportes/wip-etapa', icon: Layers },
              { label: 'Lotes Atrasados', to: '/reportes/atrasados', icon: AlertTriangle },
              { label: 'Cumplimiento de Ruta', to: '/reportes/cumplimiento-ruta', icon: TrendingUp },
              { label: 'Balance por Terceros', to: '/reportes/balance-terceros', icon: Users },
              { label: 'Lotes Fraccionados', to: '/reportes/lotes-fraccionados', icon: GitBranch },
              { label: 'Trazabilidad General', to: '/reportes/trazabilidad-general', icon: Shield },
            ].map(link => (
              <button
                key={link.to}
                onClick={() => navigate(link.to)}
                className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent hover:border-primary/30 transition-colors text-sm text-left"
                data-testid={`link-${link.to.split('/').pop()}`}
              >
                <link.icon className="h-4 w-4 text-muted-foreground" />
                {link.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
