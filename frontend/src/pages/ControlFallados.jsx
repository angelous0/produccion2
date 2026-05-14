import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import {
  RefreshCw, ChevronDown,
  FileText, ClipboardList, Ban,
  AlertCircle, CheckCircle2,
  Droplets, Scissors, Sparkles, Palette, Package, Wrench,
  AlertTriangle, X, Download, Tag, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Checkbox blanco, gris al pasar el cursor, azul al marcarse.
const SoftCheckbox = ({ checked, onCheckedChange, ...rest }) => (
  <Checkbox
    checked={checked}
    onCheckedChange={onCheckedChange}
    className="h-[18px] w-[18px] rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-950 bg-none shadow-none transition-colors hover:border-zinc-500 dark:hover:border-zinc-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary"
    style={{ backgroundImage: 'none', appearance: 'none', WebkitAppearance: 'none' }}
    {...rest}
  />
);

// ─── Helpers ─────────────────────────────────────────────────────────────
const fmtDM = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [, m, dd] = s.split('-');
  return `${dd}/${m}`;
};

const fmtFecha = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};

const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Icono y color por servicio
const ServicioBadge = ({ nombre }) => {
  const n = (nombre || '').toLowerCase();
  let Icon = Package;
  let cls = 'text-zinc-500';
  if (n.includes('lavan')) { Icon = Droplets; cls = 'text-cyan-600 dark:text-cyan-400'; }
  else if (n.includes('costura')) { Icon = Scissors; cls = 'text-violet-600 dark:text-violet-400'; }
  else if (n.includes('acabado')) { Icon = Sparkles; cls = 'text-amber-600 dark:text-amber-400'; }
  else if (n.includes('estampa')) { Icon = Palette; cls = 'text-rose-600 dark:text-rose-400'; }
  else if (n.includes('arreglo')) { Icon = Wrench; cls = 'text-orange-600 dark:text-orange-400'; }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Icon className={`h-3.5 w-3.5 ${cls}`} />
      <span className="text-muted-foreground">{nombre}</span>
    </span>
  );
};

// Días vencido con escala de color, parametrizable según estado
const DiasBadge = ({ dias, variant }) => {
  // variant: 'sin_marcar' (rojo escalado) | 'marcado' (amber) | 'cobrado' (gris)
  let cls;
  if (variant === 'cobrado') {
    cls = 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  } else if (variant === 'marcado') {
    cls = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  } else if (dias >= 15) {
    cls = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  } else if (dias >= 8) {
    cls = 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  } else {
    cls = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${cls}`}>
      {dias}d
    </span>
  );
};

// Badge de estado de cobro (chips a la derecha)
const EstadoChip = ({ estado, nota }) => {
  if (estado === 'cobrado') {
    const txt = nota
      ? `COBRADO · ${nota.numero || ''}`
      : 'COBRADO';
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60 whitespace-nowrap">
        {txt}
      </span>
    );
  }
  if (estado === 'marcado') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 whitespace-nowrap">
        MARCADO
      </span>
    );
  }
  return null;
};

// ─── Pestaña: Por cobrar ─────────────────────────────────────────────────
const TabPorCobrar = ({ filas, refreshAll, filtro, onCambiarFiltro }) => {
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [grupoExpandido, setGrupoExpandido] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Acción inline (desmarcar / cobrar / descobrar)
  const [accionDialog, setAccionDialog] = useState(null);
  const [accionMotivo, setAccionMotivo] = useState('');
  const [accionForm, setAccionForm] = useState({});

  // Solo arreglos VENCIDOS, no completados
  const vencidos = useMemo(() => filas.filter(f =>
    f.tipo_fila === 'ARREGLO' && f.estado === 'VENCIDO',
  ), [filas]);

  // Filtrar por estado_cobro según filtro segmentado
  const visibles = useMemo(() => {
    if (filtro === 'todos') return vencidos;
    return vencidos.filter(f => (f.estado_cobro || 'sin_marcar') === filtro);
  }, [vencidos, filtro]);

  // Agrupar por proveedor
  const grupos = useMemo(() => {
    const m = new Map();
    for (const f of visibles) {
      const key = f.persona_id || `__sin_persona_${f.persona || 'Sin proveedor'}`;
      const name = f.persona || 'Sin proveedor';
      if (!m.has(key)) m.set(key, {
        key, persona_id: f.persona_id, persona: name,
        servicios: new Set(),
        lotes: [], totalPzs: 0, maxDiasSinCobrar: 0,
      });
      const g = m.get(key);
      g.lotes.push(f);
      g.totalPzs += f.enviado || 0;
      if (f.servicio) g.servicios.add(f.servicio);
      // Solo cuenta antigüedad para los NO cobrados
      if ((f.estado_cobro || 'sin_marcar') !== 'cobrado') {
        if ((f.dias || 0) > g.maxDiasSinCobrar) g.maxDiasSinCobrar = f.dias || 0;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.maxDiasSinCobrar - a.maxDiasSinCobrar || a.persona.localeCompare(b.persona));
  }, [visibles]);

  useEffect(() => {
    setGrupoExpandido(prev => {
      const next = { ...prev };
      for (const g of grupos) if (!(g.key in next)) next[g.key] = true;
      return next;
    });
  }, [grupos]);

  // KPIs (sobre TODOS los vencidos, no solo los visibles del filtro)
  const sinMarcar = vencidos.filter(f => (f.estado_cobro || 'sin_marcar') === 'sin_marcar');
  const marcadosArr = vencidos.filter(f => f.estado_cobro === 'marcado');
  const cobradosArr = vencidos.filter(f => f.estado_cobro === 'cobrado');
  const antiguedadMax = vencidos.filter(f => f.estado_cobro !== 'cobrado').reduce((m, f) => Math.max(m, f.dias || 0), 0);

  // Selección solo aplica a 'sin_marcar'
  const lotesSeleccionables = useMemo(
    () => visibles.filter(f => (f.estado_cobro || 'sin_marcar') === 'sin_marcar'),
    [visibles],
  );
  const seleccionadosArr = useMemo(
    () => lotesSeleccionables.filter(f => seleccionados.has(f.arreglo_id)),
    [lotesSeleccionables, seleccionados],
  );
  const provsSel = useMemo(
    () => new Set(seleccionadosArr.map(s => s.persona_id || s.persona)),
    [seleccionadosArr],
  );
  const seleccionPzs = seleccionadosArr.reduce((a, s) => a + (s.enviado || 0), 0);
  const mismoProveedor = provsSel.size <= 1;

  const toggleSel = (id) => setSeleccionados(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleGrupo = (key) => setGrupoExpandido(p => ({ ...p, [key]: !p[key] }));
  const limpiarSeleccion = () => setSeleccionados(new Set());

  const seleccionarGrupo = (g) => {
    const seleccionables = g.lotes.filter(l => (l.estado_cobro || 'sin_marcar') === 'sin_marcar');
    if (!seleccionables.length) return;
    setSeleccionados(prev => {
      const n = new Set(prev);
      const todosSel = seleccionables.every(l => n.has(l.arreglo_id));
      if (todosSel) seleccionables.forEach(l => n.delete(l.arreglo_id));
      else seleccionables.forEach(l => n.add(l.arreglo_id));
      return n;
    });
  };

  // Marcar para cobro (batch)
  const confirmarMarcar = async () => {
    if (!seleccionadosArr.length) return;
    if (!mismoProveedor) {
      toast.error('Selecciona envíos de un solo proveedor a la vez');
      return;
    }
    setSubmitting(true);
    try {
      let ok = 0, fail = 0;
      for (const lote of seleccionadosArr) {
        try {
          await axios.post(`${API}/arreglos/${lote.arreglo_id}/marcar-cobro`,
            { motivo: motivo || null }, { headers: hdrs() });
          ok++;
        } catch (e) {
          fail++;
        }
      }
      if (ok > 0) toast.success(`${ok} lote${ok !== 1 ? 's' : ''} marcado${ok !== 1 ? 's' : ''} para cobro`);
      if (fail > 0) toast.error(`${fail} lote${fail !== 1 ? 's' : ''} fallaron`);
      setSeleccionados(new Set());
      setMotivo('');
      setModalOpen(false);
      refreshAll();
    } finally {
      setSubmitting(false);
    }
  };

  // Acciones por lote individual
  const abrirAccion = (lote, tipo) => {
    setAccionDialog({ lote, tipo });
    setAccionMotivo('');
    setAccionForm({
      tipo_comprobante: 'nota_descuento',
      numero_comprobante: '',
      fecha_emision_comprobante: '',
      observaciones: '',
    });
  };

  const ejecutarAccion = async () => {
    if (!accionDialog) return;
    const { lote, tipo } = accionDialog;
    try {
      if (tipo === 'desmarcar') {
        await axios.post(`${API}/arreglos/${lote.arreglo_id}/desmarcar-cobro`,
          { motivo: accionMotivo || null }, { headers: hdrs() });
        toast.success('Lote desmarcado');
      } else if (tipo === 'cobrar') {
        await axios.post(`${API}/arreglos/${lote.arreglo_id}/cobrar`, {
          tipo_comprobante: accionForm.tipo_comprobante || null,
          numero_comprobante: accionForm.numero_comprobante || null,
          fecha_emision_comprobante: accionForm.fecha_emision_comprobante || null,
          observaciones: accionForm.observaciones || null,
        }, { headers: hdrs() });
        toast.success('Lote marcado como cobrado');
      } else if (tipo === 'descobrar') {
        if (!accionMotivo.trim()) {
          toast.error('El motivo es obligatorio');
          return;
        }
        await axios.post(`${API}/arreglos/${lote.arreglo_id}/descobrar`,
          { motivo: accionMotivo }, { headers: hdrs() });
        toast.success('Lote revertido (vuelve a marcado)');
      }
      setAccionDialog(null);
      refreshAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error en la acción');
    }
  };

  // Renderizado de cada lote según su estado_cobro
  const renderLote = (l) => {
    const estCobro = l.estado_cobro || 'sin_marcar';
    const sel = seleccionados.has(l.arreglo_id);
    const variantDias = estCobro;
    const filaTint = sel ? 'bg-blue-50/70 dark:bg-blue-950/30'
                    : estCobro === 'cobrado' ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
                    : estCobro === 'marcado' ? 'bg-amber-50/40 dark:bg-amber-950/15'
                    : 'bg-card';

    const enviarAccion = (tipo) => (e) => { e.stopPropagation(); abrirAccion(l, tipo); };

    return (
      <div
        key={l.arreglo_id}
        onClick={() => estCobro === 'sin_marcar' && toggleSel(l.arreglo_id)}
        className={`relative grid grid-cols-[36px_18px_minmax(110px,0.9fr)_minmax(160px,1.8fr)_70px_minmax(120px,1.1fr)_minmax(160px,1.4fr)_50px] gap-3 items-center px-3 py-2 transition-colors ${
          estCobro === 'sin_marcar' ? 'cursor-pointer hover:bg-muted/30 dark:hover:bg-zinc-800/30' : ''
        } ${filaTint}`}
        data-testid={`lote-${l.arreglo_id}`}
      >
        {sel && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
        <span></span>
        <div onClick={(e) => e.stopPropagation()} className="flex items-center">
          {estCobro === 'sin_marcar' && (
            <SoftCheckbox
              checked={sel}
              onCheckedChange={() => toggleSel(l.arreglo_id)}
              aria-label={`Seleccionar lote ${l.n_corte}`}
            />
          )}
        </div>
        <span className="font-mono text-sm tabular-nums tracking-tight truncate">
          {l.n_corte}
        </span>
        <span className="text-sm truncate" title={l.modelo || l.linea_negocio || ''}>
          {l.modelo || l.marca || l.linea_negocio || '—'}
        </span>
        <div className="text-right tabular-nums">
          <span className="text-sm">{l.enviado}</span>
          <span className="text-[10px] text-muted-foreground ml-1">pzs</span>
        </div>
        <div className="min-w-0">
          <ServicioBadge nombre={l.servicio} />
        </div>
        {/* Info según estado */}
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          {estCobro === 'marcado' && (
            <>
              <EstadoChip estado="marcado" />
              <span className="text-[10px] text-muted-foreground truncate">
                {l.marcado_por_nombre || '—'} · {fmtDM(l.fecha_marcado)}
                {l.motivo_marcado && ` · ${l.motivo_marcado}`}
              </span>
            </>
          )}
          {estCobro === 'cobrado' && (
            <>
              <EstadoChip estado="cobrado" nota={{ numero: [l.tipo_comprobante, l.numero_comprobante].filter(Boolean).join(' ') || null }} />
              <span className="text-[10px] text-muted-foreground truncate">
                {l.cobrado_por_nombre || '—'} · {fmtDM(l.fecha_cobro)}
              </span>
            </>
          )}
        </div>
        <div className="flex justify-end gap-1 items-center">
          <DiasBadge dias={l.dias} variant={variantDias} />
          {estCobro === 'marcado' && (
            <button
              type="button"
              onClick={enviarAccion('desmarcar')}
              className="h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Desmarcar"
            >
              <X className="h-3.5 w-3.5 mx-auto" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-28">
      {/* KPI cards (4) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Vencidos sin marcar</p>
          <p className="text-2xl text-red-600 dark:text-red-400 mt-1 tabular-nums leading-none">
            {sinMarcar.length}
            <span className="text-sm text-muted-foreground ml-1.5">lote{sinMarcar.length !== 1 ? 's' : ''}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {sinMarcar.reduce((a, f) => a + (f.enviado || 0), 0)} pzs
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Marcados</p>
          <p className="text-2xl text-amber-700 dark:text-amber-400 mt-1 tabular-nums leading-none">
            {marcadosArr.length}
            <span className="text-sm text-muted-foreground ml-1.5">lote{marcadosArr.length !== 1 ? 's' : ''}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {marcadosArr.reduce((a, f) => a + (f.enviado || 0), 0)} pzs
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Cobrados</p>
          <p className="text-2xl text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums leading-none">
            {cobradosArr.length}
            <span className="text-sm text-muted-foreground ml-1.5">lote{cobradosArr.length !== 1 ? 's' : ''}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {cobradosArr.reduce((a, f) => a + (f.enviado || 0), 0)} pzs
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Antigüedad máx</p>
          <p className="text-2xl mt-1 tabular-nums leading-none">
            {antiguedadMax}
            <span className="text-sm text-muted-foreground ml-1.5">días</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            sin cobrar
          </p>
        </div>
      </div>

      {/* Segmentado de filtro */}
      <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
        {[
          { v: 'todos', l: `Todos (${vencidos.length})` },
          { v: 'sin_marcar', l: `Sin marcar (${sinMarcar.length})` },
          { v: 'marcado', l: `Marcados (${marcadosArr.length})` },
          { v: 'cobrado', l: `Cobrados (${cobradosArr.length})` },
        ].map(opt => (
          <button
            key={opt.v}
            type="button"
            onClick={() => onCambiarFiltro(opt.v)}
            className={`px-3 py-1.5 rounded transition-colors ${
              filtro === opt.v
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500/60 mb-2" />
            <p className="text-sm font-medium">No hay envíos en este filtro</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Header de columnas */}
          <div className="grid grid-cols-[36px_18px_minmax(110px,0.9fr)_minmax(160px,1.8fr)_70px_minmax(120px,1.1fr)_minmax(160px,1.4fr)_50px] gap-3 items-center px-3 py-2 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            <span></span><span></span>
            <span>N° de corte</span>
            <span>Modelo</span>
            <span className="text-right">Cant.</span>
            <span>Servicio</span>
            <span>Estado</span>
            <span className="text-right">Días</span>
          </div>

          {grupos.map((g, gi) => {
            const seleccionablesGrupo = g.lotes.filter(l => (l.estado_cobro || 'sin_marcar') === 'sin_marcar');
            const allSel = seleccionablesGrupo.length > 0 && seleccionablesGrupo.every(l => seleccionados.has(l.arreglo_id));
            const someSel = seleccionablesGrupo.some(l => seleccionados.has(l.arreglo_id));
            const expanded = grupoExpandido[g.key] !== false;
            const critico = g.maxDiasSinCobrar >= 7;
            const servicios = Array.from(g.servicios).slice(0, 3);

            return (
              <div key={g.key} className={gi > 0 ? 'border-t' : ''}>
                <div
                  className="grid grid-cols-[36px_18px_1fr_auto] gap-3 items-center px-3 py-2 cursor-pointer select-none bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-150 dark:hover:bg-zinc-800 transition-colors"
                  onClick={() => toggleGrupo(g.key)}
                  data-testid={`grupo-${g.key}`}
                >
                  <button
                    type="button"
                    className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground"
                    onClick={(e) => { e.stopPropagation(); toggleGrupo(g.key); }}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                  </button>
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                    {seleccionablesGrupo.length > 0 && (
                      <SoftCheckbox
                        checked={allSel ? true : (someSel ? 'indeterminate' : false)}
                        onCheckedChange={() => seleccionarGrupo(g)}
                        aria-label={`Seleccionar todos los lotes sin marcar de ${g.persona}`}
                      />
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                    <span className="font-medium text-sm truncate">{g.persona}</span>
                    {servicios.length > 0 && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        · {servicios.join(', ')}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      · {g.lotes.length} lote{g.lotes.length !== 1 ? 's' : ''} · {g.totalPzs} pzs
                    </span>
                  </div>
                  <div className="flex justify-end items-center gap-2">
                    {critico && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        CRÍTICO {g.maxDiasSinCobrar}d
                      </span>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t divide-y divide-border/50">
                    {g.lotes.map(renderLote)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Barra inferior fija */}
      {seleccionadosArr.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          data-testid="barra-marcar"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={limpiarSeleccion}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                title="Limpiar selección"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="text-sm">
                <p className="font-semibold leading-tight">
                  {seleccionadosArr.length} lote{seleccionadosArr.length !== 1 ? 's' : ''} · {seleccionPzs} pzs
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {mismoProveedor
                    ? `Proveedor: ${seleccionadosArr[0]?.persona || '-'}`
                    : <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Mezcla de proveedores — selecciona uno
                      </span>}
                </p>
              </div>
            </div>
            <Button
              disabled={!mismoProveedor}
              onClick={() => setModalOpen(true)}
              className="gap-2"
              data-testid="btn-marcar-cobro"
            >
              <Tag className="h-4 w-4" />
              Marcar para cobro
            </Button>
          </div>
        </div>
      )}

      {/* Modal: Marcar para cobro */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-marcar">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Marcar para cobro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Proveedor</span>
                <span className="text-sm">{seleccionadosArr[0]?.persona || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Lotes</span>
                <span className="font-mono text-sm tabular-nums">{seleccionadosArr.length}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs text-muted-foreground">Total piezas</span>
                <span className="text-base tabular-nums">{seleccionPzs} <span className="text-xs text-muted-foreground">pzs</span></span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Motivo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
                placeholder="ej: vencido >7d, descontar en próxima factura"
                className="mt-1"
              />
            </div>
            <div className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md p-2.5 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p>
                Los lotes quedan visibles para Finanzas como "pendientes de cobro". Producción puede desmarcarlos antes de que Finanzas los procese.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarMarcar} disabled={submitting} className="gap-2">
              <Tag className="h-4 w-4" />
              {submitting ? 'Marcando...' : 'Confirmar marcaje'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Acción individual (desmarcar / cobrar / descobrar) */}
      <Dialog open={!!accionDialog} onOpenChange={(v) => !v && setAccionDialog(null)}>
        <DialogContent className="max-w-md">
          {accionDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {accionDialog.tipo === 'desmarcar' && <><X className="h-5 w-5 text-amber-600" />Desmarcar lote</>}
                  {accionDialog.tipo === 'cobrar' && <><CheckCircle2 className="h-5 w-5 text-emerald-600" />Marcar como cobrado</>}
                  {accionDialog.tipo === 'descobrar' && <><Ban className="h-5 w-5 text-red-600" />Revertir cobro</>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Corte</span><span className="font-mono">{accionDialog.lote.n_corte}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Proveedor</span><span>{accionDialog.lote.persona}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cantidad</span><span className="tabular-nums">{accionDialog.lote.enviado} pzs</span></div>
                </div>
                {accionDialog.tipo === 'cobrar' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs font-medium">Tipo comprobante</Label>
                      <select
                        className="mt-1 w-full h-9 rounded-md border bg-card px-3 text-sm"
                        value={accionForm.tipo_comprobante}
                        onChange={(e) => setAccionForm(f => ({ ...f, tipo_comprobante: e.target.value }))}
                      >
                        <option value="nota_descuento">Nota de descuento</option>
                        <option value="factura">Factura</option>
                        <option value="boleta">Boleta</option>
                        <option value="nota_credito">Nota de crédito</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">N° comprobante</Label>
                      <Input
                        className="mt-1"
                        value={accionForm.numero_comprobante}
                        onChange={(e) => setAccionForm(f => ({ ...f, numero_comprobante: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Fecha emisión</Label>
                      <Input
                        className="mt-1"
                        type="date"
                        value={accionForm.fecha_emision_comprobante}
                        onChange={(e) => setAccionForm(f => ({ ...f, fecha_emision_comprobante: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs font-medium">Observaciones</Label>
                      <Input
                        className="mt-1"
                        value={accionForm.observaciones}
                        onChange={(e) => setAccionForm(f => ({ ...f, observaciones: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                {(accionDialog.tipo === 'desmarcar' || accionDialog.tipo === 'descobrar') && (
                  <div>
                    <Label className="text-xs font-medium">
                      Motivo {accionDialog.tipo === 'descobrar' && <span className="text-red-600">*</span>}
                    </Label>
                    <Input
                      className="mt-1"
                      value={accionMotivo}
                      onChange={(e) => setAccionMotivo(e.target.value)}
                      placeholder={accionDialog.tipo === 'descobrar' ? 'Motivo de la reversión' : 'Opcional'}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAccionDialog(null)}>Cancelar</Button>
                <Button
                  onClick={ejecutarAccion}
                  variant={accionDialog.tipo === 'descobrar' ? 'destructive' : 'default'}
                >
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Pestaña: Cobrados ─────────────────────────────────────────────
const TabCobrados = ({ filas, onAccion }) => {
  const cobrados = useMemo(
    () => filas.filter(f => f.tipo_fila === 'ARREGLO' && f.estado_cobro === 'cobrado'),
    [filas],
  );
  if (!cobrados.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">Sin lotes cobrados todavía</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="grid grid-cols-[minmax(100px,0.8fr)_minmax(140px,1.4fr)_minmax(120px,1.2fr)_70px_minmax(140px,1.4fr)_minmax(150px,1fr)_44px] gap-3 items-center px-3 py-2 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
        <span>N°</span>
        <span>Modelo</span>
        <span>Proveedor</span>
        <span className="text-right">Cant.</span>
        <span>Comprobante</span>
        <span>Cobrado</span>
        <span></span>
      </div>
      <div className="divide-y">
        {cobrados.map(l => (
          <div key={l.arreglo_id} className="grid grid-cols-[minmax(100px,0.8fr)_minmax(140px,1.4fr)_minmax(120px,1.2fr)_70px_minmax(140px,1.4fr)_minmax(150px,1fr)_44px] gap-3 items-center px-3 py-2 text-sm hover:bg-muted/20">
            <span className="font-mono tabular-nums truncate">{l.n_corte}</span>
            <span className="truncate">{l.modelo || l.linea_negocio || '—'}</span>
            <span className="truncate">{l.persona || '—'}</span>
            <span className="text-right tabular-nums">{l.enviado} <span className="text-[10px] text-muted-foreground">pzs</span></span>
            <span className="truncate text-xs">
              {l.tipo_comprobante ? <span className="text-muted-foreground">{l.tipo_comprobante}</span> : '—'}
              {l.numero_comprobante && <span className="ml-1 font-mono">{l.numero_comprobante}</span>}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {l.cobrado_por_nombre || '—'} · {fmtDM(l.fecha_cobro)}
            </span>
            <button
              type="button"
              onClick={() => onAccion(l, 'descobrar')}
              className="h-7 w-7 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 transition-colors flex items-center justify-center"
              title="Revertir cobro"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────
export const ControlFallados = () => {
  const [tab, setTab] = useState('por_cobrar');
  const [filtro, setFiltro] = useState('todos');
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accionDialog, setAccionDialog] = useState(null);
  const [accionMotivo, setAccionMotivo] = useState('');

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/fallados-control?solo_vencidos=true`, { headers: hdrs() });
      setFilas(res.data.filas || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const cobradosCount = filas.filter(f => f.tipo_fila === 'ARREGLO' && f.estado_cobro === 'cobrado').length;

  const handleExportar = async () => {
    try {
      const res = await axios.get(`${API}/fallados-control/export`, {
        headers: hdrs(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fallados_arreglos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo exportar');
    }
  };

  // Acción desde tab Cobrados (descobrar)
  const abrirAccionCobrados = (lote, tipo) => {
    setAccionDialog({ lote, tipo });
    setAccionMotivo('');
  };

  const ejecutarAccionCobrados = async () => {
    if (!accionDialog) return;
    if (accionDialog.tipo === 'descobrar' && !accionMotivo.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    try {
      await axios.post(`${API}/arreglos/${accionDialog.lote.arreglo_id}/descobrar`,
        { motivo: accionMotivo }, { headers: hdrs() });
      toast.success('Cobro revertido');
      setAccionDialog(null);
      refreshAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error');
    }
  };

  if (loading && !filas.length) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="control-fallados">
      {/* Tabs + Excel */}
      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('por_cobrar')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'por_cobrar' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Por cobrar
          {tab === 'por_cobrar' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button
          type="button"
          onClick={() => setTab('cobrados')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'cobrados' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          Cobrados
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
            {cobradosCount}
          </span>
          {tab === 'cobrados' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleExportar} className="h-8 gap-1.5" title="Exportar Excel">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={refreshAll} className="h-8 w-8 p-0" title="Refrescar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {tab === 'por_cobrar' && (
        <TabPorCobrar filas={filas} refreshAll={refreshAll} filtro={filtro} onCambiarFiltro={setFiltro} />
      )}
      {tab === 'cobrados' && (
        <TabCobrados filas={filas} onAccion={abrirAccionCobrados} />
      )}

      {/* Modal descobrar desde tab Cobrados */}
      <Dialog open={!!accionDialog} onOpenChange={(v) => !v && setAccionDialog(null)}>
        <DialogContent className="max-w-sm">
          {accionDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-red-600" />
                  Revertir cobro
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Corte <span className="font-mono">{accionDialog.lote.n_corte}</span> · {accionDialog.lote.persona} · {accionDialog.lote.enviado} pzs.
                  Vuelve al estado "Marcado".
                </p>
                <div>
                  <Label className="text-xs font-medium">Motivo <span className="text-red-600">*</span></Label>
                  <Input
                    className="mt-1"
                    value={accionMotivo}
                    onChange={(e) => setAccionMotivo(e.target.value)}
                    placeholder="ej: comprobante anulado"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAccionDialog(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={ejecutarAccionCobrados} className="gap-2">
                  <Ban className="h-4 w-4" />
                  Revertir
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
