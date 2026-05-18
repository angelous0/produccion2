import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ExternalLink, Layers, Loader2, Palette } from 'lucide-react';
import { formatColorName } from '../lib/utils';
import { AsignarColoresModal } from './AsignarColoresModal';
import { MapeoOdooSection } from './MapeoOdooSection';
import { MuestrasLavanderiaSection } from './MuestrasLavanderiaSection';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Tabla color/corte × talla ──────────────────────────────────────────────
const TallaTable = ({ title, subtitle, items, tallas, emptyMsg, rowLabel = 'color', onRowClick, headerLabel }) => {
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
                    <td className="p-1.5 truncate max-w-[200px]" title={row.label}>
                      {clickable ? (
                        <span className="inline-flex items-center gap-1.5 group">
                          <Palette className="h-3 w-3 text-primary opacity-60 group-hover:opacity-100" />
                          <span className="font-medium">{row.label}</span>
                        </span>
                      ) : (
                        row.label
                      )}
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
// Acepta items con `label` o `color` (igualan al nombre del color).
function mergeColores(a, b) {
  const m = {};
  [...a, ...b].forEach((item) => {
    const key = item.label ?? item.color ?? '';
    if (!key) return;
    if (!m[key]) m[key] = {};
    Object.entries(item.tallas || {}).forEach(([t, q]) => {
      m[key][t] = (m[key][t] || 0) + q;
    });
  });
  return Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, tallas]) => ({ label, tallas }));
}

// ── Componente principal ──────────────────────────────────────────────────
export const FichaItemModal = ({ open, onClose, fila }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sumarLav, setSumarLav] = useState(false);

  useEffect(() => {
    if (!open || !fila) return;
    const ids = (fila.detalle || []).map(d => d.id).filter(Boolean);
    if (!ids.length) return;

    setLoading(true);
    setData(null);
    setSumarLav(false);
    axios.get(`${API}/reportes-produccion/ficha-item`, { params: { ids: ids.join(',') } })
      .then(r => setData(r.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [open, fila]);

  const tallas = data?.tallas || [];

  const tallerRows = (data?.grupos_taller || []).map(g => ({
    id: g.id,
    label: `${g.modelo || '—'} · ${g.n_corte}`,
    tallas: g.tallas,
  }));

  // Recarga datos del backend (tras guardar colores)
  const reload = useCallback(() => {
    if (!fila) return;
    const ids = (fila.detalle || []).map(d => d.id).filter(Boolean);
    if (!ids.length) return;
    axios.get(`${API}/reportes-produccion/ficha-item`, { params: { ids: ids.join(',') } })
      .then(r => setData(r.data))
      .catch(err => console.error(err));
  }, [fila]);

  const [asignarOpen, setAsignarOpen] = useState(false);
  const [asignarRegistroId, setAsignarRegistroId] = useState(null);
  const abrirAsignar = (row) => {
    setAsignarRegistroId(row.id);
    setAsignarOpen(true);
  };

  const lavRows = (data?.colores_lavanderia || []).map(c => ({ label: formatColorName(c.color), tallas: c.tallas }));

  const almacenBase = (data?.colores_almacen || []).map(c => ({ label: formatColorName(c.color), tallas: c.tallas }));
  const almacenRows = sumarLav
    ? mergeColores(almacenBase, (data?.colores_lavanderia || []).map(c => ({ color: formatColorName(c.color), tallas: c.tallas })))
    : almacenBase;

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
          <DialogTitle className="text-base">{fila?.item}</DialogTitle>
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
              {/* ─── COLUMNA 1: En taller + Muestras de lavandería ─── */}
              <div className="flex flex-col gap-4">
              <TallaTable
                title="En taller — lavandería / atraque"
                subtitle="Click en un corte para asignar colores"
                items={tallerRows}
                tallas={tallas}
                emptyMsg="Sin cortes en lavandería o atraque"
                rowLabel="corte"
                headerLabel="Modelo · Corte"
                onRowClick={abrirAsignar}
              />
                {/* Muestras de lavandería relacionadas a los cortes en taller */}
                <MuestrasLavanderiaSection
                  muestras={data?.muestras || []}
                  cortes={(data?.grupos_taller || []).map(g => ({
                    id: g.id,
                    n_corte: g.n_corte,
                    modelo: g.modelo,
                    estado: g.estado,
                  }))}
                  scope={data?.scope}
                  onChanged={reload}
                />
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
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/15 dark:border-amber-900 p-3">
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
              </div>

              {/* ─── COLUMNA 3: Almacén PT/Tienda + PT sin clasificar ─── */}
              <div className="flex flex-col gap-4">
              {/* 3. Almacén PT + Tienda */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Almacén PT / Tienda</h3>
                    <p className="text-[10px] text-muted-foreground">PT (registros) + stock real de tienda desde Odoo</p>
                  </div>
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
                          return (
                            <tr key={i} className="border-b hover:bg-muted/20">
                              <td className="p-1.5">{row.label}</td>
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
        onClose={() => setAsignarOpen(false)}
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
      />
    </Dialog>
  );
};
