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
  RefreshCw, ChevronDown, ChevronRight,
  FileText, ClipboardList, ExternalLink, Ban,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

// ─── Pestaña: Por cobrar ─────────────────────────────────────────────────
const TabPorCobrar = ({ filas, refreshAll }) => {
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [grupoExpandido, setGrupoExpandido] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Solo arreglos VENCIDOS, no completados, no en nota activa.
  // Si ya están marcados (pero todavía no en nota), también los muestro.
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
      if (!m.has(key)) m.set(key, { key, persona_id: f.persona_id, persona: name, lotes: [], totalPzs: 0 });
      m.get(key).lotes.push(f);
      m.get(key).totalPzs += f.enviado || 0;
    }
    return Array.from(m.values()).sort((a, b) => a.persona.localeCompare(b.persona));
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
  const totalPzsPorCobrar = elegibles.reduce((acc, f) => acc + (f.enviado || 0), 0);

  // Validación seleccionados: todos del mismo proveedor
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
    <div className="space-y-3 pb-24">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-300 font-semibold">Por cobrar</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-0.5">{totalPzsPorCobrar} pzs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Proveedores</p>
            <p className="text-2xl font-bold mt-0.5">{totalProveedores}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Selección actual</p>
            <p className="text-2xl font-bold mt-0.5">
              {seleccionadosArr.length} lote{seleccionadosArr.length !== 1 ? 's' : ''} · {seleccionPzs} pzs
            </p>
            {!mismosProveedores && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                ⚠ Distintos proveedores — selecciona uno a la vez
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            ✓ No hay envíos vencidos pendientes de cobro
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {grupos.map(g => {
            const allSel = g.lotes.every(l => seleccionados.has(l.arreglo_id));
            const someSel = g.lotes.some(l => seleccionados.has(l.arreglo_id));
            const expanded = grupoExpandido[g.key] !== false;
            return (
              <Card key={g.key} className="overflow-hidden">
                {/* Header del grupo */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 dark:bg-zinc-900/40 cursor-pointer select-none"
                  onClick={() => toggleGrupo(g.key)}
                  data-testid={`grupo-${g.key}`}
                >
                  {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Checkbox
                    checked={allSel ? true : (someSel ? 'indeterminate' : false)}
                    onCheckedChange={() => seleccionarGrupo(g)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Seleccionar todos los lotes de ${g.persona}`}
                  />
                  <span className="font-semibold text-sm flex-1">{g.persona}</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {g.lotes.length} lote{g.lotes.length !== 1 ? 's' : ''} · <span className="text-foreground font-semibold">{g.totalPzs} pzs</span>
                  </span>
                </div>
                {/* Lotes */}
                {expanded && (
                  <div className="divide-y">
                    {g.lotes.map(l => {
                      const sel = seleccionados.has(l.arreglo_id);
                      const yaMarcado = l.marcado_para_cobro;
                      return (
                        <div
                          key={l.arreglo_id}
                          className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors ${sel ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}
                          data-testid={`lote-${l.arreglo_id}`}
                        >
                          <Checkbox
                            checked={sel}
                            onCheckedChange={() => toggleSel(l.arreglo_id)}
                            aria-label={`Seleccionar lote ${l.n_corte}`}
                          />
                          <span className="font-mono font-bold w-12 shrink-0">{l.n_corte}</span>
                          <span className="font-semibold w-12 text-right shrink-0">{l.enviado}</span>
                          <span className="text-xs text-muted-foreground flex-1 truncate">
                            {l.servicio}
                            {l.modelo ? ` · ${l.modelo}` : ''}
                          </span>
                          {yaMarcado && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">
                              MARCADO
                            </span>
                          )}
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 whitespace-nowrap">
                            {l.dias}d
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Barra inferior fija con CTA */}
      {seleccionadosArr.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-lg" data-testid="barra-generar">
          <div className="text-sm">
            <strong>{seleccionadosArr.length} lote{seleccionadosArr.length !== 1 ? 's' : ''} · {seleccionPzs} pzs</strong> seleccionados
            {!mismosProveedores && <span className="text-amber-200 text-xs ml-2">⚠ Mezcla de proveedores</span>}
          </div>
          <Button
            variant="secondary"
            disabled={!mismosProveedores}
            onClick={() => setModalOpen(true)}
            data-testid="btn-generar-nota"
          >
            Generar Nota →
          </Button>
        </div>
      )}

      {/* Modal de confirmación */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-generar-nota">
          <DialogHeader>
            <DialogTitle>Generar nota de cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-muted/40 rounded-md p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proveedor:</span>
                <span className="font-semibold">{seleccionadosArr[0]?.persona || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lotes:</span>
                <span className="font-mono">{seleccionadosArr.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total piezas:</span>
                <span className="font-mono font-bold">{seleccionPzs} pzs</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Observación (opcional)</Label>
              <Input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                maxLength={500}
                placeholder="ej: descontar de próxima factura"
                data-testid="input-nota-observacion"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Esta acción marca los envíos como pendientes de cobro y los vincula a la nota.
              Si necesitas revertir, puedes anular la nota en la pestaña "Notas emitidas".
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerar} disabled={submitting} data-testid="btn-confirmar-nota">
              {submitting ? 'Generando...' : 'Confirmar y generar'}
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
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Sin notas emitidas todavía
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {notas.map(n => {
        const isAnulada = n.estado === 'anulada';
        return (
          <Card key={n.id} className={isAnulada ? 'opacity-60' : ''} data-testid={`nota-${n.id}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-base">{n.numero}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                    isAnulada
                      ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  }`}>{n.estado.toUpperCase()}</span>
                  <span className="text-xs text-muted-foreground">{fmtFecha(n.fecha)}</span>
                </div>
                <p className="text-sm mt-0.5 truncate">{n.proveedor_nombre}</p>
                <p className="text-[11px] text-muted-foreground">
                  {n.total_lotes} lote{n.total_lotes !== 1 ? 's' : ''} · <strong>{n.total_pzs} pzs</strong>
                  {n.observacion && ` · ${n.observacion}`}
                </p>
                {isAnulada && n.motivo_anulacion && (
                  <p className="text-[10px] italic text-muted-foreground mt-0.5">
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
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              {!isAnulada && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => onAnular(n)}
                  data-testid={`btn-anular-nota-${n.id}`}
                  title="Anular"
                >
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
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
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-3" data-testid="control-fallados">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('por_cobrar')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'por_cobrar'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-por-cobrar"
        >
          <ClipboardList className="h-3.5 w-3.5 inline-block mr-1.5" />
          Por cobrar
        </button>
        <button
          type="button"
          onClick={() => setTab('notas')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'notas'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-notas-emitidas"
        >
          <FileText className="h-3.5 w-3.5 inline-block mr-1.5" />
          Notas emitidas ({notasActivas}{notas.length > notasActivas ? ` / ${notas.length}` : ''})
        </button>
        <Button variant="ghost" size="sm" onClick={refreshAll} className="ml-auto" data-testid="btn-refresh">
          <RefreshCw className="h-3.5 w-3.5" />
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
            <DialogTitle>
              {detalleNota?.numero}
              <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-md align-middle ${
                detalleNota?.estado === 'anulada'
                  ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}>
                {detalleNota?.estado?.toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detalleNota && (
            <div className="space-y-3 text-sm">
              <div className="bg-muted/40 rounded-md p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Fecha:</span>
                <span className="font-mono">{fmtFecha(detalleNota.fecha)}</span>
                <span className="text-muted-foreground">Proveedor:</span>
                <span className="font-semibold">{detalleNota.proveedor_nombre}</span>
                <span className="text-muted-foreground">Lotes:</span>
                <span className="font-mono">{detalleNota.total_lotes}</span>
                <span className="text-muted-foreground">Total piezas:</span>
                <span className="font-mono font-bold">{detalleNota.total_pzs}</span>
                <span className="text-muted-foreground">Creada por:</span>
                <span>{detalleNota.created_by_nombre || '-'}</span>
                {detalleNota.observacion && (
                  <>
                    <span className="text-muted-foreground">Observación:</span>
                    <span>{detalleNota.observacion}</span>
                  </>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Lotes incluidos:</p>
                <div className="border rounded-md divide-y">
                  {(detalleNota.lotes || []).map(l => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="font-mono font-bold w-12">{l.n_corte}</span>
                      <span className="font-semibold w-10 text-right">{l.cantidad}</span>
                      <span className="text-muted-foreground flex-1 truncate">
                        {l.servicio_nombre} · {l.persona_nombre}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        vence {fmtDM(l.fecha_limite)} · {l.dias_vencido}d
                      </span>
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
            <DialogTitle>Anular nota {anularDialog?.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Se desmarcarán los {anularDialog?.total_lotes} lote{anularDialog?.total_lotes !== 1 ? 's' : ''}
              {' '}({anularDialog?.total_pzs} pzs) y volverán a aparecer en "Por cobrar".
            </p>
            <div>
              <Label className="text-xs">Motivo (opcional)</Label>
              <Input
                value={motivoAnular}
                onChange={(e) => setMotivoAnular(e.target.value)}
                maxLength={500}
                placeholder="ej: error en selección, falta agregar otro lote"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarAnular} data-testid="btn-confirmar-anular">
              Anular nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
