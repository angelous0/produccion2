import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Clock, Play, CheckCircle2 } from 'lucide-react';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getMovBadge(mov, hoy) {
  if (mov.estado_mov === 'completado') {
    return { label: 'Terminado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (mov.estado_mov === 'en_proceso') {
    // Si tiene fecha_esperada, ver si está atrasado
    if (mov.fecha_esperada_movimiento) {
      const fe = new Date(mov.fecha_esperada_movimiento);
      const diff = Math.round((fe - hoy) / 86400000);
      if (diff < 0) return { label: Math.abs(diff) + 'd atrasado', cls: 'bg-red-100 text-red-700 border-red-200' };
      if (diff <= 3) return { label: diff + 'd', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
      return { label: 'En proceso', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    return { label: 'En proceso', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  return { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
}

const SERVICIO_COLORES = {
  'Corte': 'bg-violet-100 text-violet-800 border-violet-200',
  'Costura': 'bg-sky-100 text-sky-800 border-sky-200',
  'Acabado': 'bg-teal-100 text-teal-800 border-teal-200',
  'Estampado': 'bg-orange-100 text-orange-800 border-orange-200',
  'Bordado': 'bg-pink-100 text-pink-800 border-pink-200',
  'Lavandería': 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

function getServicioColor(servicio) {
  return SERVICIO_COLORES[servicio] || 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function AgendaEntregas() {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/agenda-movimientos`)
      .then(r => setMovimientos(r.data || []))
      .catch(() => setMovimientos([]))
      .finally(() => setLoading(false));
  }, []);

  // Servicios únicos para el filtro
  const servicios = [...new Set(movimientos.map(m => m.servicio_nombre).filter(Boolean))].sort();

  // Filtrar por servicio
  const movsFiltrados = filtroServicio === 'todos'
    ? movimientos
    : movimientos.filter(m => m.servicio_nombre === filtroServicio);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const primerDia = new Date(mes.y, mes.m, 1);
  const ultimoDia = new Date(mes.y, mes.m + 1, 0);
  const startOffset = primerDia.getDay();
  const totalCeldas = Math.ceil((startOffset + ultimoDia.getDate()) / 7) * 7;

  // Agrupar movimientos filtrados por día
  const porDia = {};
  movsFiltrados.forEach(m => {
    const fecha = m.fecha_agenda;
    if (!fecha) return;
    const [y, mo, day] = fecha.split('-').map(Number);
    if (y === mes.y && mo === mes.m + 1) {
      if (!porDia[day]) porDia[day] = [];
      porDia[day].push(m);
    }
  });

  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dias = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  // Stats para el mes actual (sobre datos filtrados)
  const movsMes = movsFiltrados.filter(m => {
    if (!m.fecha_agenda) return false;
    const [y, mo] = m.fecha_agenda.split('-').map(Number);
    return y === mes.y && mo === mes.m + 1;
  });
  const enProceso = movsMes.filter(m => m.estado_mov === 'en_proceso').length;
  const completados = movsMes.filter(m => m.estado_mov === 'completado').length;
  const atrasados = movsFiltrados.filter(m => {
    if (m.estado_mov === 'completado') return false;
    if (!m.fecha_esperada_movimiento) return false;
    return new Date(m.fecha_esperada_movimiento) < hoy;
  }).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" /> Agenda de Producción
        </h2>
        <p className="text-sm text-muted-foreground">Movimientos de producción por fecha esperada / inicio / fin</p>
      </div>

      {/* Filtro por servicio */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtrar servicio:</span>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFiltroServicio('todos')}
            className={"px-3 py-1 rounded-full text-xs font-medium border transition-colors " +
              (filtroServicio === 'todos' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted')}
          >
            Todos
          </button>
          {servicios.map(s => (
            <button
              key={s}
              onClick={() => setFiltroServicio(filtroServicio === s ? 'todos' : s)}
              className={"px-3 py-1 rounded-full text-xs font-medium border transition-colors " +
                (filtroServicio === s ? getServicioColor(s).replace('border-', 'border-') + ' ring-1 ring-offset-1' : getServicioColor(s) + ' opacity-60 hover:opacity-100')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'En proceso', value: enProceso, icon: Play, cls: 'text-blue-600' },
          { label: 'Atrasados', value: atrasados, icon: AlertTriangle, cls: 'text-red-600' },
          { label: 'Completados', value: completados, icon: CheckCircle2, cls: 'text-emerald-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <k.icon className={"h-8 w-8 " + k.cls} />
            <div>
              <p className={"text-2xl font-bold font-mono " + k.cls}>{k.value}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <button onClick={() => setMes(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
            className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-bold text-base">{meses[mes.m]} {mes.y}</h3>
          <button onClick={() => setMes(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
            className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b">
          {dias.map(d => <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>)}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Cargando...</div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCeldas }).map((_, i) => {
              const dia = i - startOffset + 1;
              const esValido = dia >= 1 && dia <= ultimoDia.getDate();
              const esHoy = esValido && new Date(mes.y, mes.m, dia).toDateString() === hoy.toDateString();
              const items = esValido ? (porDia[dia] || []) : [];
              return (
                <div key={i} className={"min-h-[90px] p-1.5 border-b border-r last:border-r-0 " + (!esValido ? 'bg-muted/20' : esHoy ? 'bg-primary/5' : '')}>
                  {esValido && (
                    <>
                      <span className={"text-xs font-medium mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full " + (esHoy ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                        {dia}
                      </span>
                      <div className="space-y-0.5">
                        {items.slice(0, 4).map((m, j) => {
                          const sColor = getServicioColor(m.servicio_nombre);
                          const isEnProceso = m.estado_mov === 'en_proceso';
                          const isCompletado = m.estado_mov === 'completado';
                          const badge = getMovBadge(m, hoy);
                          const isAtrasado = !isCompletado && m.fecha_esperada_movimiento && new Date(m.fecha_esperada_movimiento) < hoy;
                          const isProximo = !isCompletado && !isAtrasado && m.fecha_esperada_movimiento && Math.round((new Date(m.fecha_esperada_movimiento) - hoy) / 86400000) <= 3;
                          return (
                            <div
                              key={j}
                              onClick={() => navigate(`/registros/${m.registro_id}`)}
                              title={`${m.n_corte} · ${m.servicio_nombre}${m.persona_nombre ? ' · ' + m.persona_nombre : ''} — ${badge.label}`}
                              className={
                                "text-[10px] px-1.5 py-0.5 rounded border font-medium truncate cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 " +
                                (isCompletado ? 'bg-emerald-50 text-emerald-700 border-emerald-200 opacity-60'
                                  : isAtrasado ? 'bg-red-100 text-red-800 border-red-300 ring-1 ring-red-200'
                                  : isProximo ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : sColor)
                              }
                            >
                              {isAtrasado && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                              {isProximo && !isAtrasado && <Clock className="h-2.5 w-2.5 shrink-0" />}
                              {isEnProceso && !isAtrasado && !isProximo && <Play className="h-2.5 w-2.5 shrink-0 fill-current" />}
                              {isCompletado && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                              <span className="truncate">
                                {m.n_corte}{m.modelo_nombre ? ' - ' + m.modelo_nombre.substring(0, 8) : ''} ({m.servicio_nombre?.substring(0, 4)})
                              </span>
                            </div>
                          );
                        })}
                        {items.length > 4 && <div className="text-[10px] text-muted-foreground pl-1">+{items.length - 4} más</div>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-100 border border-red-300"></span> Atrasado</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-50 border border-amber-300"></span> Pronto (3d)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-100 border border-violet-200"></span> Corte</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sky-100 border border-sky-200"></span> Costura</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-teal-100 border border-teal-200"></span> Acabado</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-orange-100 border border-orange-200"></span> Estampado</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-200"></span> Completado</span>
      </div>
    </div>
  );
}
