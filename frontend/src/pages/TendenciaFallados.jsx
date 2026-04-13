import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Wrench, TrendingDown, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '../components/ui/badge';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADOS = {
  VENCIDO:     { label: 'Vencido',    cls: 'bg-red-100 text-red-700 border-red-200' },
  EN_ARREGLO:  { label: 'En Arreglo', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  PARCIAL:     { label: 'Parcial',    cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  COMPLETADO:  { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  SIN_ASIGNAR: { label: 'Sin Asignar',cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export default function TendenciaFallados() {
  const [fallados, setFallados] = useState([]);
  const [mermas, setMermas]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/fallados-control?limit=500`),
      axios.get(`${API}/reportes/mermas/`),
    ]).then(([f, m]) => {
      const fd = f.data?.items || f.data;
      setFallados(Array.isArray(fd) ? fd : []);
      setMermas(m.data || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const total     = fallados.length;
  const vencidos  = fallados.filter(f => f.estado === 'VENCIDO').length;
  const enArreglo = fallados.filter(f => f.estado === 'EN_ARREGLO').length;
  const completados = fallados.filter(f => f.estado === 'COMPLETADO').length;

  const filtered = filtroEstado === 'todos' ? fallados : fallados.filter(f => f.estado === filtroEstado);

  const porMes = mermas?.por_mes || [];
  const maxMerma = Math.max(...porMes.map(m => m.cantidad), 1);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-primary" /> Fallados, Arreglos y Mermas
        </h2>
        <p className="text-sm text-muted-foreground">Seguimiento de prendas falladas, en arreglo y mermas por periodo</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Fallados', value: total, icon: AlertTriangle, cls: 'text-gray-700' },
          { label: 'Vencidos', value: vencidos, icon: AlertTriangle, cls: 'text-red-600' },
          { label: 'En Arreglo', value: enArreglo, icon: Wrench, cls: 'text-blue-600' },
          { label: 'Completados', value: completados, icon: CheckCircle2, cls: 'text-emerald-600' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <k.icon className={"h-7 w-7 " + k.cls} />
            <div>
              <p className={"text-2xl font-bold font-mono " + k.cls}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {porMes.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" /> Mermas por Mes
          </h3>
          <div className="flex items-end gap-2 h-28">
            {porMes.map((m, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs font-mono font-bold text-primary">{m.cantidad}</span>
                <div className="w-full rounded-t-md bg-primary/80 transition-all" style={{ height: Math.max(4, (m.cantidad / maxMerma) * 80) + 'px' }} />
                <span className="text-[10px] text-muted-foreground">{m.mes?.substring(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm font-medium">Filtrar:</span>
          {['todos', 'VENCIDO', 'EN_ARREGLO', 'PARCIAL', 'COMPLETADO', 'SIN_ASIGNAR'].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={"px-2.5 py-1 text-xs rounded-md border font-medium transition-colors " + (filtroEstado===e ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border')}>
              {e === 'todos' ? 'Todos' : (ESTADOS[e]?.label || e)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-sm">Sin fallados en este filtro</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Corte','Modelo','Servicio','Persona','Qty Fallada','Estado','Fecha'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => {
                  const est = ESTADOS[f.estado] || { label: f.estado, cls: 'bg-muted text-muted-foreground border-border' };
                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-bold">{f.registro_n_corte || f.n_corte || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.modelo_nombre || '—'}</td>
                      <td className="px-3 py-2">{f.servicio_nombre || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.persona_nombre || '—'}</td>
                      <td className="px-3 py-2 font-mono font-bold text-red-600">{f.cantidad_fallada || f.cantidad || 0}</td>
                      <td className="px-3 py-2">
                        <span className={"inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border " + est.cls}>{est.label}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{f.created_at ? f.created_at.substring(0,10) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}