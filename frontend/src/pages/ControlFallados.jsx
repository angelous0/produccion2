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
  FileText, ClipboardList, ExternalLink, Ban,
  AlertCircle, Users, CheckCircle2,
  Droplets, Scissors, Sparkles, Palette, Package, Wrench,
  ArrowRight, AlertTriangle, X,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Checkbox con estilo sutil (borde gris claro, fondo blanco hasta marcar).
const SoftCheckbox = ({ checked, onCheckedChange, ...rest }) => (
  <Checkbox
    checked={checked}
    onCheckedChange={onCheckedChange}
    className="h-5 w-5 rounded-[5px] border-[1.5px] border-zinc-400 dark:border-zinc-500 bg-white dark:bg-zinc-900 shadow-none transition-colors hover:border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary"
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

// Iniciales para avatar
const iniciales = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Color paleta determinístico por nombre (hash simple)
const colorFromName = (name) => {
  const palette = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  ];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

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

// Días vencido con escala de color
const DiasBadge = ({ dias }) => {
  let cls = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  if (dias >= 15) cls = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  else if (dias >= 8) cls = 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${cls}`}>
      {dias}d
    </span>
  );
};

// ─── Pestaña: Por cobrar ─────────────────────────────────────────────────
const TabPorCobrar = ({ filas, refreshAll }) => {
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [grupoExpandido, setGrupoExpandido] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Solo arreglos VENCIDOS, no completados, no en nota activa.
  const elegibles = useMemo(() => filas.filter(f =>
    f.tipo_fila === 'ARREGLO' &&
    f.estado === 'VENCIDO' &&
    !f.nota_cobro,
  ), [filas]);

  // Agrupar por persona (proveedor)
  const grupos = useMemo(() => {
    const m = new Map();
    for (const f of elegibles) {
      const key = f.persona_id || `__sin_persona_${f.persona || 'Sin proveedor'}`;
      const name = f.persona || 'Sin proveedor';
      if (!m.has(key)) m.set(key, { key, persona_id: f.persona_id, persona: name, lotes: [], totalPzs: 0, maxDias: 0 });
      const g = m.get(key);
      g.lotes.push(f);
      g.totalPzs += f.enviado || 0;
      if ((f.dias || 0) > g.maxDias) g.maxDias = f.dias || 0;
    }
    // Ordenar por mayor antigüedad primero
    return Array.from(m.values()).sort((a, b) => b.maxDias - a.maxDias || a.persona.localeCompare(b.persona));
  }, [elegibles]);

  // Auto-expandir grupos por defecto (solo grupos nuevos)
  useEffect(() => {
    setGrupoExpandido(prev => {
      const next = { ...prev };
      for (const g of grupos) {
        if (!(g.key in next)) next[g.key] = true;
      }
      return next;
    });
  }, [grupos]);

  // KPIs derivados
  const totalProveedores = grupos.length;
  const totalLotes = elegibles.length;
  const totalPzsPorCobrar = elegibles.reduce((acc, f) => acc + (f.enviado || 0), 0);

  // Validación seleccionados
  const seleccionadosArr = useMemo(() =>
    elegibles.filter(f => seleccionados.has(f.arreglo_id)),
    [elegibles, seleccionados],
  );
  const proveedoresSeleccionados = useMemo(() =>
    new Set(seleccionadosArr.map(s => s.persona_id || s.persona)),
    [seleccionadosArr],
  );
  const seleccionPzs = seleccionadosArr.reduce((acc, s) => acc + (s.enviado || 0), 0);
  const mismosProveedores = proveedoresSeleccionados.size <= 1;

  const toggleSel = (arregloId) => {
    setSeleccionados(prev => {
      const n = new Set(prev);
      if (n.has(arregloId)) n.delete(arregloId);
      else n.add(arregloId);
      return n;
    });
  };

  const toggleGrupo = (key) => {
    setGrupoExpandido(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const seleccionarGrupo = (g) => {
    setSeleccionados(prev => {
      const n = new Set(prev);
      const todosSeleccionados = g.lotes.every(l => n.has(l.arreglo_id));
      if (todosSeleccionados) {
        for (const l of g.lotes) n.delete(l.arreglo_id);
      } else {
        for (const l of g.lotes) n.add(l.arreglo_id);
      }
      return n;
    });
  };

  const limpiarSeleccion = () => setSeleccionados(new Set());

  const handleGenerar = async () => {
    if (!seleccionadosArr.length) return;
    if (!mismosProveedores) {
      toast.error('Selecciona envíos de un solo proveedor por nota');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/notas-cobro`, {
        arreglo_ids: seleccionadosArr.map(s => s.arreglo_id),
        observacion: observacion || null,
      }, { headers: hdrs() });
      toast.success(`Nota ${res.data.numero} generada · ${res.data.total_pzs} pzs`);
      setSeleccionados(new Set());
      setObservacion('');
      setModalOpen(false);
      refreshAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error al generar nota');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Por cobrar */}
        <div className="relative overflow-hidden rounded-xl border border-red-200/70 dark:border-red-900/50 bg-gradient-to-br from-red-50 to-rose-50/50 dark:from-red-950/40 dark:to-rose-950/20 px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-red-700/80 dark:text-red-300/80 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Por cobrar
              </p>
              <p className="text-3xl font-bold text-red-700 dark:text-red-300 mt-1 tabular-nums leading-none">
                {totalPzsPorCobrar}
                <span className="text-base font-medium ml-1">pzs</span>
              </p>
              <p className="text-[11px] text-red-700/70 dark:text-red-300/70 mt-1">
                {totalLotes} lote{totalLotes !== 1 ? 's' : ''} vencido{totalLotes !== 1 ? 's' : ''}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-300/50 dark:text-red-700/40" />
          </div>
        </div>

        {/* Proveedores */}
        <div className="relative overflow-hidden rounded-xl border bg-card px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                Proveedores
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums leading-none">{totalProveedores}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                con envíos pendientes
              </p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground/20" />
          </div>
        </div>

        {/* Selección actual */}
        <div className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-colors ${
          seleccionadosArr.length === 0
            ? 'bg-card'
            : mismosProveedores
              ? 'border-blue-300/70 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/30'
              : 'border-amber-300/70 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 ${
                seleccionadosArr.length > 0 && mismosProveedores
                  ? 'text-blue-700/80 dark:text-blue-300/80'
                  : seleccionadosArr.length > 0 && !mismosProveedores
                    ? 'text-amber-700/80 dark:text-amber-300/80'
                    : 'text-muted-foreground'
              }`}>
                <CheckCircle2 className="h-3 w-3" />
                Selección actual
              </p>
              <p className="text-3xl font-bold mt-1 tabular-nums leading-none">
                {seleccionadosArr.length}
                <span className="text-base font-medium ml-1">lote{seleccionadosArr.length !== 1 ? 's' : ''}</span>
              </p>
              <p className="text-[11px] mt-1">
                {!mismosProveedores ? (
                  <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Distintos proveedores
                  </span>
                ) : (
                  <span className="text-muted-foreground">{seleccionPzs} pzs</span>
                )}
              </p>
            </div>
            <CheckCircle2 className={`h-8 w-8 ${
              seleccionadosArr.length > 0 && mismosProveedores
                ? 'text-blue-300/60 dark:text-blue-700/50'
                : 'text-muted-foreground/20'
            }`} />
          </div>
        </div>
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500/60 mb-2" />
            <p className="text-sm font-medium">No hay envíos vencidos pendientes de cobro</p>
            <p className="text-xs text-muted-foreground mt-1">Todo al día. Buen trabajo.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {grupos.map(g => {
            const allSel = g.lotes.every(l => seleccionados.has(l.arreglo_id));
            const someSel = g.lotes.some(l => seleccionados.has(l.arreglo_id));
            const expanded = grupoExpandido[g.key] !== false;
            const avatarCls = colorFromName(g.persona);
            return (
              <div
                key={g.key}
                className={`overflow-hidden rounded-xl border bg-card transition-shadow ${
                  someSel ? 'ring-1 ring-blue-300 dark:ring-blue-800 shadow-sm' : ''
                }`}
              >
                {/* Header del grupo */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none hover:bg-muted/40 transition-colors"
                  onClick={() => toggleGrupo(g.key)}
                  data-testid={`grupo-${g.key}`}
                >
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
                  />
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                    <SoftCheckbox
                      checked={allSel ? true : (someSel ? 'indeterminate' : false)}
                      onCheckedChange={() => seleccionarGrupo(g)}
                      aria-label={`Seleccionar todos los lotes de ${g.persona}`}
                    />
                  </div>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${avatarCls}`}>
                    {iniciales(g.persona)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate leading-tight">{g.persona}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {g.lotes.length} lote{g.lotes.length !== 1 ? 's' : ''} · {g.totalPzs} pzs
                    </p>
                  </div>
                  <DiasBadge dias={g.maxDias} />
                </div>

                {/* Lotes */}
                {expanded && (
                  <div className="divide-y border-t bg-muted/20 dark:bg-zinc-900/30">
                    {g.lotes.map(l => {
                      const sel = seleccionados.has(l.arreglo_id);
                      const yaMarcado = l.marcado_para_cobro;
                      return (
                        <div
                          key={l.arreglo_id}
                          onClick={() => toggleSel(l.arreglo_id)}
                          className={`relative flex items-center gap-3 pl-3 pr-3 py-2.5 cursor-pointer transition-colors ${
                            sel
                              ? 'bg-blue-50 dark:bg-blue-950/40'
                              : 'hover:bg-muted/50 dark:hover:bg-zinc-800/40'
                          }`}
                          data-testid={`lote-${l.arreglo_id}`}
                        >
                          {sel && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                          <div onClick={(e) => e.stopPropagation()} className="flex items-center ml-5">
                            <SoftCheckbox
                              checked={sel}
                              onCheckedChange={() => toggleSel(l.arreglo_id)}
                              aria-label={`Seleccionar lote ${l.n_corte}`}
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[11px] text-muted-foreground">N°</span>
                            <span className="font-mono font-bold text-sm tabular-nums tracking-tight">
                              {l.n_corte}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 shrink-0 w-16">
                            <span className="font-bold text-base tabular-nums">{l.enviado}</span>
                            <span className="text-[10px] text-muted-foreground">pzs</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <ServicioBadge nombre={l.servicio} />
                            {l.modelo && (
                              <span className="text-[10px] text-muted-foreground/70 ml-2 truncate">
                                · {l.modelo}
                              </span>
                            )}
                          </div>
                          {yaMarcado && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">
                              MARCADO
                            </span>
                          )}
                          <DiasBadge dias={l.dias} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Barra inferior fija con CTA */}
      {seleccionadosArr.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          data-testid="barra-generar"
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
                  {mismosProveedores
                    ? `Proveedor: ${seleccionadosArr[0]?.persona || '-'}`
                    : <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Mezcla de proveedores — selecciona uno
                      </span>
                  }
                </p>
              </div>
            </div>
            <Button
              disabled={!mismosProveedores}
              onClick={() => setModalOpen(true)}
              className="gap-2"
              data-testid="btn-generar-nota"
            >
              Generar Nota
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-generar-nota">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generar nota de cobro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Proveedor</span>
                <div className="flex items-center gap-2">
                  <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${colorFromName(seleccionadosArr[0]?.persona || '')}`}>
                    {iniciales(seleccionadosArr[0]?.persona || '')}
                  </span>
                  <span className="font-semibold">{seleccionadosArr[0]?.persona || '-'}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Lotes incluidos</span>
                <span className="font-mono font-semibold tabular-nums">{seleccionadosArr.length}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs text-muted-foreground">Total piezas</span>
                <span className="font-bold text-lg tabular-nums">{seleccionPzs} <span className="text-xs font-normal text-muted-foreground">pzs</span></span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Observación <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                maxLength={500}
                placeholder="ej: descontar de próxima factura"
                data-testid="input-nota-observacion"
                className="mt-1"
              />
            </div>
            <div className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-md p-2.5 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
              <p>
                Los envíos quedan vinculados a la nota. Si necesitas revertir, puedes anular la nota desde "Notas emitidas".
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerar} disabled={submitting} data-testid="btn-confirmar-nota" className="gap-2">
              {submitting ? 'Generando...' : (<>Confirmar y generar <ArrowRight className="h-4 w-4" /></>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Pestaña: Notas emitidas ─────────────────────────────────────────────
const TabNotasEmitidas = ({ notas, onAnular, onVer }) => {
  if (!notas.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">Sin notas emitidas todavía</p>
          <p className="text-xs text-muted-foreground mt-1">Las notas que generes aparecerán aquí.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2.5">
      {notas.map(n => {
        const isAnulada = n.estado === 'anulada';
        const avatarCls = colorFromName(n.proveedor_nombre);
        return (
          <div
            key={n.id}
            className={`group relative overflow-hidden rounded-xl border bg-card p-3 flex items-center gap-3 transition-all hover:shadow-sm ${
              isAnulada ? 'opacity-60' : ''
            }`}
            data-testid={`nota-${n.id}`}
          >
            {!isAnulada && <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
            {isAnulada && <span className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-300 dark:bg-zinc-700" />}

            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ml-1 ${avatarCls}`}>
              {iniciales(n.proveedor_nombre)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm tracking-tight">{n.numero}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isAnulada
                    ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}>{n.estado.toUpperCase()}</span>
                <span className="text-[11px] text-muted-foreground">{fmtFecha(n.fecha)}</span>
              </div>
              <p className="text-sm font-medium truncate leading-tight mt-0.5">{n.proveedor_nombre}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {n.total_lotes} lote{n.total_lotes !== 1 ? 's' : ''} · <strong className="text-foreground tabular-nums">{n.total_pzs} pzs</strong>
                {n.observacion && <span className="italic"> · {n.observacion}</span>}
              </p>
              {isAnulada && n.motivo_anulacion && (
                <p className="text-[10px] italic text-muted-foreground/80 mt-0.5">
                  Anulada: {n.motivo_anulacion}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onVer(n)}
              data-testid={`btn-ver-nota-${n.id}`}
              title="Ver detalle"
              className="shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            {!isAnulada && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                onClick={() => onAnular(n)}
                data-testid={`btn-anular-nota-${n.id}`}
                title="Anular"
              >
                <Ban className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────
export const ControlFallados = () => {
  const [tab, setTab] = useState('por_cobrar');
  const [filas, setFilas] = useState([]);
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalleNota, setDetalleNota] = useState(null);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [anularDialog, setAnularDialog] = useState(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [fc, nc] = await Promise.allSettled([
        axios.get(`${API}/fallados-control?solo_vencidos=true`, { headers: hdrs() }),
        axios.get(`${API}/notas-cobro`, { headers: hdrs() }),
      ]);
      if (fc.status === 'fulfilled') setFilas(fc.value.data.filas || []);
      if (nc.status === 'fulfilled') setNotas(nc.value.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handleVerNota = async (n) => {
    try {
      const res = await axios.get(`${API}/notas-cobro/${n.id}`, { headers: hdrs() });
      setDetalleNota(res.data);
    } catch {
      toast.error('No se pudo cargar el detalle');
    }
  };

  const handleAnular = (n) => {
    setAnularDialog(n);
    setMotivoAnular('');
  };

  const confirmarAnular = async () => {
    if (!anularDialog) return;
    try {
      await axios.post(`${API}/notas-cobro/${anularDialog.id}/anular`,
        { motivo: motivoAnular || null }, { headers: hdrs() });
      toast.success(`Nota ${anularDialog.numero} anulada`);
      setAnularDialog(null);
      setMotivoAnular('');
      refreshAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error al anular');
    }
  };

  const notasActivas = notas.filter(n => n.estado === 'activa').length;

  if (loading && !filas.length && !notas.length) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="control-fallados">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('por_cobrar')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'por_cobrar'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-por-cobrar"
        >
          <ClipboardList className="h-4 w-4" />
          Por cobrar
          {tab === 'por_cobrar' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('notas')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'notas'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-notas-emitidas"
        >
          <FileText className="h-4 w-4" />
          Notas emitidas
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
            {notasActivas}{notas.length > notasActivas ? `/${notas.length}` : ''}
          </span>
          {tab === 'notas' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <Button variant="ghost" size="sm" onClick={refreshAll} className="ml-auto h-8 w-8 p-0" data-testid="btn-refresh" title="Refrescar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {tab === 'por_cobrar' && (
        <TabPorCobrar filas={filas} refreshAll={refreshAll} />
      )}
      {tab === 'notas' && (
        <TabNotasEmitidas notas={notas} onAnular={handleAnular} onVer={handleVerNota} />
      )}

      {/* Modal detalle de nota */}
      <Dialog open={!!detalleNota} onOpenChange={(v) => !v && setDetalleNota(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-detalle-nota">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-mono">{detalleNota?.numero}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                detalleNota?.estado === 'anulada'
                  ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}>
                {detalleNota?.estado?.toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detalleNota && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-mono">{fmtFecha(detalleNota.fecha)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Proveedor</span>
                  <div className="flex items-center gap-2">
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold ${colorFromName(detalleNota.proveedor_nombre)}`}>
                      {iniciales(detalleNota.proveedor_nombre)}
                    </span>
                    <span className="font-semibold">{detalleNota.proveedor_nombre}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lotes</span>
                  <span className="font-mono">{detalleNota.total_lotes}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">Total piezas</span>
                  <span className="font-bold text-base tabular-nums">{detalleNota.total_pzs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Creada por</span>
                  <span>{detalleNota.created_by_nombre || '-'}</span>
                </div>
                {detalleNota.observacion && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Observación</p>
                    <p className="italic">{detalleNota.observacion}</p>
                  </div>
                )}
                {detalleNota.estado === 'anulada' && detalleNota.motivo_anulacion && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">Motivo de anulación</p>
                    <p className="italic text-red-700 dark:text-red-400">{detalleNota.motivo_anulacion}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Lotes incluidos</p>
                <div className="border rounded-lg divide-y bg-card overflow-hidden">
                  {(detalleNota.lotes || []).map(l => (
                    <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">N°</span>
                        <span className="font-mono font-bold tabular-nums">{l.n_corte}</span>
                      </div>
                      <div className="flex items-baseline gap-1 w-12">
                        <span className="font-bold tabular-nums">{l.cantidad}</span>
                        <span className="text-[10px] text-muted-foreground">pzs</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <ServicioBadge nombre={l.servicio_nombre} />
                        <span className="text-[10px] text-muted-foreground/80 ml-2">· {l.persona_nombre}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                        vence {fmtDM(l.fecha_limite)}
                      </span>
                      <DiasBadge dias={l.dias_vencido || 0} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal anular */}
      <Dialog open={!!anularDialog} onOpenChange={(v) => !v && setAnularDialog(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-anular-nota">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />
              Anular nota <span className="font-mono">{anularDialog?.numero}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <p className="text-red-900 dark:text-red-200">
                Se desmarcarán los <strong>{anularDialog?.total_lotes} lote{anularDialog?.total_lotes !== 1 ? 's' : ''}</strong>
                {' '}(<strong>{anularDialog?.total_pzs} pzs</strong>) y volverán a "Por cobrar".
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Motivo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={motivoAnular}
                onChange={(e) => setMotivoAnular(e.target.value)}
                maxLength={500}
                placeholder="ej: error en selección"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarAnular} data-testid="btn-confirmar-anular" className="gap-2">
              <Ban className="h-4 w-4" />
              Anular nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
