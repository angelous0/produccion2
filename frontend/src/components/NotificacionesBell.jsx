import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bell, AlertTriangle, Clock, PauseCircle, ExternalLink, X } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NIVEL_STYLES = {
  vencido: { bg: 'bg-zinc-800', text: 'text-white', label: 'Vencido' },
  critico: { bg: 'bg-red-100', text: 'text-red-800', label: 'Crítico' },
};

export const NotificacionesBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const ref = useRef(null);
  const { canService, todosServicios, serviciosPermitidos, isAdmin } = usePermissions('registros');

  const fetchAlertas = async () => {
    try {
      const res = await axios.get(`${API}/reportes-produccion/alertas-produccion`);
      setData(res.data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Filtrar alertas por servicios permitidos del usuario
  const filteredAlertas = (data?.alertas || []).filter(a => {
    if (isAdmin || todosServicios) return true;
    return canService(a.servicio_id);
  });
  const total = filteredAlertas.length;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative"
        data-testid="btn-notificaciones"
      >
        <Bell className={`h-5 w-5 ${total > 0 ? 'text-foreground' : 'text-muted-foreground'}`} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white px-1" data-testid="badge-alertas-count">
            {total}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-lg border bg-card shadow-xl z-50 max-h-[70vh] flex flex-col" data-testid="panel-notificaciones">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-sm">Alertas de Producción</span>
            </div>
            <div className="flex items-center gap-1.5">
              {data?.resumen?.vencidos > 0 && <Badge variant="outline" className="text-[10px] border-zinc-400">{data.resumen.vencidos} vencidos</Badge>}
              {data?.resumen?.criticos > 0 && <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">{data.resumen.criticos} críticos</Badge>}
              {data?.resumen?.paralizados > 0 && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">{data.resumen.paralizados} paralizados</Badge>}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {!data || total === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Sin alertas activas
              </div>
            ) : (
              filteredAlertas.map((a) => {
                const style = NIVEL_STYLES[a.nivel] || NIVEL_STYLES.critico;
                return (
                  <div
                    key={a.movimiento_id}
                    className="flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => { navigate(`/registros/editar/${a.registro_id}`); setOpen(false); }}
                    data-testid={`alerta-${a.n_corte}`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {a.paralizado ? (
                        <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center">
                          <PauseCircle className="h-4 w-4 text-amber-600" />
                        </div>
                      ) : a.nivel === 'vencido' ? (
                        <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-white" />
                        </div>
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">Corte {a.n_corte}</span>
                        {a.urgente && <span className="text-[10px] font-bold text-red-600">URG</span>}
                        <Badge className={`${style.bg} ${style.text} text-[10px] border-0 px-1.5`}>{style.label}</Badge>
                        {a.paralizado && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Paralizado</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.servicio} · {a.persona} · {a.modelo}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.motivo_texto}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{a.dias}d transcurridos</span>
                        <span>Avance: {a.avance}%</span>
                        {a.incidencias > 0 && <span className="text-red-500 font-medium">{a.incidencias} inc.</span>}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {total > 0 && (
            <div className="px-4 py-2 border-t bg-muted/20">
              <button
                className="text-xs text-primary hover:underline w-full text-center"
                onClick={() => { navigate('/reportes/costura'); setOpen(false); }}
                data-testid="link-ver-reporte"
              >
                Ver reporte completo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
