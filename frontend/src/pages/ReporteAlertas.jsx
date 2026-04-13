import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Bell, AlertTriangle, PauseCircle, Clock, PackageX,
  ExternalLink, RefreshCw, ChevronRight, CalendarClock,
  MessageSquareWarning, Truck,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIPO_CONFIG = {
  vencido:       { icon: AlertTriangle, label: 'Vencido', cls: 'bg-red-100 text-red-800 border-red-200', iconCls: 'text-red-600 bg-red-50' },
  por_vencer_48: { icon: CalendarClock, label: 'Vence pronto', cls: 'bg-amber-100 text-amber-800 border-amber-200', iconCls: 'text-amber-600 bg-amber-50' },
  paralizado:    { icon: PauseCircle, label: 'Paralizado', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', iconCls: 'text-yellow-600 bg-yellow-50' },
  sin_motivo:    { icon: MessageSquareWarning, label: 'Sin motivo', cls: 'bg-purple-100 text-purple-800 border-purple-200', iconCls: 'text-purple-600 bg-purple-50' },
  sin_actualizar:{ icon: Clock, label: 'Sin actualizar', cls: 'bg-blue-100 text-blue-800 border-blue-200', iconCls: 'text-blue-600 bg-blue-50' },
  critico:       { icon: AlertTriangle, label: 'Critico', cls: 'bg-red-100 text-red-800 border-red-200', iconCls: 'text-red-600 bg-red-50' },
  stock_bajo:    { icon: PackageX, label: 'Stock bajo', cls: 'bg-orange-100 text-orange-800 border-orange-200', iconCls: 'text-orange-600 bg-orange-50' },
};

const KpiCard = ({ label, value, icon: Icon, danger }) => (
  <Card className={danger && value > 0 ? 'border-red-200 bg-red-50/30' : ''}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${danger && value > 0 ? 'bg-red-100' : 'bg-muted'}`}>
        <Icon className={`h-4 w-4 ${danger && value > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={`text-xl font-bold ${danger && value > 0 ? 'text-red-700' : ''}`}>{value}</p>
      </div>
    </CardContent>
  </Card>
);

export default function ReporteAlertas() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState([]);
  const [resumen, setResumen] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [alertasRes, tmRes, stockRes] = await Promise.all([
        axios.get(`${API}/reportes-produccion/alertas-produccion`),
        axios.get(`${API}/reportes-produccion/tiempos-muertos`),
        axios.get(`${API}/inventario/alertas-stock/`).catch(() => ({ data: { items: [] } })),
      ]);

      const items = [];
      const res = { vencidos: 0, por_vencer: 0, paralizados: 0, sin_motivo: 0, sin_actualizar: 0, stock_bajo: 0 };

      // 1. Alertas de producción (vencidos, críticos, paralizados)
      const prodAlertas = alertasRes.data?.alertas || [];
      for (const a of prodAlertas) {
        if (a.nivel === 'vencido') {
          items.push({ tipo: 'vencido', registro_id: a.registro_id, titulo: `Corte ${a.n_corte}`, subtitulo: `${a.servicio} · ${a.modelo || ''} · ${a.motivo_texto}`, urgente: a.urgente });
          res.vencidos++;
        }
        if (a.paralizado) {
          items.push({ tipo: 'paralizado', registro_id: a.registro_id, titulo: `Corte ${a.n_corte}`, subtitulo: `${a.servicio} · Producción paralizada`, urgente: a.urgente });
          res.paralizados++;
        }
        if (a.nivel === 'critico' && !a.paralizado) {
          items.push({ tipo: 'critico', registro_id: a.registro_id, titulo: `Corte ${a.n_corte}`, subtitulo: `${a.servicio} · ${a.motivo_texto}`, urgente: a.urgente });
        }
        if (a.dias_sin_actualizar >= 3) {
          items.push({ tipo: 'sin_actualizar', registro_id: a.registro_id, titulo: `Corte ${a.n_corte}`, subtitulo: `${a.servicio} · ${a.dias_sin_actualizar}d sin actualización`, urgente: a.urgente });
          res.sin_actualizar++;
        }
      }

      // 2. Por vencer 48h — alertas con fecha_esperada cercana
      for (const a of prodAlertas) {
        if (a.nivel !== 'vencido' && a.motivos?.some(m => m.includes('Entrega en'))) {
          items.push({ tipo: 'por_vencer_48', registro_id: a.registro_id, titulo: `Corte ${a.n_corte}`, subtitulo: `${a.servicio} · ${a.motivos.find(m => m.includes('Entrega en'))}`, urgente: a.urgente });
          res.por_vencer++;
        }
      }

      // 3. Lotes parados sin motivo (from tiempos muertos)
      const tmItems = tmRes.data?.items || [];
      for (const t of tmItems) {
        if (t.en_espera && t.inc_abiertas === 0) {
          items.push({ tipo: 'sin_motivo', registro_id: t.registro_id, titulo: `Corte ${t.n_corte}`, subtitulo: `${t.ultimo_servicio} · ${t.dias_parado}d parado sin incidencia registrada`, urgente: t.urgente });
          res.sin_motivo++;
        }
      }

      // 4. Stock bajo
      const stockItems = (stockRes.data?.items || stockRes.data || []);
      for (const s of stockItems.slice(0, 15)) {
        items.push({ tipo: 'stock_bajo', titulo: s.nombre || s.codigo || 'Material', subtitulo: `Stock: ${s.stock_disponible ?? s.stock ?? 0} — Mínimo: ${s.stock_minimo ?? '?'}` });
        res.stock_bajo++;
      }

      setAlertas(items);
      setResumen(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = filtroTipo === 'todos' ? alertas : alertas.filter(a => a.tipo === filtroTipo);

  const FILTROS = [
    { key: 'todos', label: 'Todas' },
    { key: 'vencido', label: 'Vencidos' },
    { key: 'por_vencer_48', label: 'Por vencer' },
    { key: 'paralizado', label: 'Paralizados' },
    { key: 'sin_motivo', label: 'Sin motivo' },
    { key: 'sin_actualizar', label: 'Sin actualizar' },
    { key: 'stock_bajo', label: 'Stock bajo' },
  ];

  return (
    <div className="space-y-4" data-testid="panel-alertas">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Panel de Alertas del Día
          </h2>
          <p className="text-sm text-muted-foreground">Vista unificada de alertas y excepciones activas</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Vencidos" value={resumen.vencidos || 0} icon={AlertTriangle} danger />
        <KpiCard label="Por vencer (48h)" value={resumen.por_vencer || 0} icon={CalendarClock} danger />
        <KpiCard label="Paralizados" value={resumen.paralizados || 0} icon={PauseCircle} danger />
        <KpiCard label="Sin motivo" value={resumen.sin_motivo || 0} icon={MessageSquareWarning} danger />
        <KpiCard label="Sin actualizar" value={resumen.sin_actualizar || 0} icon={Clock} danger />
        <KpiCard label="Stock bajo" value={resumen.stock_bajo || 0} icon={PackageX} danger />
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltroTipo(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              filtroTipo === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'
            }`}
          >
            {f.label}
            {f.key !== 'todos' && (
              <span className="ml-1 opacity-70">
                ({alertas.filter(a => a.tipo === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de alertas */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando alertas...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Sin alertas activas</p>
            <p className="text-xs">Todo está en orden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((alerta, idx) => {
            const cfg = TIPO_CONFIG[alerta.tipo] || TIPO_CONFIG.critico;
            const Icon = cfg.icon;
            return (
              <div
                key={`${alerta.tipo}-${alerta.registro_id || idx}`}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => alerta.registro_id && navigate(`/registros/editar/${alerta.registro_id}`)}
              >
                <div className={`flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0 ${cfg.iconCls}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{alerta.titulo}</p>
                    {alerta.urgente && <Badge variant="destructive" className="text-[9px] shrink-0">URG</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{alerta.subtitulo}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 border ${cfg.cls}`}>{cfg.label}</Badge>
                {alerta.registro_id && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
