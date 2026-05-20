import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, Plus, Trash2, X, Divide, Copy, ArrowLeftRight, Lock, Unlock, CheckCircle2, FlaskConical } from 'lucide-react';
import { formatColorName } from '../lib/utils';
import { toast } from 'sonner';
import { usePermissions } from '../hooks/usePermissions';
import { MuestrasLavanderiaSection } from './MuestrasLavanderiaSection';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AsignarColoresModal = ({ open, registroId, onClose, onSaved, otrosCortes = [], muestras = [], scope = null, onMuestrasChanged }) => {
  const { isAdmin } = usePermissions('registros');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [coloresDisp, setColoresDisp] = useState([]);
  // matriz[color_id] = { color_id, color_nombre, cantidades: { talla_id: n } }
  const [matriz, setMatriz] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [savingBulk, setSavingBulk] = useState(false);
  // Aprobado: { aprobados: bool, at: ISO, por: username }
  const [aprobado, setAprobado] = useState({ aprobados: false, at: null, por: null });
  const [aprobando, setAprobando] = useState(false);
  // Swap color: cuando se hace click en ⇄ de una fila, abre picker
  const [swapColorId, setSwapColorId] = useState(null);
  const [swapSearch, setSwapSearch] = useState('');
  // Dialog de muestras del corte (abierto desde el header)
  const [muestrasOpen, setMuestrasOpen] = useState(false);

  // bloqueado = aprobado y no admin → solo lectura
  const bloqueado = aprobado.aprobados && !isAdmin;

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    if (!open || !registroId) return;
    setLoading(true);
    setError('');
    setMatriz({});
    setAddOpen(false);
    setSearch('');

    setAprobado({ aprobados: false, at: null, por: null });
    setSwapColorId(null);
    setSwapSearch('');

    axios.get(`${API}/reportes-produccion/registro-colores/${registroId}`)
      .then(async (res) => {
        const d = res.data;
        setData(d);
        setAprobado({
          aprobados: !!d.colores_aprobados,
          at: d.colores_aprobados_at || null,
          por: d.colores_aprobados_por || null,
        });

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

        // 2) Construir matriz solo con los colores que YA tienen distribución
        //    guardada. Para agregar nuevos colores, usar el botón "Agregar color".
        //    peso=1 por defecto; cambiarlo pondera el prorrateo (ej. 2 = doble).
        const initial = {};
        (d.distribucion_actual || []).forEach((t) => {
          (t.colores || []).forEach((c) => {
            if (!initial[c.color_id]) {
              initial[c.color_id] = { color_id: c.color_id, color_nombre: c.color_nombre || '', peso: 1, cantidades: {} };
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

  // Prorrateo ponderado por columna "Proporción":
  // peso=1 reparte por igual, peso=2 da el doble de unidades a ese color, etc.
  const prorratear = () => {
    const filas = Object.values(matriz);
    if (filas.length === 0 || tallas.length === 0) return;
    const pesos = filas.map(f => Math.max(0, parseFloat(f.peso) || 1));
    const totalPeso = pesos.reduce((a, b) => a + b, 0);
    if (totalPeso <= 0) return;

    setMatriz((prev) => {
      const next = {};
      filas.forEach((f) => {
        next[f.color_id] = {
          color_id: f.color_id,
          color_nombre: f.color_nombre,
          peso: f.peso || 1,
          cantidades: {},
        };
      });
      tallas.forEach((t) => {
        const total = t.cantidad_total || 0;
        // Cuota ideal por color (con fracciones)
        const shares = filas.map((f, i) => {
          const ideal = total * (pesos[i] / totalPeso);
          const base = Math.floor(ideal);
          return { color_id: f.color_id, base, frac: ideal - base };
        });
        const restoTotal = total - shares.reduce((a, s) => a + s.base, 0);
        // Asigna los enteros y reparte el resto a los de mayor fracción
        const orden = shares
          .map((s, i) => ({ ...s, idx: i }))
          .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
        orden.forEach((s, rank) => {
          next[s.color_id].cantidades[t.talla_id] = s.base + (rank < restoTotal ? 1 : 0);
        });
      });
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
      [cid]: { color_id: cid, color_nombre: color.nombre, peso: 1, cantidades: {} },
    }));
    setAddOpen(false);
    setSearch('');
  };

  // Acepta string vacío durante la edición; commitPeso normaliza al hacer blur.
  const setPesoRaw = (color_id, value) => {
    setMatriz((prev) => {
      const next = { ...prev };
      const row = { ...(next[color_id] || { color_id, color_nombre: '', peso: 1, cantidades: {} }) };
      row.pesoStr = value;  // lo que muestra el input mientras escribe
      const n = parseFloat(value);
      if (isFinite(n) && n > 0) row.peso = n;  // sin reemplazar peso si el valor es inválido (mientras escribe)
      next[color_id] = row;
      return next;
    });
  };

  const commitPeso = (color_id) => {
    setMatriz((prev) => {
      const next = { ...prev };
      const row = { ...(next[color_id] || { color_id, color_nombre: '', peso: 1, cantidades: {} }) };
      const n = parseFloat(row.pesoStr ?? row.peso);
      row.peso = isFinite(n) && n > 0 ? n : 1;
      row.pesoStr = undefined;  // ya commited, volvemos a usar row.peso para display
      next[color_id] = row;
      return next;
    });
  };

  const coloresFiltradosParaAgregar = useMemo(() => {
    const yaPuestos = new Set(Object.keys(matriz));
    return coloresDisp
      .filter(c => !yaPuestos.has(c.id))
      .filter(c => !search.trim() || (c.nombre || '').toLowerCase().includes(search.trim().toLowerCase()));
  }, [coloresDisp, matriz, search]);

  // ── Reemplazar (swap) un color ─────────────────────────────
  // Mantiene las mismas cantidades por talla, solo cambia el color_id y nombre.
  const coloresParaSwap = useMemo(() => {
    const yaPuestos = new Set(Object.keys(matriz));
    return coloresDisp
      .filter(c => !yaPuestos.has(c.id))
      .filter(c => !swapSearch.trim() || (c.nombre || '').toLowerCase().includes(swapSearch.trim().toLowerCase()));
  }, [coloresDisp, matriz, swapSearch]);

  const reemplazarColor = (oldId, nuevoColor) => {
    setMatriz((prev) => {
      const row = prev[oldId];
      if (!row) return prev;
      const next = { ...prev };
      delete next[oldId];
      next[nuevoColor.id] = {
        color_id: nuevoColor.id,
        color_nombre: nuevoColor.nombre,
        peso: row.peso ?? 1,
        cantidades: { ...(row.cantidades || {}) },
      };
      return next;
    });
    setSwapColorId(null);
    setSwapSearch('');
  };

  // ── Aprobar / desaprobar colores ───────────────────────────
  const aprobarColores = async () => {
    if (algunExcedido) {
      toast.error('Hay tallas con cantidades excedidas. Ajusta antes de aprobar.');
      return;
    }
    setAprobando(true);
    try {
      // Si hay cambios pendientes, guardarlos primero
      if (!aprobado.aprobados) {
        await guardar({ skipClose: true });
      }
      const res = await axios.put(`${API}/reportes-produccion/registro-colores/${registroId}/aprobar`);
      setAprobado({
        aprobados: true,
        at: res.data?.colores_aprobados_at || new Date().toISOString(),
        por: res.data?.colores_aprobados_por || null,
      });
      toast.success('Colores aprobados. La distribución quedó bloqueada.');
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al aprobar colores');
    } finally {
      setAprobando(false);
    }
  };

  const desaprobarColores = async () => {
    setAprobando(true);
    try {
      await axios.put(`${API}/reportes-produccion/registro-colores/${registroId}/desaprobar`);
      setAprobado({ aprobados: false, at: null, por: null });
      toast.success('Aprobación retirada. La distribución vuelve a ser editable.');
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Error al desaprobar colores');
    } finally {
      setAprobando(false);
    }
  };

  const formatFecha = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  // ── Guardar ────────────────────────────────────────────────
  const guardar = async ({ skipClose = false } = {}) => {
    if (algunExcedido) {
      setError('Hay tallas con cantidades que exceden el total. Ajusta antes de guardar.');
      throw new Error('excedido');
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
      if (!skipClose) onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Error al guardar');
      throw e;
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
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
            </div>
            {registroId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 shrink-0 mr-7"
                onClick={() => setMuestrasOpen(true)}
                title={muestras.length > 0
                  ? `Ver ${muestras.length} muestra${muestras.length > 1 ? 's' : ''} de este corte · enviar nueva`
                  : 'Enviar muestra a lavandería para este corte'}
                data-testid="btn-abrir-muestras-asignar"
              >
                <FlaskConical className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" />
                {muestras.length > 0 ? `Muestras (${muestras.length})` : 'Muestras'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 h-48 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando matriz...
          </div>
        )}

        {!loading && data && (
          <div className="flex flex-col overflow-hidden max-h-[calc(92vh-90px)]">
            <div className="overflow-auto p-4 flex-1">
              {aprobado.aprobados && (
                <div className={`mb-3 rounded-md border px-3 py-2 flex items-center justify-between gap-3 text-xs ${
                  bloqueado ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
                }`}>
                  <div className="flex items-center gap-2">
                    {bloqueado ? <Lock className="h-3.5 w-3.5 text-amber-700" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />}
                    <span className={bloqueado ? 'text-amber-800' : 'text-emerald-800'}>
                      <strong>Colores aprobados</strong>
                      {aprobado.por && <> · por <strong>{aprobado.por}</strong></>}
                      {aprobado.at && <> · {formatFecha(aprobado.at)}</>}
                      {bloqueado && ' · Solo lectura'}
                    </span>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={desaprobarColores}
                      disabled={aprobando}
                    >
                      {aprobando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                      Desaprobar
                    </Button>
                  )}
                </div>
              )}
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                    <tr>
                      <th className="text-left p-2 border-b font-medium min-w-[180px]">Color</th>
                      <th
                        className="text-center p-2 border-b font-medium min-w-[80px]"
                        title="Peso del color en el prorrateo. Por defecto 1. Si pones 2, ese color recibe el doble que los demás."
                      >
                        Proporción
                      </th>
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
                        <td colSpan={tallas.length + 4} className="p-6 text-center text-muted-foreground italic">
                          Sin colores aún. Usa "Agregar color" para empezar.
                        </td>
                      </tr>
                    )}
                    {filas.map((row) => {
                      const totalFila = tallas.reduce((s, t) => s + (row.cantidades?.[t.talla_id] || 0), 0);
                      const swapAbierto = swapColorId === row.color_id;
                      return (
                        <tr key={row.color_id} className="border-b hover:bg-muted/20">
                          <td className="p-2 font-medium">
                            <div className="flex items-center gap-1.5 relative">
                              <span>{formatColorName(row.color_nombre)}</span>
                              {!bloqueado && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSwapColorId(swapAbierto ? null : row.color_id);
                                    setSwapSearch('');
                                  }}
                                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                  title="Reemplazar este color (mantiene las cantidades)"
                                  data-testid={`swap-${row.color_id}`}
                                >
                                  <ArrowLeftRight className="h-3 w-3" />
                                </button>
                              )}
                              {swapAbierto && (
                                <div className="absolute z-30 top-full left-0 mt-1 w-[260px] bg-background border rounded-md shadow-lg p-2">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-medium">Reemplazar por</span>
                                    <button
                                      type="button"
                                      onClick={() => { setSwapColorId(null); setSwapSearch(''); }}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={swapSearch}
                                    onChange={(e) => setSwapSearch(e.target.value)}
                                    placeholder="Buscar color..."
                                    className="w-full text-[11px] px-2 py-1 rounded border border-input bg-background mb-1.5"
                                    autoFocus
                                  />
                                  <div className="max-h-[180px] overflow-auto flex flex-wrap gap-1">
                                    {coloresParaSwap.length === 0 && (
                                      <p className="text-[11px] text-muted-foreground italic p-1">Sin colores disponibles en la regla</p>
                                    )}
                                    {coloresParaSwap.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => reemplazarColor(row.color_id, c)}
                                        className="text-[11px] px-2 py-1 rounded border hover:bg-muted hover:border-primary"
                                      >
                                        {formatColorName(c.nombre)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-1 text-center">
                            <input
                              type="number"
                              min={0.1}
                              step="0.5"
                              placeholder="1"
                              value={row.pesoStr !== undefined ? row.pesoStr : (row.peso ?? 1)}
                              onChange={(e) => setPesoRaw(row.color_id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => commitPeso(row.color_id)}
                              disabled={bloqueado}
                              className="w-16 mx-auto px-1.5 py-1 text-center text-xs font-mono rounded border border-input bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                              data-testid={`peso-${row.color_id}`}
                            />
                          </td>
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
                                  disabled={bloqueado}
                                  className={`w-full max-w-[80px] mx-auto px-1.5 py-1 text-center text-xs font-mono rounded border disabled:opacity-60 disabled:cursor-not-allowed ${
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
                              disabled={bloqueado}
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
                      <td className="p-2" />
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

              {/* Agregar color + Prorratear */}
              <div className="mt-3 relative flex items-center gap-2 flex-wrap">
                {!addOpen ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={() => setAddOpen(true)}
                      disabled={bloqueado}
                      data-testid="btn-add-color"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar color
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={prorratear}
                      disabled={bloqueado || Object.keys(matriz).length === 0}
                      title="Distribuye el total de cada talla en partes iguales entre los colores seleccionados"
                      data-testid="btn-prorratear-asignar"
                    >
                      <Divide className="h-3.5 w-3.5" />
                      Prorratear
                    </Button>
                  </>
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
                {otrosCortes.length > 0 && Object.keys(matriz).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBulkSelected(new Set(otrosCortes.map(c => c.id)));
                      setBulkOpen(true);
                    }}
                    disabled={saving || algunExcedido || bloqueado}
                    title="Aplicar estos colores y proporciones a otros cortes del ítem"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Aplicar a otros cortes
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                  {bloqueado ? 'Cerrar' : 'Cancelar'}
                </Button>
                {!bloqueado && !aprobado.aprobados && Object.keys(matriz).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={aprobarColores}
                    disabled={saving || aprobando || algunExcedido}
                    title="Guarda y bloquea esta distribución. Solo admin podrá modificar después."
                    data-testid="btn-aprobar-colores"
                    className="gap-1.5 border-emerald-400 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {aprobando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aprobar colores
                  </Button>
                )}
                {!bloqueado && (
                  <Button
                    size="sm"
                    onClick={() => guardar()}
                    disabled={saving || algunExcedido}
                    data-testid="btn-save-colores"
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    Guardar distribución
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Dialog secundario: aplicar masivamente a otros cortes */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aplicar a otros cortes</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Reparte los mismos <strong>colores</strong> con sus <strong>proporciones</strong> en los cortes seleccionados.
              Las cantidades se ajustan al tope de cada talla de cada corte (no se copian iguales).
            </p>
          </DialogHeader>
          <div className="max-h-[280px] overflow-auto rounded border bg-background">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-2 text-left w-[40px]">
                    <input
                      type="checkbox"
                      checked={bulkSelected.size === otrosCortes.length && otrosCortes.length > 0}
                      onChange={(e) => {
                        setBulkSelected(e.target.checked
                          ? new Set(otrosCortes.map(c => c.id))
                          : new Set());
                      }}
                    />
                  </th>
                  <th className="p-2 text-left">Corte</th>
                  <th className="p-2 text-left">Modelo</th>
                  <th className="p-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {otrosCortes.map(c => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(c.id)}
                        onChange={(e) => {
                          setBulkSelected(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="p-2 font-mono">{c.n_corte}</td>
                    <td className="p-2">{c.modelo || '—'}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[9px] px-1">{c.estado}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {bulkSelected.size} de {otrosCortes.length} seleccionados.
            Los cortes con distribución existente <strong>serán sobrescritos</strong>.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)} disabled={savingBulk}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={savingBulk || bulkSelected.size === 0}
              onClick={async () => {
                setSavingBulk(true);
                try {
                  // Construye el patrón de colores+pesos desde la matriz actual
                  const colores = Object.values(matriz).map(r => ({
                    color_id: r.color_id,
                    color_nombre: r.color_nombre || '',
                    peso: r.peso ?? 1,
                  }));
                  const res = await axios.post(
                    `${API}/reportes-produccion/registro-colores/aplicar-bulk`,
                    {
                      registro_ids: Array.from(bulkSelected),
                      colores,
                    }
                  );
                  toast.success(`Aplicado a ${res.data?.actualizados ?? bulkSelected.size} cortes`);
                  setBulkOpen(false);
                  onSaved?.();
                } catch (e) {
                  toast.error(e?.response?.data?.detail || 'Error al aplicar masivamente');
                } finally {
                  setSavingBulk(false);
                }
              }}
            >
              {savingBulk && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Aplicar a {bulkSelected.size} corte{bulkSelected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de muestras del corte actual (abierto desde el botón en el header) */}
      <Dialog open={muestrasOpen} onOpenChange={setMuestrasOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-700 dark:text-sky-400" />
              Muestras
              {data && (
                <span className="text-muted-foreground font-normal">
                  · {data.modelo_nombre || '—'} · Corte {data.n_corte}
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Envía una nueva muestra a lavandería o revisa las ya registradas para este corte.
            </p>
          </DialogHeader>
          {muestrasOpen && data && (
            <MuestrasLavanderiaSection
              muestras={muestras}
              cortes={[{
                id: registroId,
                n_corte: data.n_corte,
                modelo: data.modelo_nombre || '',
                estado: data.estado || '',
              }]}
              scope={scope}
              onChanged={onMuestrasChanged}
            />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
