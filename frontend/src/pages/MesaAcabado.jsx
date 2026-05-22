import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import {
  Search, Plus, RefreshCw,
  Wrench, Layers as LayersIcon,
  ClipboardCheck, Loader2, X,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtN = (n) => Number(n || 0).toLocaleString('es-PE');

// ─── KPI card compacta ──────────────────────────────────────────
const Kpi = ({ label, value, sub, tone = 'default' }) => {
  const toneCls = {
    default: 'text-foreground',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
  }[tone] || 'text-foreground';
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
      <p className={`text-2xl mt-1 tabular-nums leading-none ${toneCls}`}>
        {fmtN(value)}
        {sub && <span className="text-sm text-muted-foreground ml-1.5">{sub}</span>}
      </p>
    </div>
  );
};

// ─── Quick-add fallado drawer ───────────────────────────────────
const QuickAddDrawer = ({ open, corte, onClose, onSaved, servicios, personas }) => {
  const [form, setForm] = useState({
    cantidad_detectada: '',
    causa: 'servicio',
    fecha_deteccion: new Date().toISOString().slice(0, 10),
    observacion: '',
    servicio_id: '',
    persona_id: '',
    fecha_envio: new Date().toISOString().slice(0, 10),
    fecha_limite: '',
  });
  const [saving, setSaving] = useState(false);
  const cantidadRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm({
        cantidad_detectada: '',
        causa: 'servicio',
        fecha_deteccion: new Date().toISOString().slice(0, 10),
        observacion: '',
        servicio_id: '',
        persona_id: '',
        fecha_envio: new Date().toISOString().slice(0, 10),
        fecha_limite: '',
      });
      setTimeout(() => cantidadRef.current?.focus(), 80);
    }
  }, [open, corte?.id]);

  const personasFiltradas = useMemo(() => {
    if (!form.servicio_id) return personas;
    return personas.filter(p => !p.servicio_id || p.servicio_id === form.servicio_id);
  }, [personas, form.servicio_id]);

  const handleGuardar = async (continuar = false) => {
    if (!corte) return;
    const cant = parseInt(form.cantidad_detectada);
    if (!cant || cant <= 0) {
      toast.error('Indica una cantidad > 0');
      return;
    }
    setSaving(true);
    try {
      // 1) Crear el fallado
      const falladoRes = await axios.post(`${API}/fallados`, {
        registro_id: corte.id,
        cantidad_detectada: cant,
        causa: form.causa,
        fecha_deteccion: form.fecha_deteccion || null,
        observacion: form.observacion || null,
      }, { headers: hdrs() });

      // 2) Si causa=servicio Y eligió servicio/persona/fecha_limite → crear el envío a arreglo
      if (form.causa === 'servicio' && form.servicio_id && form.fecha_limite) {
        await axios.post(`${API}/registros/${corte.id}/arreglos`, {
          cantidad: cant,
          servicio_id: form.servicio_id || null,
          persona_id: form.persona_id || null,
          fecha_envio: form.fecha_envio || null,
          fecha_limite: form.fecha_limite,
          observacion: form.observacion || null,
        }, { headers: hdrs() });
        toast.success(`Fallado + envío a ${form.causa === 'servicio' ? 'arreglo' : 'tela'} registrados`);
      } else {
        toast.success('Fallado registrado');
      }

      if (continuar) {
        // limpiar y mantener abierto en el mismo corte
        setForm(f => ({ ...f, cantidad_detectada: '', observacion: '' }));
        setTimeout(() => cantidadRef.current?.focus(), 50);
        onSaved(corte.id, true);
      } else {
        onSaved(corte.id, false);
        onClose();
      }
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b space-y-1">
          <DialogTitle className="text-base">Registrar fallado</DialogTitle>
          <DialogDescription className="text-xs">
            {corte ? <>Corte <span className="font-mono font-medium text-foreground">{corte.n_corte}</span> · {corte.modelo}</> : '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <Label className="text-xs font-medium">Cantidad detectada *</Label>
            <Input
              ref={cantidadRef}
              type="number"
              min={1}
              max={corte?.prendas || 9999}
              value={form.cantidad_detectada}
              onChange={(e) => setForm({ ...form, cantidad_detectada: e.target.value })}
              placeholder="¿Cuántas prendas?"
              className="mt-1"
              data-testid="qa-cantidad"
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Causa *</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setForm({ ...form, causa: 'servicio' })}
                className={`text-xs px-2 py-2.5 rounded-md border flex items-center justify-center gap-1.5 transition-colors ${
                  form.causa === 'servicio'
                    ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-400 text-violet-900 dark:text-violet-200'
                    : 'bg-background border-input hover:bg-muted'
                }`}
                data-testid="qa-causa-servicio"
              >
                <Wrench className="h-3.5 w-3.5" /> Servicio
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, causa: 'tela' })}
                className={`text-xs px-2 py-2.5 rounded-md border flex items-center justify-center gap-1.5 transition-colors ${
                  form.causa === 'tela'
                    ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-900 dark:text-blue-200'
                    : 'bg-background border-input hover:bg-muted'
                }`}
                data-testid="qa-causa-tela"
              >
                <LayersIcon className="h-3.5 w-3.5" /> Tela
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              {form.causa === 'tela'
                ? 'No va a proveedor. Queda en buzón interno de Acabado para evaluación.'
                : 'Va a un proveedor para arreglo (flujo estándar).'}
            </p>
          </div>

          {/* Servicio + Persona + fechas SOLO si causa=servicio */}
          {form.causa === 'servicio' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium">Servicio</Label>
                  <Select
                    value={form.servicio_id || '_none'}
                    onValueChange={(v) => setForm({ ...form, servicio_id: v === '_none' ? '' : v, persona_id: '' })}
                  >
                    <SelectTrigger className="h-9 text-xs mt-1" data-testid="qa-servicio">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sin asignar</SelectItem>
                      {servicios.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium">Persona</Label>
                  <Select
                    value={form.persona_id || '_none'}
                    onValueChange={(v) => setForm({ ...form, persona_id: v === '_none' ? '' : v })}
                  >
                    <SelectTrigger className="h-9 text-xs mt-1" data-testid="qa-persona">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sin asignar</SelectItem>
                      {personasFiltradas.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium">Fecha envío</Label>
                  <Input
                    type="date"
                    value={form.fecha_envio}
                    onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })}
                    className="mt-1 text-xs"
                    data-testid="qa-fecha-envio"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Vence</Label>
                  <Input
                    type="date"
                    value={form.fecha_limite}
                    onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
                    className="mt-1 text-xs"
                    data-testid="qa-fecha-limite"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-2">
                Si dejás servicio o vencimiento vacío: solo registra el fallado y queda pendiente de asignar.
              </p>
            </>
          )}

          <div>
            <Label className="text-xs font-medium">Observación</Label>
            <Input
              value={form.observacion}
              onChange={(e) => setForm({ ...form, observacion: e.target.value })}
              placeholder="Motivo o detalle..."
              className="mt-1"
              data-testid="qa-obs"
            />
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-3 flex items-center justify-between gap-2 bg-card sm:justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGuardar(true)}
              disabled={saving}
              data-testid="qa-guardar-continuar"
            >
              Guardar y otro
            </Button>
            <Button
              size="sm"
              onClick={() => handleGuardar(false)}
              disabled={saving}
              data-testid="qa-guardar"
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando</> : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Componente principal ───────────────────────────────────────
export const MesaAcabado = () => {
  const [cortes, setCortes] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [lineas, setLineas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  // filtros
  const [search, setSearch] = useState('');
  const [lineaFiltro, setLineaFiltro] = useState('_todas');
  const [soloConPendientes, setSoloConPendientes] = useState(false);
  // drawer
  const [drawerCorte, setDrawerCorte] = useState(null);

  const fetchCortes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (lineaFiltro && lineaFiltro !== '_todas') params.set('linea_negocio_id', lineaFiltro);
      if (soloConPendientes) params.set('solo_con_pendientes', 'true');
      const res = await axios.get(`${API}/mesa-acabado/cortes?${params}`, { headers: hdrs() });
      setCortes(res.data.cortes || []);
      setKpis(res.data.kpis || {});
    } catch (e) {
      toast.error('Error al cargar la mesa de acabado');
      setCortes([]);
    } finally {
      setLoading(false);
    }
  }, [search, lineaFiltro, soloConPendientes]);

  useEffect(() => {
    const t = setTimeout(fetchCortes, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchCortes]);

  // Cargar catálogos (líneas, servicios, personas) una vez
  useEffect(() => {
    (async () => {
      try {
        const [lineasR, serviciosR, personasR] = await Promise.all([
          axios.get(`${API}/lineas-negocio`, { headers: hdrs() }).catch(() => ({ data: [] })),
          axios.get(`${API}/servicios-produccion`, { headers: hdrs() }).catch(() => ({ data: [] })),
          axios.get(`${API}/personas-produccion`, { headers: hdrs() }).catch(() => ({ data: [] })),
        ]);
        setLineas(lineasR.data || []);
        setServicios(serviciosR.data || []);
        setPersonas(personasR.data || []);
      } catch (e) {
        // silencioso
      }
    })();
  }, []);

  const onSavedFallado = (corteId, _continuar) => {
    fetchCortes();
  };

  return (
    <div className="space-y-4" data-testid="mesa-acabado">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Mesa de Acabado
          </h2>
          <p className="text-sm text-muted-foreground">
            Cortes en Acabado · registra fallados y haz seguimiento sin abrir cada lote
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchCortes} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Cortes en acabado" value={kpis.total_cortes || 0} sub="lotes" />
        <Kpi label="Prendas en proceso" value={kpis.total_prendas || 0} sub="pzs" />
        <Kpi label="Fallados sin asignar" value={kpis.total_fallados_pendientes || 0} sub="pzs" tone="amber" />
        <Kpi label="Envíos vencidos" value={kpis.total_envios_vencidos || 0} sub="env." tone="red" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar corte o modelo..."
            className="pl-8 h-9 text-sm"
            data-testid="mesa-search"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-2 h-5 w-5 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={lineaFiltro} onValueChange={setLineaFiltro}>
          <SelectTrigger className="h-9 text-xs w-[200px]" data-testid="mesa-linea">
            <SelectValue placeholder="Línea de negocio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_todas">Todas las líneas</SelectItem>
            {lineas.map(l => (
              <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs">
          <Switch checked={soloConPendientes} onCheckedChange={setSoloConPendientes} id="solo-pend" />
          <Label htmlFor="solo-pend" className="cursor-pointer">Solo con pendientes</Label>
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {cortes.length} cortes
        </span>
      </div>

      {/* Tabla */}
      {loading && !cortes.length ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : cortes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium">Sin cortes en Acabado con los filtros actuales</p>
            <p className="text-xs text-muted-foreground mt-1">Ajustá los filtros o esperá a que entren nuevos cortes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-[28px_minmax(110px,1fr)_minmax(160px,1.8fr)_minmax(120px,1fr)_70px_repeat(5,_56px)_60px_120px] gap-2 items-center px-3 py-2 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            <span></span>
            <span>N° corte</span>
            <span>Modelo</span>
            <span>Estado</span>
            <span className="text-right">Pzas</span>
            <span className="text-right" title="Fallados detectados (servicio)">Det.</span>
            <span className="text-right" title="Pendientes de asignar a proveedor">Pend.</span>
            <span className="text-right" title="Envíos abiertos">Abi.</span>
            <span className="text-right" title="Envíos vencidos">Venc.</span>
            <span className="text-right" title="A cobrar al proveedor (acumulado)">Cobr.</span>
            <span className="text-right" title="Días desde creación">Días</span>
            <span></span>
          </div>
          <div className="divide-y">
            {cortes.map(c => (
              <CorteRow
                key={c.id}
                corte={c}
                onOpenQuickAdd={() => setDrawerCorte(c)}
              />
            ))}
          </div>
        </div>
      )}

      <QuickAddDrawer
        open={!!drawerCorte}
        corte={drawerCorte}
        onClose={() => setDrawerCorte(null)}
        onSaved={onSavedFallado}
        servicios={servicios}
        personas={personas}
      />
    </div>
  );
};

// ─── Fila de la tabla ───────────────────────────────────────────
const CorteRow = ({ corte, onOpenQuickAdd }) => {
  const c = corte;
  const tienePendientes = c.fallados_pendientes > 0 || c.envios_abiertos > 0;
  const venc = c.envios_vencidos > 0;
  return (
    <div
      className={`grid grid-cols-[28px_minmax(110px,1fr)_minmax(160px,1.8fr)_minmax(120px,1fr)_70px_repeat(5,_56px)_60px_120px] gap-2 items-center px-3 py-2 text-sm hover:bg-muted/20 transition-colors ${
        venc ? 'bg-red-50/30 dark:bg-red-950/10' : ''
      }`}
      data-testid={`row-${c.n_corte}`}
    >
      <span>
        {tienePendientes && <span className="block h-2 w-2 rounded-full bg-amber-500" title="Tiene pendientes" />}
      </span>
      <span className="font-mono text-sm tabular-nums truncate">{c.n_corte}</span>
      <span className="truncate" title={c.modelo}>{c.modelo || '—'}</span>
      <Badge variant="outline" className="text-[10px] w-fit">{c.estado}</Badge>
      <span className="text-right tabular-nums">{fmtN(c.prendas)}</span>
      <span className="text-right tabular-nums text-muted-foreground">{c.fallados_detectados || '—'}</span>
      <span className={`text-right tabular-nums ${c.fallados_pendientes > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
        {c.fallados_pendientes || '—'}
      </span>
      <span className="text-right tabular-nums text-muted-foreground">{c.envios_abiertos || '—'}</span>
      <span className={`text-right tabular-nums ${c.envios_vencidos > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground'}`}>
        {c.envios_vencidos || '—'}
      </span>
      <span className="text-right tabular-nums text-muted-foreground">{c.a_cobrar || '—'}</span>
      <span className="text-right tabular-nums text-muted-foreground">{c.dias_sin_movimiento}d</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-xs"
        onClick={onOpenQuickAdd}
        data-testid={`btn-add-${c.n_corte}`}
      >
        <Plus className="h-3 w-3" /> Fallado
      </Button>
    </div>
  );
};

export default MesaAcabado;
