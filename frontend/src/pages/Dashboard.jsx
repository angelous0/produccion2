import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Activity, AlertTriangle, Clock, Package, ClipboardList, Box,
  TrendingUp, Layers, Users, PauseCircle, PackageX,
  ArrowRight, ArrowDownCircle, GitBranch, Shield, BarChart3, Plus, CheckCircle,
  Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: 'Buenos días', emoji: '☀️' };
  if (hour >= 12 && hour < 19) return { text: 'Buenas tardes', emoji: '🌤' };
  return { text: 'Buenas noches', emoji: '🌙' };
}

const WIP_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
  'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500',
];

export const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const greeting = getGreeting();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const get = (path) => fetch(`${API}${path}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);

    Promise.all([get('/stats'), get('/reportes-produccion/dashboard'), get('/reportes-produccion/alertas-produccion')])
      .then(([s, d, a]) => { setStats(s); setDashboard(d); setAlertas(a); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Cargando dashboard...</div></div>;

  const atrasados = dashboard?.atrasados || 0;

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div>
        <h2 className="dashboard-title">{greeting.text}, {user?.nombre_completo?.split(' ')[0] || user?.username} {greeting.emoji}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="card-elevated kpi-border-blue cursor-pointer hover:border-primary/40" onClick={() => navigate('/reportes/seguimiento')} data-testid="kpi-en-proceso">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">En Proceso</span>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><Activity className="h-4 w-4 text-blue-500" /></div>
            </div>
            <p className="text-3xl kpi-value tracking-tight">{dashboard?.total_en_proceso || stats?.registros || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">lotes activos</p>
            <div className="kpi-progress"><div className="kpi-progress-fill bg-blue-500" style={{ width: '60%' }} /></div>
          </CardContent>
        </Card>
        <Card className="card-elevated kpi-border-green" data-testid="kpi-prendas">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">Prendas</span>
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle className="h-4 w-4 text-green-500" /></div>
            </div>
            <p className="text-3xl kpi-value tracking-tight">{(dashboard?.total_prendas_proceso || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">en produccion</p>
            <div className="kpi-progress"><div className="kpi-progress-fill bg-green-500" style={{ width: '80%' }} /></div>
          </CardContent>
        </Card>
        <Card className="card-elevated kpi-border-red cursor-pointer hover:border-destructive/40" onClick={() => navigate('/reportes/seguimiento?tab=atrasados')} data-testid="kpi-atrasados">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">Atrasados</span>
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-red-500" /></div>
            </div>
            <p className={`kpi-value tracking-tight ${atrasados > 0 ? 'text-4xl text-red-600 dark:text-red-400' : 'text-3xl'}`}>{atrasados}</p>
            <p className="text-xs text-muted-foreground mt-1">requieren atencion</p>
            <div className="kpi-progress"><div className="kpi-progress-fill bg-red-500" style={{ width: '20%' }} /></div>
          </CardContent>
        </Card>
        <Card className="card-elevated kpi-border-amber" data-testid="kpi-movs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">Movimientos</span>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><Clock className="h-4 w-4 text-amber-500" /></div>
            </div>
            <p className="text-3xl kpi-value tracking-tight">{dashboard?.movimientos_abiertos || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">abiertos</p>
            <div className="kpi-progress"><div className="kpi-progress-fill bg-amber-500" style={{ width: '40%' }} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Acciones Rápidas */}
      <div className="grid gap-3 grid-cols-3">
        {[
          { label: 'Nuevo Lote', icon: Plus, to: '/registros/nuevo', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
          { label: 'Registrar Movimiento', icon: Play, to: '/registros', color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
          { label: 'Ingreso Stock', icon: ArrowDownCircle, to: '/inventario/ingresos', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
        ].map(action => (
          <button key={action.to} onClick={() => navigate(action.to)}
            className="flex items-center gap-3 p-4 rounded-xl border hover:bg-accent hover:border-primary/30 transition-all text-left"
            data-testid={`action-${action.to.split('/').pop()}`}>
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${action.color}`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Alertas Produccion */}
      {alertas && alertas.resumen?.total > 0 && (
        <Card className="card-elevated border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10" data-testid="dashboard-alertas">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <CardTitle className="text-sm font-semibold">Alertas de Produccion</CardTitle>
                <Badge variant="destructive" className="text-xs">{alertas.resumen.total}</Badge>
              </div>
              <div className="flex gap-1.5">
                {alertas.resumen.vencidos > 0 && <Badge className="bg-zinc-800 text-white text-xs">{alertas.resumen.vencidos} vencidos</Badge>}
                {alertas.resumen.criticos > 0 && <Badge variant="destructive" className="text-xs">{alertas.resumen.criticos} criticos</Badge>}
                {alertas.resumen.paralizados > 0 && <Badge className="bg-amber-500 text-white text-xs">{alertas.resumen.paralizados} paralizados</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-1">
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {alertas.alertas.slice(0, 6).map((a) => (
                <div key={a.movimiento_id}
                  className={`flex items-center gap-2 p-2 rounded-md border bg-white dark:bg-zinc-900 hover:shadow-sm cursor-pointer transition-all text-sm ${a.urgente ? 'alerta-urgente border-red-300 dark:border-red-800' : ''}`}
                  onClick={() => navigate(`/registros/editar/${a.registro_id}`)} data-testid={`alerta-${a.n_corte}`}>
                  {a.paralizado
                    ? <PauseCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    : <AlertTriangle className={`h-4 w-4 shrink-0 ${a.urgente ? 'text-red-600' : 'text-red-500'}`} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-xs">Corte {a.n_corte}</span>
                      {a.urgente && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 font-bold">URG</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{a.servicio} - {a.persona}</p>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 shrink-0">{a.dias}d</Badge>
                </div>
              ))}
            </div>
            {alertas.alertas.length > 6 && (
              <button className="mt-2 text-xs text-primary hover:underline w-full text-center" onClick={() => navigate('/reportes/operativo')}>
                Ver todas ({alertas.alertas.length})
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stock Alerts */}
      {stats?.alertas_stock_total > 0 && (
        <Card className="card-elevated border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10 cursor-pointer hover:border-amber-400/60"
          onClick={() => navigate('/inventario/alertas-stock')} data-testid="dashboard-alerta-stock">
          <CardContent className="py-2.5 px-4">
            <div className="flex items-center gap-3">
              <PackageX className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium">{stats.alertas_stock_total} items requieren atencion</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {stats.sin_stock > 0 && <span className="text-red-500">{stats.sin_stock} sin stock</span>}
                  {stats.sin_stock > 0 && stats.stock_bajo > 0 && ' | '}
                  {stats.stock_bajo > 0 && <span className="text-amber-600">{stats.stock_bajo} stock bajo</span>}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* WIP por Etapa - Barras horizontales */}
      {dashboard?.distribucion_estado?.length > 0 && (() => {
        const sorted = [...dashboard.distribucion_estado].sort((a, b) => b.cantidad - a.cantidad);
        const maxCantidad = Math.max(...sorted.map(d => d.cantidad), 1);
        return (
          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> WIP por Etapa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sorted.map((d, i) => {
                  const pct = Math.round((d.cantidad / maxCantidad) * 100);
                  const color = WIP_COLORS[i % WIP_COLORS.length];
                  return (
                    <div key={d.estado} className="flex items-center gap-3">
                      <span className="text-xs w-24 shrink-0 truncate text-right text-muted-foreground font-medium">{d.estado}</span>
                      <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                        <div className={`wip-bar ${color}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <span className="text-xs font-mono font-semibold w-10 shrink-0 text-right">{d.cantidad}</span>
                      <span className="text-[10px] text-muted-foreground font-mono w-20 shrink-0">{(d.prendas || 0).toLocaleString()} prendas</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Servicios */}
      {dashboard?.por_servicio?.length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Carga por Servicio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.por_servicio.map((s) => {
                const maxVal = Math.max(...dashboard.por_servicio.map(x => x.enviadas || 0), 1);
                const pct = Math.round(((s.enviadas || 0) / maxVal) * 100);
                return (
                  <div key={s.servicio} className="flex items-center gap-3">
                    <span className="text-xs w-24 shrink-0 truncate text-right text-muted-foreground">{s.servicio}</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden relative">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold">{s.enviadas || 0} env / {s.recibidas || 0} rec</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">{s.lotes}L</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Acceso Rapido */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Acceso Rapido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Seguimiento', to: '/reportes/seguimiento', icon: Activity },
              { label: 'Operativo', to: '/reportes/operativo', icon: Users },
              { label: 'Lotes', to: '/reportes/lotes', icon: GitBranch },
              { label: 'Valorizacion', to: '/reportes/valorizacion', icon: Package },
              { label: 'Calidad', to: '/reportes/calidad', icon: Shield },
              { label: 'Matriz', to: '/reportes/matriz', icon: BarChart3 },
            ].map(link => (
              <button key={link.to} onClick={() => navigate(link.to)}
                className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-accent hover:border-primary/30 transition-colors text-xs text-left"
                data-testid={`link-${link.to.split('/').pop()}`}>
                <link.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {link.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Registros', value: stats?.registros, icon: ClipboardList },
          { label: 'Modelos', value: stats?.modelos, icon: Box },
          { label: 'Urgentes', value: stats?.registros_urgentes, icon: AlertTriangle },
          { label: 'Fraccionados', value: dashboard?.lotes_fraccionados, icon: GitBranch },
          { label: 'Items Inv.', value: stats?.inventario, icon: Package },
        ].map(s => (
          <Card key={s.label} className="card-elevated">
            <CardContent className="p-3 text-center">
              <s.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-xl kpi-value">{s.value || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
