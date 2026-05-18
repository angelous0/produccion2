import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Palette, Loader2, AlertTriangle, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { formatColorName } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MapeoOdooSection = ({ items, scope = {}, onMapped }) => {
  const [colores, setColores] = useState([]);
  const [loadingKey, setLoadingKey] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailById, setDetailById] = useState({});      // templateId → full variantes data
  const [detailLoading, setDetailLoading] = useState(null);
  // Debounce del reload del padre: agrupa varios mapeos seguidos en 1 sola recarga
  const reloadTimerRef = useRef(null);
  const scheduleParentReload = () => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      onMapped?.();
      reloadTimerRef.current = null;
    }, 1500);
  };
  useEffect(() => () => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
  }, []);

  // Cargar catálogo respetando la regla aplicable (marca/tipo/entalle/hilo).
  // Si la regla no devuelve nada, fallback al catálogo completo.
  useEffect(() => {
    if (!items || items.length === 0) return;
    (async () => {
      const baseParams = new URLSearchParams();
      if (scope?.marca_id)   baseParams.append('marca_id',   scope.marca_id);
      if (scope?.tipo_id)    baseParams.append('tipo_id',    scope.tipo_id);
      if (scope?.entalle_id) baseParams.append('entalle_id', scope.entalle_id);
      if (scope?.hilo_id)    baseParams.append('hilo_id',    scope.hilo_id);

      const tryParams = new URLSearchParams(baseParams);
      tryParams.append('solo_regla', 'true');
      try {
        let r = await axios.get(`${API}/colores-catalogo?${tryParams}`);
        let list = Array.isArray(r.data) ? r.data : [];
        if (list.length === 0) {
          const fb = new URLSearchParams(baseParams);
          fb.append('incluir_todos', 'true');
          r = await axios.get(`${API}/colores-catalogo?${fb}`);
          list = Array.isArray(r.data) ? r.data : [];
        }
        setColores(list);
      } catch {
        setColores([]);
      }
    })();
  }, [items, scope?.marca_id, scope?.tipo_id, scope?.entalle_id, scope?.hilo_id]);

  const filteredColores = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return colores;
    return colores.filter(c => (c.nombre || '').toLowerCase().includes(term));
  }, [colores, search]);

  // Agrupar por modelo
  const grupos = useMemo(() => {
    const m = new Map();
    (items || []).forEach(it => {
      if (!m.has(it.template_id)) {
        m.set(it.template_id, {
          template_id: it.template_id,
          template_name: it.template_name,
          colores: [],          // colores pendientes (sin mapear)
          stock_total: 0,
        });
      }
      const g = m.get(it.template_id);
      g.colores.push(it);
      g.stock_total += it.stock_total || 0;
    });
    return Array.from(m.values()).sort((a, b) => {
      if (b.stock_total !== a.stock_total) return b.stock_total - a.stock_total;
      return (a.template_name || '').localeCompare(b.template_name || '');
    });
  }, [items]);

  const cargarDetalleModelo = async (templateId) => {
    if (detailById[templateId]) return;
    setDetailLoading(templateId);
    try {
      // solo_tiendas=true ⇒ stock cuenta solo ubicaciones de venta reales
      // (tiendas físicas + taller), igual que el resumen del modelo.
      const res = await axios.get(`${API}/odoo-enriq/${templateId}/variantes?solo_tiendas=true`);
      setDetailById(prev => ({ ...prev, [templateId]: res.data }));
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleExpand = (templateId) => {
    if (expandedId === templateId) {
      setExpandedId(null);
    } else {
      setExpandedId(templateId);
      cargarDetalleModelo(templateId);
    }
  };

  if (!items || items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/15 dark:border-emerald-900 p-3">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          ✓ Todos los PT de Odoo están clasificados con su color
        </p>
      </div>
    );
  }

  const handleMap = async (templateId, colorOdoo, productIds, color) => {
    const key = `${templateId}-${colorOdoo}`;
    setError('');

    // 1) Update optimista: la fila se marca Mapeado al instante.
    //    Marcamos cada product_id con un objeto mapeo truthy para que
    //    `allMapped = product_ids.every(p => p.mapeo)` evalúe a true.
    setDetailById(prev => {
      const cur = prev[templateId];
      if (!cur) return prev;
      return {
        ...prev,
        [templateId]: {
          ...cur,
          colores: (cur.colores || []).map(cg => {
            if (cg.color_odoo !== colorOdoo) return cg;
            return {
              ...cg,
              product_ids: (cg.product_ids || []).map(p => ({
                ...p,
                mapeo: p.mapeo || { color_id: color.id, color_nombre: color.nombre, _optimistic: true },
              })),
            };
          }),
        },
      };
    });

    // 2) Cierra popover inmediatamente — puedes seguir mapeando otros.
    setOpenKey(null);
    setSearch('');
    setLoadingKey(key);  // muestra spinner pequeño en la fila por si la red está lenta

    try {
      await axios.post(`${API}/odoo-enriq/color-mapping`, {
        template_id: templateId,
        color_odoo_original: colorOdoo,
        color_id: color.id,
        product_ids: productIds,
      });
      // 3) Reload del padre con debounce: agrupa mapeos consecutivos.
      scheduleParentReload();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Error al mapear color');
      // Rollback: re-fetch del detalle del modelo para restaurar el estado real.
      delete detailById[templateId];
      setDetailById({ ...detailById });
      cargarDetalleModelo(templateId);
    } finally {
      // Limpia el spinner solo si seguimos en esta key (otra request podría haberlo cambiado).
      setLoadingKey(k => (k === key ? null : k));
    }
  };

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 dark:bg-orange-950/15 dark:border-orange-900 p-3">
      <div className="flex items-start gap-1.5 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
            PT sin clasificar en Odoo — {grupos.length} {grupos.length === 1 ? 'modelo' : 'modelos'} · {items.length} {items.length === 1 ? 'color' : 'colores'} pendientes
          </p>
          <p className="text-[10px] font-normal text-orange-600 dark:text-orange-500">
            click en un modelo para ver TODOS sus colores (mapeados + pendientes)
          </p>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded p-1.5 mb-2">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted/95">
            <tr>
              <th className="text-left p-2 border-b font-medium">Modelo</th>
              <th className="text-center p-2 border-b font-medium">Pendientes</th>
              <th className="text-right p-2 border-b font-medium">Stock</th>
              <th className="text-center p-2 border-b font-medium w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => {
              const isExpanded = expandedId === g.template_id;
              const detalle = detailById[g.template_id];
              const isLoadingDetalle = detailLoading === g.template_id;
              return (
                <Fragment key={g.template_id}>
                  <tr
                    className={`border-b cursor-pointer hover:bg-muted/30 ${isExpanded ? 'bg-muted/30' : ''}`}
                    onClick={() => toggleExpand(g.template_id)}
                    data-testid={`pt-modelo-${g.template_id}`}
                  >
                    <td className="p-2 font-semibold flex items-center gap-1.5">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      {g.template_name}
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {g.colores.length}
                      </Badge>
                    </td>
                    <td className={`p-2 text-right font-mono ${g.stock_total > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {g.stock_total}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">
                      {isLoadingDetalle && <Loader2 className="h-3 w-3 animate-spin" />}
                    </td>
                  </tr>

                  {/* Detalle expandido: TODOS los colores del modelo */}
                  {isExpanded && detalle && (
                    <tr className="border-b bg-muted/10">
                      <td colSpan={4} className="p-2">
                        <div className="rounded border bg-background overflow-hidden">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="text-left p-1.5 border-b font-medium">Color Odoo</th>
                                <th className="text-right p-1.5 border-b font-medium">Stock</th>
                                <th className="text-right p-1.5 border-b font-medium">Vendidas</th>
                                <th className="text-center p-1.5 border-b font-medium w-[100px]">Estado</th>
                                <th className="text-center p-1.5 border-b font-medium w-[100px]">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detalle.colores || [])
                                .filter(cgroup => (cgroup.stock_total || 0) > 0)
                                .map((cgroup) => {
                                const allMapped = (cgroup.product_ids || []).every(p => p.mapeo);
                                const noneMapped = (cgroup.product_ids || []).every(p => !p.mapeo);
                                const productIds = (cgroup.product_ids || []).map(p => p.product_id);
                                const key = `${g.template_id}-${cgroup.color_odoo}`;
                                const isLoading = loadingKey === key;
                                return (
                                  <tr key={cgroup.color_odoo} className="border-b last:border-b-0 hover:bg-muted/30">
                                    <td className="p-1.5 font-mono text-[11px]">{cgroup.color_odoo}</td>
                                    <td className="p-1.5 text-right font-mono">
                                      {Math.round(cgroup.stock_total || 0)}
                                    </td>
                                    <td className="p-1.5 text-right font-mono text-muted-foreground">
                                      {Math.round(cgroup.unidades_vendidas || 0)}
                                    </td>
                                    <td className="p-1.5 text-center">
                                      {allMapped ? (
                                        <Badge className="text-[9px] px-1.5 bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">
                                          <Check className="h-2.5 w-2.5 mr-0.5" />
                                          Mapeado
                                        </Badge>
                                      ) : noneMapped ? (
                                        <Badge variant="outline" className="text-[9px] px-1.5 border-orange-300 text-orange-700">
                                          Pendiente
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[9px] px-1.5 border-amber-300 text-amber-700">
                                          Parcial
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="p-1.5 text-center">
                                      {!allMapped && (
                                        <Popover
                                          open={openKey === key}
                                          onOpenChange={(o) => {
                                            if (!o) { setOpenKey(null); setSearch(''); }
                                            else { setOpenKey(key); setSearch(''); }
                                          }}
                                        >
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 text-[10px] px-2 gap-1"
                                              disabled={isLoading}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {isLoading ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <Palette className="h-3 w-3" />
                                              )}
                                              Asignar
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-72 p-2" align="end" onClick={(e) => e.stopPropagation()}>
                                            <p className="text-[10px] text-muted-foreground mb-1.5">
                                              Mapear <span className="font-mono">"{cgroup.color_odoo}"</span> a:
                                            </p>
                                            <input
                                              type="text"
                                              value={search}
                                              onChange={(e) => setSearch(e.target.value)}
                                              placeholder="Buscar color del catálogo..."
                                              className="w-full text-xs px-2 py-1 mb-2 border border-input rounded bg-background"
                                              autoFocus
                                            />
                                            <div className="max-h-[220px] overflow-auto flex flex-col gap-0.5">
                                              {filteredColores.length === 0 && (
                                                <p className="text-[11px] text-muted-foreground italic p-2">Sin resultados</p>
                                              )}
                                              {filteredColores.slice(0, 60).map((c) => (
                                                <button
                                                  key={c.id}
                                                  onClick={() => handleMap(g.template_id, cgroup.color_odoo, productIds, c)}
                                                  className="text-left text-[11px] px-2 py-1 rounded hover:bg-muted hover:text-primary transition-colors"
                                                >
                                                  {formatColorName(c.nombre)}
                                                </button>
                                              ))}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
