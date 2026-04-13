import { useEffect, useState } from 'react';
import axios from 'axios';
import { Truck } from 'lucide-react';
import { Badge } from '../components/ui/badge';
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
function getEntregaBadge(r) {
  if (!r.fecha_entrega_final) return { label: 'Sin fecha', variant: 'secondary' };
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fe = new Date(r.fecha_entrega_final);
  const diff = Math.round((fe - hoy) / 86400000);
  if (r.estado_op === 'CERRADA') return { label: 'Entregado', variant: 'default' };
  if (diff < 0) return { label: Math.abs(diff) + 'd atrasado', variant: 'destructive' };
  if (diff <= 3) return { label: diff + 'd restantes', variant: 'outline' };
  return { label: diff + 'd restantes', variant: 'secondary' };
}
export default function ReporteEntregas() {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  useEffect(() => {
    axios.get(`${API}/registros/?limit=500`)
      .then(r => setRegistros((r.data && r.data.items) ? r.data.items : (Array.isArray(r.data) ? r.data : [])))
      .catch(() => setRegistros([]))
      .finally(() => setLoading(false));
  }, []);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const conFecha = registros.filter(r => r.fecha_entrega_final);
  const filtered =
    filtro === 'atrasados' ? conFecha.filter(r => new Date(r.fecha_entrega_final) < hoy && r.estado_op !== 'CERRADA')
    : filtro === 'proximos' ? conFecha.filter(r => { const d = Math.round((new Date(r.fecha_entrega_final)-hoy)/86400000); return d >= 0 && d <= 7 && r.estado_op !== 'CERRADA'; })
    : filtro === 'entregados' ? conFecha.filter(r => r.estado_op === 'CERRADA')
    : conFecha;
  const sorted = [...filtered].sort((a,b) => new Date(a.fecha_entrega_final) - new Date(b.fecha_entrega_final));
  const FILTROS = [['todos','Todos'],['atrasados','Atrasados'],['proximos','Proximos 7d'],['entregados','Entregados']];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" /> Entregas
        </h2>
        <p className="text-sm text-muted-foreground">Fechas comprometidas vs estado real</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(([v,l]) => (
          <button key={v} onClick={() => setFiltro(v)}
            className={"px-3 py-1.5 rounded-md text-xs font-medium transition-colors border " + (filtro===v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border')}>
            {l}
          </button>
        ))}
      </div>
      {loading ? (<div className="flex items-center justify-center h-40 text-muted-foreground">Cargando...</div>)
      : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
          <Truck className="h-8 w-8 opacity-30" />
          <p className="text-sm">Sin registros con fecha de entrega en este filtro</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {['Corte','Modelo','Estado','Fecha Entrega','Situacion'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r,i) => {
                const b = getEntregaBadge(r);
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{r.n_corte}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.modelo_nombre || '—'}</td>
                    <td className="px-3 py-2">{r.estado}</td>
                    <td className="px-3 py-2">{r.fecha_entrega_final}</td>
                    <td className="px-3 py-2"><Badge variant={b.variant} className="text-xs">{b.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}