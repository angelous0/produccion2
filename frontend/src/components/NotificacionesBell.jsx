import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Bell, AlertTriangle, Clock, PauseCircle, ExternalLink, X, PackageX } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const NIVEL_STYLES = {
  vencido: { bg: 'bg-zinc-800', text: 'text-white', label: 'Vencido' },
  critico: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critico' },
};

export const NotificacionesBell = () => {
  const [open, setOpen]       = useState(false);
  const [prodData, setProdData] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [activeTab, setActiveTab] = useState('produccion');
  const navigate  = useNavigate();
  const ref       = useRef(null);
  const { isAdmin, canService, todosServicios } = usePermissions();

  const fetchAlertas = async () => {
    try {
      const [prod, stock] = await Promise.all([
        axios.get(`${API}/reportes-produccion/alertas-produccion`),
        axios.get(`${API}/inventario/alertas-stock?modo=fisico`).catch(() => ({ data: { items: [] } })),
      ]);
      setProdData(prod.data);
      const stockItems = stock.data?.items || stock.data || [];
      setStockData(stockItems.filter(s => !s.ignorar_alerta_stock));
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredAlertas = (prodData?.alertas || []).filter(a => {
    if (isAdmin || todosServicios) return true;
    return canService(a.servicio_id);
  });

  const totalProd  = filteredAlertas.length;
  const totalStock = stockData.length;
  const total      = totalProd + totalStock;

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
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border bg-card shadow-xl z-50 max-h-[70vh] flex flex-col overflow-hidden" data-testid="panel-notificaciones">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Notificaciones</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex border-b flex-shrink-0">
            <button
              onClick={() => setActiveTab('produccion')}
              className={"flex-1 px-3 py-2 text-xs font-semibold transition-colors " + (activeTab === 'produccion' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              Produccion
              {totalProd > 0 && <span className="ml-1.5 bg-red-600 text-white rounded-full px-1.5 py-0.5 text-[10px]">{totalProd}</span>}
            </button>
            <button
              onClick={() => setActiveTab('stock')}
              className={"flex-1 px-3 py-2 text-xs font-semibold transition-colors " + (activeTab === 'stock' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              Stock Bajo
              {totalStock > 0 && <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{totalStock}</span>}
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {activeTab === 'produccion' && (
              totalProd === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Sin alertas de produccion</div>
              ) : (
                filteredAlertas.map((a) => {
                  const nivel = NIVEL_STYLES[a.nivel] || NIVEL_STYLES.critico;
                  return (
                    <div
                      key={a.movimiento_id}
                      className="flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => { navigate('/registros/editar/' + a.registro_id); setOpen(false); }}
                      data-testid={`alerta-${a.n_corte}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {a.paralizado ? (
                          <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center">
                            <PauseCircle className="h-4 w-4 text-amber-600" />
                          </div>
                        ) : (
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center ${nivel.bg}`}>
                            <AlertTriangle className={`h-4 w-4 ${nivel.text}`} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold">Corte {a.n_corte}</span>
                          {a.urgente && <span className="text-[9px] bg-red-600 text-white px-1 rounded font-bold">URG</span>}
                          {a.paralizado && <span className="text-[9px] bg-amber-500 text-white px-1 rounded font-bold">PARALIZADO</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{a.servicio} · {a.persona}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{a.dias}d sin actualizar</span>
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  );
                })
              )
            )}

            {activeTab === 'stock' && (
              totalStock === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Sin alertas de stock</div>
              ) : (
                stockData.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => { navigate('/inventario/alertas-stock'); setOpen(false); }}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.estado === 'sin_stock' ? 'bg-red-100' : 'bg-amber-100'}`}>
                      <PackageX className={`h-4 w-4 ${s.estado === 'sin_stock' ? 'text-red-600' : 'text-amber-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{s.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Stock: <span className={`font-bold ${s.stock_fisico === 0 ? 'text-red-600' : 'text-amber-600'}`}>{s.stock_fisico}</span>
                        {s.stock_minimo > 0 && <span> / Min: {s.stock_minimo}</span>}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.estado === 'sin_stock' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {s.estado === 'sin_stock' ? 'Sin stock' : 'Bajo'}
                    </span>
                  </div>
                ))
              )
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t bg-muted/20 flex-shrink-0">
            <button
              onClick={() => { navigate('/reportes/seguimiento'); setOpen(false); }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Ver todos los reportes →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
