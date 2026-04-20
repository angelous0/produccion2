import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PauseCircle, Clock, Package, Activity, TrendingUp, ArrowRight, RefreshCw, Bell } from 'lucide-react';
import { Badge } from '../components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ResumenDiario() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [regs, alertas, mermas] = await Promise.all([
        axios.get(`${API}/registros/?limit=500`).then(r => r.data?.items || r.data || []).catch(() => []),
        axios.get(`${API}/reportes-produccion/alertas-produccion`).then(r => r.data?.alertas || []).catch(() => []),
        axios.get(`${API}/reportes/mermas/`).then(r => r.data).catch(() => null),
      ]);

      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const activos     = regs.filter(r => r.estado_op !== 'CERRADA');
      const atrasados   = regs.filter(r => r.fecha_entrega_final && new Date(r.fecha_entrega_final) < hoy && r.estado_op !== 'CERRADA');
      const paralizados = regs.filter(r => r.paralizacion_activa);
      const proximos7d  = regs.filter(r => {
        if (!r.fecha_entrega_final || r.estado_op === 'CERRADA') return false;
        const d = Math.round((new Date(r.fecha_entrega_final) - hoy) / 86400000);
        return d >= 0 && d <= 7;
      });
      const totalPrendas = activos.reduce((s,r) => s + (r.cantidad_divisiones || 0), 0);

      const byEstado = {};
      activos.forEach(r => { byEstado[r.estado] = (byEstado[r.estado] || 0) + 1; });
      const topEstados = Object.entries(byEstado).sort((a,b) => b[1]-a[1]).slice(0,5);

      setData({ activos: activos.length, atrasados: atrasados.length, paralizados: paralizados.length,
        proximos7d: proximos7d.length, totalPrendas, alertas, topEstados, mermas,
        proximosLotes: proximos7d.slice(0,5), atrasadosLotes: atrasados.slice(0,5) });
      setLastUpdate(new Date());
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const hora = lastUpdate ? lastUpdate.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour:'2-digit', minute:'2-digit' }) : '';

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground gap-2"><RefreshCw className="h-5 w-5 animate-spin" /> Cargando resumen...</div>;
  if (!data) return <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground"><AlertTriangle className="h-8 w-8 text-amber-500" /><p className="text-sm">No se pudo cargar el resumen. Verifica la conexión.</p><button onClick={cargar} className="text-xs border rounded-lg px-3 py-1.5 hover:bg-muted">Reintentar</button></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Resumen del Dia
          </h2>
          <p className="text-sm text-muted-foreground">Estado operativo consolidado con alertas activas</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar {hora && '(' + hora + ')'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Lotes Activos', value: data.activos, icon: Activity, cls: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950', onClick: () => navigate('/reportes/seguimiento') },
          { label: 'Prendas en Proceso', value: data.totalPrendas.toLocaleString(), icon: Package, cls: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950' },
          { label: 'Atrasados', value: data.atrasados, icon: AlertTriangle, cls: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950', onClick: () => navigate('/reportes/entregas') },
          { label: 'Entregan en 7d', value: data.proximos7d, icon: Clock, cls: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950', onClick: () => navigate('/reportes/agenda-entregas') },
        ].map(k => (
          <div key={k.label} onClick={k.onClick} className={"rounded-xl border bg-card p-4 flex items-center gap-3 " + (k.onClick ? 'cursor-pointer hover:border-primary/40 transition-colors' : '')}>
            <div className={"flex items-center justify-center h-11 w-11 rounded-xl flex-shrink-0 " + k.bg}>
              <k.icon className={"h-5 w-5 " + k.cls} />
            </div>
            <div>
              <p className={"text-2xl font-bold font-mono " + k.cls}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Alertas Activas</h3>
            <Badge variant="destructive" className="text-xs">{data.alertas.length}</Badge>
          </div>
          {data.alertas.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">Sin alertas activas</div>
          ) : (
            <div className="divide-y max-h-64 overflow-y-auto">
              {data.alertas.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate('/registros/editar/' + a.registro_id)}>
                  <div className={"flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 " + (a.nivel === 'critico' ? 'bg-red-100' : 'bg-amber-100')}>
                    {a.paralizado ? <PauseCircle className="h-3.5 w-3.5 text-red-600" /> : <AlertTriangle className={"h-3.5 w-3.5 " + (a.nivel === 'critico' ? 'text-red-600' : 'text-amber-600')} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">Corte {a.n_corte} — {a.servicio}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.persona} · {a.dias}d {a.paralizado ? '· PARALIZADO' : ''}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" /> Proximas Entregas</h3>
            <button onClick={() => navigate('/reportes/agenda-entregas')} className="text-xs text-primary hover:underline">Ver calendario</button>
          </div>
          {data.proximosLotes.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">Sin entregas proximas</div>
          ) : (
            <div className="divide-y max-h-64 overflow-y-auto">
              {data.proximosLotes.map((r, i) => {
                const hoy2 = new Date(); hoy2.setHours(0,0,0,0);
                const diff = Math.round((new Date(r.fecha_entrega_final) - hoy2) / 86400000);
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer" onClick={() => navigate('/registros/editar/' + r.id)}>
                    <div className={"flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 " + (diff <= 0 ? 'bg-red-100' : diff <= 3 ? 'bg-amber-100' : 'bg-blue-50')}>
                      <span className={"text-[10px] font-bold " + (diff <= 0 ? 'text-red-600' : diff <= 3 ? 'text-amber-600' : 'text-blue-600')}>{diff}d</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">Corte {r.n_corte}</p>
                      <p className="text-[11px] text-muted-foreground">{r.modelo_nombre} · {r.estado}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{r.fecha_entrega_final}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-bold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" /> WIP por Etapa</h3>
          </div>
          <div className="p-4 space-y-2">
            {data.topEstados.map(([estado, count], i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs w-32 truncate text-muted-foreground">{estado}</span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: (count / data.activos * 100) + '%' }} />
                </div>
                <span className="text-xs font-bold font-mono w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {data.paralizados > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-200">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2"><PauseCircle className="h-4 w-4" /> Paralizados ({data.paralizados})</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-red-600 mb-2">{data.paralizados} lote{data.paralizados > 1 ? 's' : ''} con paralizacion activa</p>
              <button onClick={() => navigate('/reportes/seguimiento?tab=paralizados')} className="text-xs text-red-700 font-medium hover:underline flex items-center gap-1">
                Ver paralizados <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}