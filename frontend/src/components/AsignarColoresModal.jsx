import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { formatColorName } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AsignarColoresModal = ({ open, registroId, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [coloresDisp, setColoresDisp] = useState([]);
  // matriz[color_id] = { color_id, color_nombre, cantidades: { talla_id: n } }
  const [matriz, setMatriz] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    if (!open || !registroId) return;
    setLoading(true);
    setError('');
    setMatriz({});
    setAddOpen(false);
    setSearch('');

    axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`)
      .then(async (res) => {
        const d = res.data;
        setData(d);

        // 1) Cargar colores disponibles según la regla marca/tipo/entalle.
        //    Si la regla no devuelve nada, fallback al catálogo completo.
        const baseParams = new URLSearchParams();
        if (d.marca_id)   baseParams.append('marca_id',   d.marca_id);
        if (d.tipo_id)    baseParams.append('tipo_id',    d.tipo_id);
        if (d.entalle_id) baseParams.append('entalle_id', d.entalle_id);
        if (d.hilo_id)    baseParams.append('hilo_id',    d.hilo_id);

        const tryParams = new URLSearchParams(baseParams);
        tryParams.append('solo_regla', 'true');

        let coloresFromRule = [];
        try {
          let cr = await axios.get(`${API}/colores-catalogo?${tryParams}`);
          coloresFromRule = Array.isArray(cr.data) ? cr.data : [];
          if (coloresFromRule.length === 0) {
            const fallback = new URLSearchParams(baseParams);
            fallback.append('incluir_todos', 'true');
            cr = await axios.get(`${API}/colores-catalogo?${fallback}`);
            coloresFromRule = Array.isArray(cr.data) ? cr.data : [];
          }
        } catch {
          coloresFromRule = [];
        }
        setColoresDisp(coloresFromRule);

        // 2) Construir matriz precargada con TODOS los colores de la regla,
        //    rellenando los que ya tienen distribución.
        const initial = {};
        coloresFromRule.forEach((c) => {
          initial[c.id] = { color_id: c.id, color_nombre: c.nombre || '', cantidades: {} };
        });
        (d.distribucion_actual || []).forEach((t) => {
          (t.colores || []).forEach((c) => {
            if (!initial[c.color_id]) {
              // Color asignado fuera de la regla actual: lo conservamos para no perder datos
              initial[c.color_id] = { color_id: c.color_id, color_nombre: c.color_nombre || '', cantidades: {} };
            }
            initial[c.color_id].cantidades[t.talla_id] = c.cantidad;
          });
        });
        setMatriz(initial);
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Error cargando registro'))
      .finally(() => setLoading(false));
  }, [open, registroId]);

  // ── Helpers ────────────────────────────────────────────────
  const tallas = data?.tallas || [];

  const totalUsadoPorTalla = useMemo(() => {
    const acc = {};
    tallas.forEach(t => { acc[t.talla_id] = 0; });
    Object.values(matriz).forEach((row) => {
      tallas.forEach(t => { acc[t.talla_id] += row.cantidades?.[t.talla_id] || 0; });
    });
    return acc;
  }, [matriz, tallas]);

  const restantePorTalla = useMemo(() => {
    const r = {};
    tallas.forEach(t => { r[t.talla_id] = (t.cantidad_total || 0) - (totalUsadoPorTalla[t.talla_id] || 0); });
    return r;
  }, [tallas, totalUsadoPorTalla]);

  const algunExcedido = tallas.some(t => (totalUsadoPorTalla[t.talla_id] || 0) > (t.cantidad_total || 0));

  const setCantidad = (color_id, talla_id, value) => {
    setMatriz((prev) => {
      const next = { ...prev };
      const row = { ...(next[color_id] || { color_id, color_nombre: '', cantidades: {} }) };
      const cantidades = { ...row.cantidades };
      const n = Math.max(0, parseInt(value || '0', 10) || 0);
      cantidades[talla_id] = n;
      row.cantidades = cantidades;
      next[color_id] = row;
      return next;
    });
  };

  const distribuirIgual = (color_id) => {
    setMatriz((prev) => {
      const next = { ...prev };
      const row = { ...(next[color_id] || { color_id, color_nombre: '', cantidades: {} }) };
      const cantidades = { ...row.cantidades };
      tallas.forEach((t) => {
        // Reparte el restante (lo que quedaría libre considerando otros colores) en partes iguales — simple
        const otrosUsado = Object.values(prev)
          .filter(r => r.color_id !== color_id)
          .reduce((s, r) => s + (r.cantidades?.[t.talla_id] || 0), 0);
        cantidades[t.talla_id] = Math.max(0, (t.cantidad_total || 0) - otrosUsado);
      });
      row.cantidades = cantidades;
      next[color_id] = row;
      return next;
    });
  };

  const eliminarColor = (color_id) => {
    setMatriz((prev) => {
      const next = { ...prev };
      delete next[color_id];
      return next;
    });
  };

  const agregarColor = (color) => {
    const cid = color.id;
    if (matriz[cid]) return;
    setMatriz((prev) => ({
      ...prev,
      [cid]: { color_id: cid, color_nombre: color.nombre, cantidades: {} },
    }));
    setAddOpen(false);
    setSearch('');
  };

  const coloresFiltradosParaAgregar = useMemo(() => {
    const yaPuestos = new Set(Object.keys(matriz));
    return coloresDisp
      .filter(c => !yaPuestos.has(c.id))
      .filter(c => !search.trim() || (c.nombre || '').toLowerCase().includes(search.trim().toLowerCase()));
  }, [coloresDisp, matriz, search]);

  // ── Guardar ────────────────────────────────────────────────
  const guardar = async () => {
    if (algunExcedido) {
      setError('Hay tallas con cantidades que exceden el total. Ajusta antes de guardar.');
      return;
    }
    setSaving(true);
    setError('');

    const distribucion = tallas.map((t) => ({
      talla_id: t.talla_id,
      talla_nombre: t.talla_nombre,
      cantidad_total: t.cantidad_total,
      colores: Object.values(matriz)
        .map(r => ({ color_id: r.color_id, color_nombre: r.color_nombre, cantidad: r.cantidades?.[t.talla_id] || 0 }))
        .filter(c => c.cantidad > 0),
    }));

    try {
      await axios.put(`${API}/reportes-produccion/registro-colores/${registroId}`, { distribucion });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  const filas = Object.values(matriz).sort((a, b) => (a.color_nombre || '').localeCompare(b.color_nombre || ''));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-hidden p-0"
        data-testid="asignar-colores-modal"
      >
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base">
            Asignar colores
            {data && (
              <>
                {' · '}<span className="text-muted-foreground font-normal">{data.modelo_nombre || '—'} · Corte {data.n_corte}</span>
              </>
            )}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Las cantidades de cada talla no pueden exceder el total disponible.
          </p>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 h-48 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando matriz...
          </div>
        )}

        {!loading && data && (
          <div className="flex flex-col overflow-hidden max-h-[calc(92vh-90px)]">
            <div className="overflow-auto p-4 flex-1">
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                    <tr>
                      <th className="text-left p-2 border-b font-medium min-w-[180px]">Color</th>
                      {tallas.map(t => (
                        <th key={t.talla_id} className="text-center p-2 border-b font-medium min-w-[80px]">
                          {t.talla_nombre}
                          <div className="text-[9px] text-muted-foreground font-normal">
                            tope {t.cantidad_total}
                          </div>
                        </th>
                      ))}
                      <th className="text-center p-2 border-b font-semibold min-w-[70px]">Total</th>
                      <th className="text-center p-2 border-b w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.length === 0 && (
                      <tr>
                        <td colSpan={tallas.length + 3} className="p-6 text-center text-muted-foreground italic">
                          Sin colores aún. Usa "Agregar color" para empezar.
                        </td>
                      </tr>
                    )}
                    {filas.map((row) => {
                      const totalFila = tallas.reduce((s, t) => s + (row.cantidades?.[t.talla_id] || 0), 0);
                      return (
                        <tr key={row.color_id} className="border-b hover:bg-muted/20">
                          <td className="p-2 font-medium">{formatColorName(row.color_nombre)}</td>
                          {tallas.map((t) => {
                            const val = row.cantidades?.[t.talla_id] || 0;
                            const otros = (totalUsadoPorTalla[t.talla_id] || 0) - val;
                            const maxPosible = Math.max(0, (t.cantidad_total || 0) - otros);
                            const excedido = val > maxPosible;
                            return (
                              <td key={t.talla_id} className="p-1 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxPosible}
                                  value={val || ''}
                                  placeholder="0"
                                  onChange={(e) => setCantidad(row.color_id, t.talla_id, e.target.value)}
                                  className={`w-full max-w-[80px] mx-auto px-1.5 py-1 text-center text-xs font-mono rounded border ${
                                    excedido
                                      ? 'border-destructive bg-destructive/10 text-destructive'
                                      : val
                                        ? 'border-primary/40 bg-primary/5'
                                        : 'border-input bg-background'
                                  }`}
                                  data-testid={`cell-${row.color_id}-${t.talla_id}`}
                                />
                              </td>
                            );
                          })}
                          <td className="text-center p-2 font-mono font-semibold">{totalFila || '-'}</td>
                          <td className="text-center p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => eliminarColor(row.color_id)}
                              title="Quitar color de la matriz"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-semibold border-t-2">
                      <td className="p-2">Usado / Total</td>
                      {tallas.map((t) => {
                        const usado = totalUsadoPorTalla[t.talla_id] || 0;
                        const tot   = t.cantidad_total || 0;
                        const excedido = usado > tot;
                        const ok = usado === tot;
                        return (
                          <td
                            key={t.talla_id}
                            className={`text-center p-2 font-mono text-[11px] ${
                              excedido ? 'text-destructive' : ok ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          >
                            {usado} / {tot}
                            <div className="text-[9px] font-normal">
                              {excedido ? `+${usado - tot}` : restantePorTalla[t.talla_id] > 0 ? `quedan ${restantePorTalla[t.talla_id]}` : 'completo'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center p-2 font-mono">
                        {Object.values(totalUsadoPorTalla).reduce((a, b) => a + b, 0)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Agregar color */}
              <div className="mt-3 relative">
                {!addOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1"
                    onClick={() => setAddOpen(true)}
                    data-testid="btn-add-color"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar color
                  </Button>
                ) : (
                  <div className="border rounded-md p-3 bg-background shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium">Selecciona un color</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAddOpen(false); setSearch(''); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar color..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border border-input bg-background mb-2"
                      autoFocus
                    />
                    <div className="max-h-[200px] overflow-auto flex flex-wrap gap-1.5">
                      {coloresFiltradosParaAgregar.length === 0 && (
                        <p className="text-xs text-muted-foreground italic p-2">Sin colores disponibles</p>
                      )}
                      {coloresFiltradosParaAgregar.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => agregarColor(c)}
                          className="text-[11px] px-2 py-1 rounded border hover:bg-muted hover:border-primary transition-colors"
                        >
                          {formatColorName(c.nombre)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-5 py-3 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-xs">
                {algunExcedido ? (
                  <Badge variant="destructive" className="text-[10px]">Hay tallas excedidas</Badge>
                ) : Object.keys(matriz).length === 0 ? (
                  <span className="text-muted-foreground">Sin cambios pendientes</span>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Listo para guardar</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={guardar}
                  disabled={saving || algunExcedido}
                  data-testid="btn-save-colores"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                  Guardar distribución
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
