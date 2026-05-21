import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ExternalLink, FlaskConical, Layers, Loader2, Palette, Send, AlertCircle, Star } from 'lucide-react';
import { formatColorName } from '../lib/utils';
import { AsignarColoresModal } from './AsignarColoresModal';
import { MapeoOdooSection } from './MapeoOdooSection';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Tabla color/corte × talla ──────────────────────────────────────────────
const TallaTable = ({ title, subtitle, items, tallas, emptyMsg, rowLabel = 'color', onRowClick, headerLabel, renderRowAction }) => {
  const grandTotals = {};
  tallas.forEach(t => {
    grandTotals[t] = items.reduce((s, row) => s + (row.tallas?.[t] || 0), 0);
  });
  const grandTotal = Object.values(grandTotals).reduce((a, b) => a + b, 0);
  const colHeader = headerLabel ?? (rowLabel === 'corte' ? 'Modelo · Corte' : 'Color');

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyMsg}</p>
      ) : (
        <div className="overflow-auto rounded-md border max-h-[300px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
              <tr>
                <th className="text-left p-1.5 border-b font-medium min-w-[160px]">{colHeader}</th>
                {tallas.map(t => (
                  <th key={t} className="text-center p-1.5 border-b font-medium min-w-[40px]">{t}</th>
                ))}
                <th className="text-center p-1.5 border-b font-semibold min-w-[50px]">Tot.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const rowTotal = tallas.reduce((s, t) => s + (row.tallas?.[t] || 0), 0);
                const clickable = onRowClick && row.id;
                return (
                  <tr
                    key={row.id || i}
                    className={`border-b ${clickable ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-muted/20'}`}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    data-testid={clickable ? `taller-row-${row.id}` : undefined}
                  >
                    <td className="p-1.5 truncate max-w-[240px]" title={row.label}>
                      <div className="flex items-center justify-between gap-1.5">
                        {clickable ? (
                          <span className="inline-flex items-center gap-1.5 group min-w-0">
                            <Palette
                              className={`h-3 w-3 shrink-0 group-hover:opacity-100 ${
                                row.colores_completos
                                  ? 'text-primary opacity-80'
                                  : 'text-muted-foreground/60 opacity-70'
                              }`}
                              aria-label={row.colores_completos ? 'Colores completos' : 'Colores pendientes'}
                            />
                            <span className="font-medium truncate">{row.label}</span>
                          </span>
                        ) : (
                          <span className="truncate">{row.label}</span>
                        )}
                        {renderRowAction && row.id && (
                          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                            {renderRowAction(row)}
                          </span>
                        )}
                      </div>
                    </td>
                    {tallas.map(t => {
                      const v = row.tallas?.[t] || 0;
                      return (
                        <td key={t} className={`text-center p-1.5 font-mono ${v ? '' : 'text-muted-foreground/30'}`}>
                          {v || '-'}
                        </td>
                      );
                    })}
                    <td className="text-center p-1.5 font-mono font-semibold">{rowTotal || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 1 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold border-t-2">
                  <td className="p-1.5">TOTAL</td>
                  {tallas.map(t => (
                    <td key={t} className="text-center p-1.5 font-mono">
                      {grandTotals[t] || '-'}
                    </td>
                  ))}
                  <td className="text-center p-1.5 font-mono">{grandTotal || '-'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

// ── Merge colores lavandería + almacén ────────────────────────────────────
// Acepta items con `label` o `color`. Preserva el flag `es_estrella` si
// alguna de las entradas para ese color lo tiene en true.
function mergeColores(a, b) {
  const m = {};
  const stars = new Set();
  [...a, ...b].forEach((item) => {
    const key = item.label ?? item.color ?? '';
    if (!key) return;
    if (!m[key]) m[key] = {};
    Object.entries(item.tallas || {}).forEach(([t, q]) => {
      m[key][t] = (m[key][t] || 0) + q;
    });
    if (item.es_estrella) stars.add(key);
  });
  return Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, tallas]) => ({ label, tallas, es_estrella: stars.has(label) }));
}

// Preferencia para ocultar/mostrar modelos -LQ en la matriz de Almacén PT/Tienda.
// Persiste en localStorage entre sesiones. Default = ocultos.
const LQ_STORAGE_KEY = 'fichaItem.ocultarLQ';

// ── Componente principal ──────────────────────────────────────────────────
export const FichaItemModal = ({ open, onClose, fila }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sumarLav, setSumarLav] = useState(false);
  const [ocultarLQ, setOcultarLQ] = useState(() => {
    try {
      const v = localStorage.getItem(LQ_STORAGE_KEY);
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  // Persiste la preferencia
  useEffect(() => {
    try { localStorage.setItem(LQ_STORAGE_KEY, String(ocultarLQ)); } catch {}
  }, [ocultarLQ]);

  useEffect(() => {
    if (!open || !fila) return;
    const ids = (fila.detalle || []).map(d => d.id).filter(Boolean);
    if (!ids.length) return;

    setLoading(true);
    setData(null);
    setSumarLav(false);
    axios.get(`${API}/reportes-produccion/ficha-item`, {
      params: { ids: ids.join(','), ocultar_liquidacion: ocultarLQ },
    })
      .then(r => setData(r.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [open, fila, ocultarLQ]);

  const tallas = data?.tallas || [];

  const tallerRows = (data?.grupos_taller || []).map(g => ({
    id: g.id,
    label: `${g.modelo || '—'} · ${g.n_corte}`,
    n_corte: g.n_corte,
    modelo: g.modelo,
    tallas: g.tallas,
    // True si la distribución de colores cubre 100% de cada talla.
    // Lo usa el ícono Palette: azul cuando está completo, gris cuando falta asignar.
    colores_completos: !!g.colores_completos,
    muestras_count: (data?.muestras || []).filter(m => m.registro_id === g.id).length,
  }));

  // Recarga datos del backend (tras guardar colores)
  const reload = useCallback(() => {
    if (!fila) return;
    const ids = (fila.detalle || []).map(d => d.id).filter(Boolean);
    if (!ids.length) return;
    axios.get(`${API}/reportes-produccion/ficha-item`, {
      params: { ids: ids.join(','), ocultar_liquidacion: ocultarLQ },
    })
      .then(r => setData(r.data))
      .catch(err => console.error(err));
  }, [fila, ocultarLQ]);

  const [asignarOpen, setAsignarOpen] = useState(false);
  const [asignarRegistroId, setAsignarRegistroId] = useState(null);
  const [abrirEnMuestras, setAbrirEnMuestras] = useState(false);
  const abrirAsignar = (row) => {
    setAbrirEnMuestras(false);
    setAsignarRegistroId(row.id);
    setAsignarOpen(true);
  };
  const abrirMuestrasDirecto = (registroId) => {
    setAbrirEnMuestras(true);
    setAsignarRegistroId(registroId);
    setAsignarOpen(true);
  };

  const lavRows = (data?.colores_lavanderia || []).map(c => ({ label: formatColorName(c.color), tallas: c.tallas }));

  const almacenBase = (data?.colores_almacen || []).map(c => ({
    label: formatColorName(c.color),
    tallas: c.tallas,
    es_estrella: !!c.es_estrella,
  }));
  const almacenRows = sumarLav
    ? mergeColores(
        almacenBase,
        (data?.colores_lavanderia || []).map(c => ({ color: formatColorName(c.color), tallas: c.tallas })),
      )
    : almacenBase;

  // DEBUG temporal — quitar después de validar discrepancia 1600 vs 2843
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const totalAlm = (data.colores_almacen || []).reduce(
      (s, c) => s + Object.values(c.tallas || {}).reduce((a, b) => a + b, 0), 0);
    const totalLav = (data.colores_lavanderia || []).reduce(
      (s, c) => s + Object.values(c.tallas || {}).reduce((a, b) => a + b, 0), 0);
    const totalSin = (data.odoo_sin_clasificar || []).reduce((s, r) => s + (r.stock_total || 0), 0);
    // eslint-disable-next-line no-console
    console.log('[FichaItemModal DEBUG]', {
      sumarLav,
      total_colores_almacen: totalAlm,
      total_colores_lavanderia: totalLav,
      total_pt_sin_clasificar: totalSin,
      total_visible_almacen_PT: sumarLav ? totalAlm + totalLav : totalAlm,
      items_almacen: (data.colores_almacen || []).length,
      items_lav: (data.colores_lavanderia || []).length,
      url_actual: window.location.href,
    });
  }, [data, sumarLav]);

  // Colores con stock pero fuera de la regla aplicable (informativo)
  const fueraReglaAlm = (data?.fuera_regla_almacen || [])
    .map(c => ({ label: formatColorName(c.color), tallas: c.tallas }))
    .filter(r => Object.values(r.tallas || {}).some(v => v > 0));
  const fueraReglaLav = (data?.fuera_regla_lavanderia || [])
    .map(c => ({ label: formatColorName(c.color), tallas: c.tallas }))
    .filter(r => Object.values(r.tallas || {}).some(v => v > 0));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[98vw] w-[98vw] max-h-[92vh] overflow-hidden p-0"
        data-testid="ficha-item-modal"
      >
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base">
            {fila?.item}
            {fila?.hilo && <span className="text-muted-foreground font-normal"> · {fila.hilo}</span>}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">Seguimiento de colores por etapa de producción</p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 h-48 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando ficha...
          </div>
        )}

        {!loading && data && (
          <div className="overflow-auto max-h-[calc(92vh-90px)] p-5">
            {/* ── 3 columnas: cada una con su tabla principal arriba y la
                  sección complementaria abajo (taller+muestras · lav+sin color
                  · almacén+PT sin clasificar). ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-[820px] items-start">
              {/* ─── COLUMNA 1: En taller + muestras en proceso ─── */}
              <div className="flex flex-col gap-4">
              <TallaTable
                title="En taller — lavandería / atraque"
                subtitle="Click en un corte para asignar colores y gestionar muestras"
                items={tallerRows}
                tallas={tallas}
                emptyMsg="Sin cortes en lavandería o atraque"
                rowLabel="corte"
                headerLabel="Modelo · Corte"
                onRowClick={abrirAsignar}
              />

              {/* Muestras en proceso (enviada o pendiente de decisión) */}
              {(() => {
                const enProceso = (data?.muestras || []).filter(m =>
                  m.estado === 'enviada' || m.estado === 'pendiente_decision'
                );
                return (
                  <div
                    className="rounded-lg border border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/15 p-3"
                    data-testid="muestras-en-proceso"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <FlaskConical className="h-4 w-4 text-sky-700 dark:text-sky-400" />
                      <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                        Muestras en proceso — {enProceso.length} {enProceso.length === 1 ? 'pendiente' : 'pendientes'}
                      </p>
                    </div>
                    <p className="text-[10px] font-normal text-sky-600 dark:text-sky-500 mb-2">
                      Enviadas o devueltas sin decisión. Click para abrir el corte y gestionarlas.
                    </p>
                    {enProceso.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Sin muestras pendientes. Las que se envíen aparecerán acá hasta aprobarlas o rechazarlas.
                      </p>
                    ) : (
                      <div className="overflow-auto max-h-[220px] rounded-md border bg-background">
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                            <tr>
                              <th className="text-left p-1.5 border-b font-medium">Corte</th>
                              <th className="text-left p-1.5 border-b font-medium">Modelo</th>
                              <th className="text-center p-1.5 border-b font-medium w-[40px]">Cant</th>
                              <th className="text-center p-1.5 border-b font-medium w-[60px]">Envío</th>
                              <th className="text-center p-1.5 border-b font-medium w-[90px]">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enProceso.map(m => {
                              const fechaEnvio = m.fecha_envio
                                ? (() => { const [y, mo, d] = m.fecha_envio.split('-'); return `${d}/${mo}/${y.slice(2)}`; })()
                                : '—';
                              const esEnviada = m.estado === 'enviada';
                              const StatusIcon = esEnviada ? Send : AlertCircle;
                              const statusClasses = esEnviada
                                ? 'bg-blue-100 text-blue-700 border-blue-300'
                                : 'bg-orange-100 text-orange-700 border-orange-300';
                              const statusLabel = esEnviada ? 'Enviada' : 'Pendiente';
                              return (
                                <tr
                                  key={m.id}
                                  className="border-b hover:bg-muted/30 cursor-pointer"
                                  onClick={() => abrirMuestrasDirecto(m.registro_id)}
                                  title="Abrir muestras del corte"
                                  data-testid={`muestra-proceso-${m.id}`}
                                >
                                  <td className="p-1.5 font-mono">{m.n_corte}</td>
                                  <td className="p-1.5 truncate max-w-[160px]" title={m.modelo || ''}>{m.modelo || '—'}</td>
                                  <td className="p-1.5 text-center font-mono">{m.cantidad_total}</td>
                                  <td className="p-1.5 text-center text-[10px]">{fechaEnvio}</td>
                                  <td className="p-1.5 text-center">
                                    <Badge variant="outline" className={`text-[9px] px-1 gap-0.5 ${statusClasses}`}>
                                      <StatusIcon className="h-2.5 w-2.5" />
                                      {statusLabel}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>

              {/* ─── COLUMNA 2: Colores en lavandería/acabado + Sin colores ─── */}
              <div className="flex flex-col gap-4">
              {/* 2. Colores en lavandería + acabado */}
              <div className="flex flex-col gap-1.5">
                <TallaTable
                  title="Colores en lavandería / acabado"
                  subtitle="Lavandería · Para Acabado · Acabado"
                  items={lavRows}
                  tallas={tallas}
                  emptyMsg="Sin colores asignados en estos estados"
                />
                {fueraReglaLav.length > 0 && (
                  <details className="rounded-md border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/15 px-2 py-1.5">
                    <summary className="text-[10px] font-medium text-amber-700 dark:text-amber-400 cursor-pointer">
                      {fueraReglaLav.length} {fueraReglaLav.length === 1 ? 'color' : 'colores'} fuera de la regla actual
                    </summary>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {fueraReglaLav.map((r, i) => {
                        const total = tallas.reduce((s, t) => s + (r.tallas?.[t] || 0), 0);
                        return (
                          <span key={i} className="text-[10px] bg-background border rounded px-1.5 py-0.5">
                            {r.label} <span className="text-muted-foreground font-mono">({total})</span>
                          </span>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>

                {/* Sin colores en lavandería / acabado — pareja de la tabla Colores en lav */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/15 dark:border-amber-900 p-3" data-testid="sin-color-section">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Sin colores en lavandería / acabado — {(data.sin_color || []).length} {((data.sin_color || []).length === 1) ? 'corte' : 'cortes'}
                  </p>
                  <p className="text-[10px] font-normal text-amber-600 dark:text-amber-500 mb-2">
                    Click "Asignar colores" para abrir la matriz talla × color
                  </p>
                  {(data.sin_color || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Todos los cortes en estos estados tienen colores asignados</p>
                  ) : (
                    <div className="overflow-auto max-h-[300px] rounded-md border bg-background">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                          <tr>
                            <th className="text-left p-2 border-b font-medium">Modelo</th>
                            <th className="text-left p-2 border-b font-medium">Corte</th>
                            <th className="text-left p-2 border-b font-medium">Estado</th>
                            <th className="text-right p-2 border-b font-medium">Prn</th>
                            <th className="text-center p-2 border-b font-medium w-[110px]">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sin_color.map(sc => (
                            <tr
                              key={sc.id}
                              className="border-b hover:bg-muted/30 cursor-pointer"
                              onClick={() => abrirAsignar({ id: sc.id })}
                              data-testid={`sin-color-${sc.id}`}
                            >
                              <td className="p-2 font-medium">{sc.modelo || '—'}</td>
                              <td className="p-2 font-mono">{sc.n_corte}</td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-[9px] px-1">{sc.estado}</Badge>
                              </td>
                              <td className="p-2 text-right font-mono">{sc.prendas}</td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] px-1.5 gap-1"
                                    onClick={(e) => { e.stopPropagation(); abrirAsignar({ id: sc.id }); }}
                                    title="Abrir matriz talla × color"
                                  >
                                    <Palette className="h-3 w-3" />
                                    Asignar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => { e.stopPropagation(); onClose(); navigate(`/registros/editar/${sc.id}`); }}
                                    title="Abrir registro completo"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Con colores en lavandería / acabado — espejo compacto de la tabla anterior */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/15 dark:border-emerald-900 p-3" data-testid="con-color-section">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Con colores en lavandería / acabado — {(data.con_color || []).length} {((data.con_color || []).length === 1) ? 'corte' : 'cortes'}
                  </p>
                  <p className="text-[10px] font-normal text-emerald-600 dark:text-emerald-500 mb-2">
                    Click en una fila para revisar o editar los colores asignados
                  </p>
                  {(data.con_color || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Ningún corte en estos estados tiene colores asignados todavía</p>
                  ) : (
                    <div className="overflow-auto max-h-[300px] rounded-md border bg-background">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                          <tr>
                            <th className="text-left p-2 border-b font-medium">Modelo</th>
                            <th className="text-left p-2 border-b font-medium">Corte</th>
                            <th className="text-left p-2 border-b font-medium">Estado</th>
                            <th className="text-right p-2 border-b font-medium">Prn</th>
                            <th className="text-center p-2 border-b font-medium w-[110px]">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.con_color.map(cc => {
                            const resumen = (cc.colores || [])
                              .map(c => `${c.color}: ${c.cantidad}`)
                              .join('\n');
                            return (
                              <tr
                                key={cc.id}
                                className="border-b hover:bg-muted/30 cursor-pointer"
                                onClick={() => abrirAsignar({ id: cc.id })}
                                title={resumen || 'Sin colores asignados'}
                                data-testid={`con-color-${cc.id}`}
                              >
                                <td className="p-2 font-medium">{cc.modelo || '—'}</td>
                                <td className="p-2 font-mono">{cc.n_corte}</td>
                                <td className="p-2">
                                  <Badge variant="outline" className="text-[9px] px-1">{cc.estado}</Badge>
                                </td>
                                <td className="p-2 text-right font-mono">{cc.prendas}</td>
                                <td className="p-2 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] px-1.5 gap-1"
                                      onClick={(e) => { e.stopPropagation(); abrirAsignar({ id: cc.id }); }}
                                      title="Abrir matriz talla × color"
                                    >
                                      <Palette className="h-3 w-3" />
                                      Editar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => { e.stopPropagation(); onClose(); navigate(`/registros/editar/${cc.id}`); }}
                                      title="Abrir registro completo"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── COLUMNA 3: Almacén PT/Tienda + PT sin clasificar ─── */}
              <div className="flex flex-col gap-4">
              {/* 3. Almacén PT + Tienda */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Almacén PT / Tienda</h3>
                    <p className="text-[10px] text-muted-foreground">PT (registros) + stock real de tienda desde Odoo</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                        ocultarLQ
                          ? 'bg-amber-500/90 text-white border-amber-500'
                          : 'hover:bg-muted border-border'
                      }`}
                      onClick={() => setOcultarLQ(p => !p)}
                      title={ocultarLQ
                        ? 'Liquidaciones (-LQ) ocultas. Click para incluirlas.'
                        : 'Liquidaciones (-LQ) visibles. Click para ocultarlas.'}
                      data-testid="toggle-lq"
                    >
                      {ocultarLQ ? 'Sin -LQ' : 'Con -LQ'}
                    </button>
                    <button
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                        sumarLav
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'hover:bg-muted border-border'
                      }`}
                      onClick={() => setSumarLav(p => !p)}
                      title="Suma las prendas en lavandería al cuadro de almacén"
                    >
                      <Layers className="h-3 w-3" />
                      + Lavandería
                    </button>
                  </div>
                </div>
                {almacenRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sin stock en almacén o tienda</p>
                ) : (
                  <div className="overflow-auto rounded-md border max-h-[300px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                        <tr>
                          <th className="text-left p-1.5 border-b font-medium min-w-[120px]">Color</th>
                          {tallas.map(t => (
                            <th key={t} className="text-center p-1.5 border-b font-medium min-w-[40px]">{t}</th>
                          ))}
                          <th className="text-center p-1.5 border-b font-semibold min-w-[50px]">Tot.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {almacenRows.map((row, i) => {
                          const rowTotal = tallas.reduce((s, t) => s + (row.tallas?.[t] || 0), 0);
                          const isStar = !!row.es_estrella;
                          return (
                            <tr
                              key={i}
                              className={`border-b ${
                                isStar
                                  ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                                  : 'hover:bg-muted/20'
                              }`}
                              title={isStar ? 'Color estrella — debe tener stock siempre' : undefined}
                            >
                              <td className="p-1.5">
                                <div className="flex items-center gap-1">
                                  {isStar && (
                                    <Star className="h-3 w-3 shrink-0 text-amber-500 fill-amber-400" />
                                  )}
                                  <span className={isStar ? 'font-medium text-amber-900 dark:text-amber-300' : ''}>
                                    {row.label}
                                  </span>
                                </div>
                              </td>
                              {tallas.map(t => {
                                const v = row.tallas?.[t] || 0;
                                return (
                                  <td key={t} className={`text-center p-1.5 font-mono ${v ? '' : 'text-muted-foreground/30'}`}>
                                    {v || '-'}
                                  </td>
                                );
                              })}
                              <td className="text-center p-1.5 font-mono font-semibold">{rowTotal || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {almacenRows.length > 1 && (
                        <tfoot>
                          <tr className="bg-muted/50 font-semibold border-t-2">
                            <td className="p-1.5">TOTAL</td>
                            {tallas.map(t => {
                              const colTotal = almacenRows.reduce((s, r) => s + (r.tallas?.[t] || 0), 0);
                              return <td key={t} className="text-center p-1.5 font-mono">{colTotal || '-'}</td>;
                            })}
                            <td className="text-center p-1.5 font-mono">
                              {almacenRows.reduce((s, r) => s + tallas.reduce((ss, t) => ss + (r.tallas?.[t] || 0), 0), 0) || '-'}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {/* Colores fuera de regla — informativo */}
                {fueraReglaAlm.length > 0 && (
                  <details className="mt-2 rounded-md border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/15 px-2 py-1.5">
                    <summary className="text-[10px] font-medium text-amber-700 dark:text-amber-400 cursor-pointer">
                      {fueraReglaAlm.length} {fueraReglaAlm.length === 1 ? 'color' : 'colores'} con stock fuera de la regla actual
                    </summary>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {fueraReglaAlm.map((r, i) => {
                        const total = tallas.reduce((s, t) => s + (r.tallas?.[t] || 0), 0);
                        return (
                          <span
                            key={i}
                            className="text-[10px] bg-background border rounded px-1.5 py-0.5"
                            title={`Stock: ${total}`}
                          >
                            {r.label} <span className="text-muted-foreground font-mono">({total})</span>
                          </span>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>

                {/* PT sin clasificar en Odoo — pareja de Almacén PT/Tienda */}
                <MapeoOdooSection
                  items={data.odoo_sin_clasificar || []}
                  scope={data.scope || {}}
                  onMapped={reload}
                />
              </div>
            </div>
          </div>
        )}

        {!loading && !data && open && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Sin datos para mostrar
          </div>
        )}
      </DialogContent>

      <AsignarColoresModal
        open={asignarOpen}
        registroId={asignarRegistroId}
        onClose={() => { setAsignarOpen(false); setAbrirEnMuestras(false); }}
        onSaved={reload}
        otrosCortes={[
          ...(data?.grupos_taller || []),
          ...(data?.sin_color || []),
        ]
          .filter(c => c.id && c.id !== asignarRegistroId)
          .map(c => ({
            id: c.id,
            n_corte: c.n_corte,
            modelo: c.modelo,
            estado: c.estado,
          }))}
        muestras={(data?.muestras || []).filter(m => m.registro_id === asignarRegistroId)}
        scope={data?.scope}
        onMuestrasChanged={reload}
        openMuestrasOnMount={abrirEnMuestras}
      />
    </Dialog>
  );
};
