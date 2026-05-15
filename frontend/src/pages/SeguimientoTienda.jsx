import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Store, RefreshCw, Search, ChevronDown, AlertTriangle, Loader2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/odoo-tienda`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtDM = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [, m, dd] = s.split('-');
  return `${dd}/${m}`;
};

// Color de estado del corte
const estadoColor = (estado) => {
  if (!estado) return 'bg-zinc-100 text-zinc-700';
  if (estado === 'Tienda') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (estado === 'Almacén PT') return 'bg-blue-100 text-blue-800 border border-blue-200';
  return 'bg-zinc-100 text-zinc-700 border border-zinc-200';
};

const SeguimientoTienda = () => {
  const [params, setParams] = useSearchParams();
  const corteInicial = params.get('corte');

  const [cortes, setCortes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busq, setBusq] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos'); // todos | tienda | sin_tienda
  const [expanded, setExpanded] = useState(() => corteInicial ? new Set([corteInicial]) : new Set());
  const [detalle, setDetalle] = useState({}); // { registroId: tienda-info }
  const [loadingDetalle, setLoadingDetalle] = useState({});

  const fetchCortes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/seguimiento`, { headers: hdrs() });
      setCortes(res.data || []);
    } catch {
      toast.error('No se pudo cargar el seguimiento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCortes(); }, [fetchCortes]);

  // Si vinimos con ?corte=ID, cargamos su detalle automáticamente
  useEffect(() => {
    if (corteInicial && !detalle[corteInicial] && !loadingDetalle[corteInicial]) {
      fetchDetalle(corteInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corteInicial]);

  const fetchDetalle = async (registroId) => {
    setLoadingDetalle(p => ({ ...p, [registroId]: true }));
    try {
      const res = await axios.get(`${API}/registros/${registroId}/tienda-info`, { headers: hdrs() });
      setDetalle(p => ({ ...p, [registroId]: res.data }));
    } catch {
      toast.error('No se pudo cargar el detalle');
    } finally {
      setLoadingDetalle(p => ({ ...p, [registroId]: false }));
    }
  };

  const toggleExpand = (registroId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(registroId)) {
        next.delete(registroId);
      } else {
        next.add(registroId);
        if (!detalle[registroId]) fetchDetalle(registroId);
      }
      return next;
    });
  };

  const [lastSyncResult, setLastSyncResult] = useState(null);

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/sincronizar-estados`, {}, { headers: hdrs() });
      const data = res.data || {};
      const n = data.actualizados ?? 0;
      const resumen = data.resumen || {};
      setLastSyncResult({
        at: new Date(),
        total: n,
        nuevos: resumen.nuevo || 0,
        actualizados: resumen.actualizado || 0,
        soloEstado: resumen.estado_solo_fecha_manual || 0,
        detalle: data.detalle || [],
      });
      if (n > 0) {
        const partes = [];
        if (resumen.nuevo) partes.push(`${resumen.nuevo} nuevo${resumen.nuevo !== 1 ? 's' : ''}`);
        if (resumen.actualizado) partes.push(`${resumen.actualizado} re-detectado${resumen.actualizado !== 1 ? 's' : ''}`);
        if (resumen.estado_solo_fecha_manual) partes.push(`${resumen.estado_solo_fecha_manual} con fecha manual respetada`);
        toast.success(
          `${n} corte${n !== 1 ? 's' : ''} sincronizado${n !== 1 ? 's' : ''}`,
          { description: partes.join(' · ') || 'Detectados desde Odoo' },
        );
        await fetchCortes();
      } else {
        toast.info('Sin cambios', {
          description: 'No se detectaron nuevos movimientos a tienda comercial',
        });
      }
    } catch {
      toast.error('Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  // Filtrado en cliente
  const visibles = useMemo(() => {
    let arr = cortes;
    if (filtroEstado === 'tienda') {
      arr = arr.filter(c => (c.tiendas || []).length > 0);
    } else if (filtroEstado === 'sin_tienda') {
      arr = arr.filter(c => (c.tiendas || []).length === 0);
    }
    const q = busq.trim().toLowerCase();
    if (q) {
      arr = arr.filter(c =>
        (c.n_corte || '').toLowerCase().includes(q)
        || (c.modelo || '').toLowerCase().includes(q)
        || (c.producto_nombre || '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [cortes, busq, filtroEstado]);

  const totalEnTienda = cortes.filter(c => (c.tiendas || []).length > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <nav className="text-xs text-muted-foreground mb-1">Reportes</nav>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6 text-blue-600" />
            Seguimiento Tienda
          </h1>
          <p className="text-sm text-muted-foreground">
            Cortes con distribución a producto Odoo (normal) · movimientos a tiendas, stock y ventas en vivo
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastSyncResult && (
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Última sync: {lastSyncResult.at.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              {lastSyncResult.total > 0 ? ` · ${lastSyncResult.total} cambios` : ' · sin cambios'}
            </span>
          )}
          <Button onClick={sincronizar} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar estados
          </Button>
        </div>
      </div>

      {/* Banner de último sync con detalle */}
      {lastSyncResult && lastSyncResult.total > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 flex items-start gap-3 text-xs">
          <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
            <RefreshCw className="h-3 w-3" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-blue-900 dark:text-blue-200">
              Sincronización completada · {lastSyncResult.total} corte{lastSyncResult.total !== 1 ? 's' : ''}
            </p>
            <p className="text-blue-700 dark:text-blue-300 mt-0.5 flex flex-wrap gap-2">
              {lastSyncResult.nuevos > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {lastSyncResult.nuevos} nuevo{lastSyncResult.nuevos !== 1 ? 's' : ''} (fecha NULL → auto)
                </span>
              )}
              {lastSyncResult.actualizados > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {lastSyncResult.actualizados} re-detectado{lastSyncResult.actualizados !== 1 ? 's' : ''} (template cambió)
                </span>
              )}
              {lastSyncResult.soloEstado > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  {lastSyncResult.soloEstado} con fecha manual respetada
                </span>
              )}
            </p>
          </div>
          <button onClick={() => setLastSyncResult(null)} className="text-blue-600 hover:text-blue-800 text-[11px] underline shrink-0">
            cerrar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Cortes con distribución</p>
          <p className="text-2xl mt-1 tabular-nums leading-none">{cortes.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">distribución normal a Odoo</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">En tienda</p>
          <p className="text-2xl text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums leading-none">{totalEnTienda}</p>
          <p className="text-[11px] text-muted-foreground mt-1">con movimientos detectados</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Sin movimientos</p>
          <p className="text-2xl text-amber-700 dark:text-amber-400 mt-1 tabular-nums leading-none">
            {cortes.length - totalEnTienda}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">aún no llegan a tienda</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Tiendas configuradas</p>
          <p className="text-2xl mt-1 tabular-nums leading-none">8</p>
          <p className="text-[11px] text-muted-foreground mt-1">GM/GR/BOOSH/AZUL/ZAP</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="h-9 pl-8 w-[260px]"
            placeholder="Buscar corte, modelo o producto..."
            value={busq}
            onChange={(e) => setBusq(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
          {[
            { v: 'todos', l: 'Todos' },
            { v: 'tienda', l: `En tienda (${totalEnTienda})` },
            { v: 'sin_tienda', l: `Sin movs (${cortes.length - totalEnTienda})` },
          ].map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setFiltroEstado(opt.v)}
              className={`px-3 py-1.5 rounded transition-colors ${
                filtroEstado === opt.v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Cargando...
          </CardContent>
        </Card>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">
              {cortes.length === 0
                ? 'Sin cortes con distribución normal a Odoo todavía'
                : 'Ningún corte coincide con los filtros'}
            </p>
            {cortes.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Distribuye un corte al tab "PT Odoo" con tipo "Normal" para verlo aquí.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[36px_100px_minmax(160px,1.4fr)_minmax(120px,1fr)_110px_100px_minmax(180px,1.5fr)_40px] gap-3 items-center px-3 py-2 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            <span></span>
            <span>N° Corte</span>
            <span>Modelo Odoo</span>
            <span>Estado</span>
            <span>Tienda desde</span>
            <span className="text-right">Stock</span>
            <span>Tiendas activas</span>
            <span></span>
          </div>
          <div className="divide-y">
            {visibles.map((c) => {
              const isOpen = expanded.has(c.id);
              const d = detalle[c.id];
              const loading_d = loadingDetalle[c.id];
              const tiendaDesde = (c.tiendas || []).length > 0
                ? c.tiendas.reduce((min, t) => (!min || t.fecha_primer_ingreso < min ? t.fecha_primer_ingreso : min), null)
                : null;
              const stockTotal = (c.tiendas || []).reduce((a, t) => a + (t.stock_actual || 0), 0);

              return (
                <React.Fragment key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(c.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(c.id); } }}
                    className="grid grid-cols-[36px_100px_minmax(160px,1.4fr)_minmax(120px,1fr)_110px_100px_minmax(180px,1.5fr)_40px] gap-3 items-center px-3 py-2 hover:bg-muted/30 transition-colors text-left text-sm cursor-pointer"
                  >
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    <span className="font-mono tabular-nums">{c.n_corte}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.producto_nombre || c.modelo || '—'}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {c.template_id ? `#${c.template_id}` : '—'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded justify-self-start ${estadoColor(c.estado)}`}>
                      {c.estado || '—'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtDM(tiendaDesde)}</span>
                      {c.fecha_envio_tienda && (
                        c.fecha_envio_tienda_auto ? (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            title="Fecha detectada automáticamente desde Odoo. Si cambias el template el sistema la re-detecta."
                          >⚡</span>
                        ) : (
                          <span
                            className="text-[9px] px-1 py-0.5 rounded bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            title="Fecha registrada manualmente. El sync no la sobrescribe."
                          >✏️</span>
                        )
                      )}
                    </div>
                    <span className="text-right tabular-nums">
                      {stockTotal}
                      <span className="text-[10px] text-muted-foreground ml-1">pzs</span>
                    </span>
                    <div className="min-w-0 flex items-center gap-1 flex-wrap">
                      {(c.tiendas || []).slice(0, 4).map(t => (
                        <span
                          key={t.tienda}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 inline-flex items-center gap-0.5"
                        >
                          <Store className="h-2.5 w-2.5" />
                          {t.tienda}
                        </span>
                      ))}
                      {(c.tiendas || []).length > 4 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{c.tiendas.length - 4}
                        </span>
                      )}
                      {(c.tiendas || []).length === 0 && (
                        <span className="text-[11px] text-muted-foreground italic">sin movimientos</span>
                      )}
                    </div>
                    <a
                      href={`/registros/editar/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
                      title="Ir al corte"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {isOpen && (
                    <div className="bg-muted/20 px-3 py-3 border-t space-y-2">
                      {loading_d ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Cargando detalle...
                        </p>
                      ) : !d ? (
                        <p className="text-xs text-muted-foreground">Sin información</p>
                      ) : !d.vinculado ? (
                        <p className="text-xs text-muted-foreground">Sin distribución normal a Odoo</p>
                      ) : (d.tiendas || []).length === 0 ? (
                        <>
                          {d.producto_principal && (
                            <div className="text-[11px] text-muted-foreground">
                              Producto principal:{' '}
                              <span className="font-medium text-foreground">{d.producto_principal.name}</span>
                              {' '}<span className="font-mono">#{d.producto_principal.template_id}</span>
                              {' · '}{d.producto_principal.cantidad_distribuida} pzs distribuidas
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2">
                            <AlertTriangle className="h-4 w-4 inline-block text-amber-600 mr-1" />
                            Aún no hay movimientos a tienda registrados en Odoo para este producto.
                          </div>
                        </>
                      ) : (
                        <>
                          {d.producto_principal && (
                            <div className="text-[11px] text-muted-foreground">
                              Producto principal:{' '}
                              <span className="font-medium text-foreground">{d.producto_principal.name}</span>
                              {' '}<span className="font-mono">#{d.producto_principal.template_id}</span>
                              {' · '}{d.producto_principal.cantidad_distribuida} pzs distribuidas
                              {(d.template_ids || []).length > 1 && (
                                <> · <span className="text-blue-700 dark:text-blue-300">{d.template_ids.length} templates en total</span></>
                              )}
                            </div>
                          )}
                        <div className="rounded-md border bg-card overflow-hidden">
                          <div className="px-3 py-1.5 border-b bg-muted/30 grid grid-cols-[1.4fr_80px_80px_80px_60px] gap-2 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                            <span>Tienda</span>
                            <span className="text-right">Recibido</span>
                            <span className="text-right">Stock hoy</span>
                            <span className="text-right">Vendido</span>
                            <span className="text-right">Envíos</span>
                          </div>
                          <div className="divide-y divide-border/50">
                            {d.tiendas.map(t => (
                              <div
                                key={t.tienda}
                                className="grid grid-cols-[1.4fr_80px_80px_80px_60px] gap-2 items-center px-3 py-1.5 text-xs hover:bg-muted/20"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Store className="h-3 w-3 text-blue-600 shrink-0" />
                                  <span className="font-medium truncate">{t.tienda}</span>
                                  <span className="text-muted-foreground text-[10px] shrink-0">
                                    desde {fmtDM(t.fecha_primer_ingreso)}
                                  </span>
                                </div>
                                <div className="text-right tabular-nums">{t.total_ingresado}</div>
                                <div className={`text-right tabular-nums ${
                                  t.stock_actual === 0 ? 'text-red-600 font-semibold'
                                  : t.stock_actual <= 5 ? 'text-amber-600 font-semibold'
                                  : ''
                                }`}>
                                  {t.stock_actual}
                                </div>
                                <div className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {t.ventas_desde_ingreso}
                                </div>
                                <div className="text-right tabular-nums text-muted-foreground">{t.n_movs}</div>
                              </div>
                            ))}
                          </div>
                          <div className="px-3 py-1 border-t bg-muted/15 grid grid-cols-[1.4fr_80px_80px_80px_60px] gap-2 text-[10px] font-semibold">
                            <span>Totales</span>
                            <span className="text-right tabular-nums">
                              {d.tiendas.reduce((a, t) => a + t.total_ingresado, 0)}
                            </span>
                            <span className="text-right tabular-nums">{d.stock_total}</span>
                            <span className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                              {d.ventas_total}
                            </span>
                            <span className="text-right tabular-nums text-muted-foreground">
                              {d.tiendas.reduce((a, t) => a + t.n_movs, 0)}
                            </span>
                          </div>
                        </div>
                        </>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SeguimientoTienda;
