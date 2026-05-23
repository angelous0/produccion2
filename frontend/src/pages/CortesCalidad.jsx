/**
 * CortesCalidad.jsx — Pantalla operario móvil/tablet para revisar cortes
 * desde la etapa "Para Acabado" en adelante.
 *
 * Funcionalidad (Sprint 1):
 *  - Lista de cortes filtrada por etapa (chips multi-select)
 *  - Búsqueda por N° corte o modelo
 *  - Toggle "Ocultar resueltos"
 *  - 3 estados visuales por corte (con fallados / sin revisar / revisado OK)
 *  - Acciones rápidas: "+ FALLADO" y "SIN FALLADOS" (con confirmación)
 *  - Drawer "+ FALLADO" con 3 campos: cantidad, chip de causa, observación
 *
 * Endpoints consumidos:
 *  - GET  /api/cortes/pendientes-revision
 *  - POST /api/cortes/{registro_id}/revisar
 *  - POST /api/fallados
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  RefreshCw, Search, AlertTriangle, CheckCircle2, ChevronRight,
  Loader2, X, Send, Check, ChevronsUpDown,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '../components/ui/command';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const ETAPAS = ['Para Acabado', 'Acabado', 'Almacén PT', 'Tienda'];

// Mapeo chip → causa enviada al backend (backend acepta 'tela' o 'servicio').
// Si el chip es uno de los servicios, sería bueno también precargar servicio_id
// pero eso lo decide el supervisor al asignar — el operario solo dice qué vio.
const CAUSAS = [
  { key: 'Costura',    causa: 'servicio', color: 'violet' },
  { key: 'Tela',       causa: 'tela',     color: 'purple' },
  { key: 'Lavado',     causa: 'servicio', color: 'cyan' },
  { key: 'Estampado',  causa: 'servicio', color: 'rose' },
  { key: 'Otro',       causa: 'servicio', color: 'zinc' },
];

const fmtFecha = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};

// ─── Drawer "+ FALLADO" ──────────────────────────────────────────────────
// Calcula fecha hoy + N días en formato YYYY-MM-DD.
const fechaHoyMas = (dias) => {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
};

const DrawerFallado = ({ open, corte, onClose, onSaved }) => {
  const [cantidad, setCantidad] = useState('');
  const [chip, setChip] = useState('Costura');
  const [observacion, setObservacion] = useState('');
  // Asignación (cuando chip != 'Tela')
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [servicioId, setServicioId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [openPersonaPicker, setOpenPersonaPicker] = useState(false);
  const [fechaLimite, setFechaLimite] = useState(fechaHoyMas(3));
  const [saving, setSaving] = useState(false);
  const cantRef = useRef(null);

  const esTela = chip === 'Tela';

  // 1) Cargar servicios una sola vez al abrir
  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/servicios-produccion`, { headers: hdrs() })
      .then(r => setServicios(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch(() => setServicios([]));
  }, [open]);

  // 2) Cuando cambia el chip o se abre, preseleccionar servicio_id según el chip
  useEffect(() => {
    if (!open || esTela || servicios.length === 0) return;
    const target = chip.toLowerCase();
    const match = servicios.find(s => (s.nombre || '').toLowerCase().includes(target));
    setServicioId(match?.id || '');
    setPersonaId('');
  }, [open, chip, esTela, servicios]);

  // 3) Cuando cambia el servicio_id, recargar personas filtradas
  useEffect(() => {
    if (!open || esTela || !servicioId) {
      setPersonas([]);
      return;
    }
    axios.get(`${API}/personas-produccion?servicio_id=${encodeURIComponent(servicioId)}`, { headers: hdrs() })
      .then(r => setPersonas(Array.isArray(r.data) ? r.data : (r.data?.items || [])))
      .catch(() => setPersonas([]));
  }, [open, esTela, servicioId]);

  // 4) Reset al abrir
  useEffect(() => {
    if (open) {
      setCantidad('');
      setChip('Costura');
      setObservacion('');
      setFechaLimite(fechaHoyMas(3));
      setTimeout(() => cantRef.current?.focus(), 80);
    }
  }, [open, corte?.id]);

  const servicioNombre = servicios.find(s => s.id === servicioId)?.nombre || chip;

  const validarYGuardar = async (continuar = false) => {
    if (!corte) return;
    const cant = parseInt(cantidad);
    if (!cant || cant <= 0) {
      toast.error('Indica una cantidad mayor a 0');
      return;
    }
    if (!esTela) {
      if (!servicioId) { toast.error('Selecciona el servicio'); return; }
      if (!personaId) { toast.error('Selecciona la persona'); return; }
      if (!fechaLimite) { toast.error('Define la fecha límite'); return; }
    }

    setSaving(true);
    try {
      const body = {
        cantidad: cant,
        causa: chip,
        observacion: observacion || null,
      };
      if (!esTela) {
        body.servicio_id = servicioId;
        body.persona_id  = personaId;
        body.fecha_limite = fechaLimite;
      }
      await axios.post(
        `${API}/cortes/${corte.id}/fallado-con-asignacion`,
        body,
        { headers: hdrs() },
      );

      toast.success(
        esTela
          ? `Fallado registrado · ${cant} prendas (queda en arreglo interno de tela)`
          : `Fallado + envío a arreglo · ${cant} prendas`,
      );
      if (continuar) {
        setCantidad('');
        setObservacion('');
        setTimeout(() => cantRef.current?.focus(), 50);
        onSaved(corte.id, true);
      } else {
        onSaved(corte.id, false);
        onClose();
      }
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string'
        ? e.response.data.detail
        : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };
  const handleGuardar = validarYGuardar;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base">Registrar fallado</DialogTitle>
          <DialogDescription className="text-xs">
            {corte ? <>Corte <span className="font-mono font-medium text-foreground">{corte.n_corte}</span> · {corte.modelo || '—'}</> : '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-xs font-medium">Cantidad detectada *</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button" variant="outline" size="icon"
                onClick={() => setCantidad(String(Math.max(0, (parseInt(cantidad) || 0) - 1)))}
                className="h-11 w-11 text-xl"
              >−</Button>
              <Input
                ref={cantRef}
                type="number" min={1}
                max={corte?.total_prendas || 9999}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="¿Cuántas prendas?"
                className="h-11 text-center text-xl font-bold flex-1"
                data-testid="cf-cantidad"
              />
              <Button
                type="button" variant="outline" size="icon"
                onClick={() => setCantidad(String((parseInt(cantidad) || 0) + 1))}
                className="h-11 w-11 text-xl"
              >+</Button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">¿Por qué falló?</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {CAUSAS.map(c => (
                <button
                  key={c.key} type="button"
                  onClick={() => setChip(c.key)}
                  className={`px-3 py-2 rounded-full text-xs font-medium border transition ${
                    chip === c.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-foreground/70 border-transparent hover:border-border'
                  }`}
                >
                  {c.key}
                </button>
              ))}
            </div>
          </div>

          {/* Bloque azul de asignación SOLO cuando NO es Tela */}
          {!esTela && (
            <div className="rounded-xl border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                <span className="font-bold text-blue-900 dark:text-blue-200 text-sm">Enviar a arreglo</span>
                <span className="ml-auto text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded">OBLIGATORIO</span>
              </div>
              <div>
                <Label className="text-xs font-semibold text-blue-900 dark:text-blue-200">¿A quién?</Label>
                <Popover open={openPersonaPicker} onOpenChange={setOpenPersonaPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={openPersonaPicker}
                      disabled={!personas.length}
                      className="h-10 w-full bg-card mt-1 justify-between font-normal"
                    >
                      {(() => {
                        const sel = personas.find(p => p.id === personaId);
                        if (sel) {
                          return (
                            <span className="truncate">
                              {sel.nombre} {sel.tipo_persona === 'EXTERNO' ? '(ext.)' : ''}
                            </span>
                          );
                        }
                        return (
                          <span className="text-muted-foreground">
                            {personas.length ? 'Seleccionar persona…' : 'No hay personas para este servicio'}
                          </span>
                        );
                      })()}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[280px]"
                    align="start"
                    sideOffset={4}
                  >
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Buscar persona…" className="h-9" />
                      <CommandList className="max-h-[260px]">
                        <CommandEmpty>No se encontraron personas.</CommandEmpty>
                        <CommandGroup>
                          {personas.map(p => (
                            <CommandItem
                              key={p.id}
                              value={`${p.nombre} ${p.tipo_persona || ''}`}
                              onSelect={() => {
                                setPersonaId(p.id);
                                setOpenPersonaPicker(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check className={cn('mr-2 h-4 w-4', personaId === p.id ? 'opacity-100' : 'opacity-0')} />
                              <span className="flex-1 truncate">{p.nombre}</span>
                              {p.tipo_persona === 'EXTERNO' && (
                                <span className="ml-2 text-[10px] text-muted-foreground shrink-0">ext.</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1">
                  Solo personas del servicio <strong>{servicioNombre}</strong>
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-blue-900 dark:text-blue-200">Fecha límite</Label>
                <Input
                  type="date"
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                  min={fechaHoyMas(0)}
                  className="mt-1 bg-card"
                />
                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1">Sugerido: 3 días</p>
              </div>
            </div>
          )}

          {/* Aviso verde cuando es Tela */}
          {esTela && (
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>No requiere asignar — queda en arreglo interno de tela.</span>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium">Detalle (opcional)</Label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Ej: dobladillo abierto pierna izq."
              className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={() => handleGuardar(false)}
            disabled={saving || (!esTela && (!servicioId || !personaId || !fechaLimite))}
            className="w-full h-11 font-bold text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (esTela ? 'GUARDAR' : 'GUARDAR Y ENVIAR')}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleGuardar(true)}
            disabled={saving || (!esTela && (!servicioId || !personaId || !fechaLimite))}
            className="w-full h-10"
          >
            Guardar y seguir reportando
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ─── Confirmación "SIN FALLADOS" ─────────────────────────────────────────
const ConfirmSinFallados = ({ open, corte, onConfirm, onCancel, saving }) => (
  <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ¿Está seguro?
        </DialogTitle>
        <DialogDescription className="pt-2">
          Confirmas que revisaste el <b className="font-mono">corte {corte?.n_corte}</b>
          {' '}({corte?.modelo}) y <b>no encontraste ningún fallado</b>.
          <br /><br />
          Esto lo cierra para tu etapa actual. Si después aparece un fallado,
          tendrás que registrarlo y el corte volverá a aparecer en la lista.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex gap-2 sm:gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sí, sin fallados'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);


// ─── Tarjeta de corte ────────────────────────────────────────────────────
const TarjetaCorte = ({ corte, onMarcarFallado, onSinFallados, onAbrirDetalle }) => {
  const ev = corte.estado_visual;
  const fmtBorder = {
    con_fallados_vencido: 'border-l-red-600 bg-red-50/30',
    con_fallados:         'border-l-red-500 bg-red-50/20',
    sin_revisar:          'border-l-zinc-400',
    revisado_ok:          'border-l-emerald-600 opacity-60',
  }[ev] || 'border-l-zinc-300';

  const pendientes = corte.fallados_pendientes_total || 0;
  const vencido = ev === 'con_fallados_vencido';

  return (
    <div className={`bg-card rounded-lg border border-l-[4px] ${fmtBorder} p-3 shadow-sm`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono font-bold text-base leading-tight">{corte.n_corte}</div>
          <div className="text-xs text-muted-foreground truncate">{corte.modelo || '—'}</div>
          <div className="flex items-center gap-2 mt-1 text-[10.5px] text-muted-foreground flex-wrap">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
              {corte.etapa_actual}
            </span>
            <span>· {corte.total_prendas} prendas</span>
            {corte.urgente && <span className="text-red-600 font-semibold">· URGENTE</span>}
            {vencido && (
              <span className="text-red-600 font-semibold">
                · ⏱ servicio vencido
              </span>
            )}
          </div>
        </div>
        {pendientes > 0 && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
            {pendientes} pend.
          </span>
        )}
        {ev === 'revisado_ok' && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
            OK
          </span>
        )}
      </div>

      {/* Acciones */}
      {ev === 'sin_revisar' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onMarcarFallado(corte)}
            className="flex-1 h-10 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> + FALLADO
          </button>
          <button
            onClick={() => onSinFallados(corte)}
            className="flex-1 h-10 rounded-md bg-card border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> SIN FALLADOS
          </button>
        </div>
      )}

      {(ev === 'con_fallados' || ev === 'con_fallados_vencido') && (
        <button
          onClick={() => onAbrirDetalle(corte)}
          className="mt-3 w-full h-9 rounded-md bg-card border border-blue-600 text-blue-700 hover:bg-blue-50 text-xs font-bold flex items-center justify-center gap-1"
        >
          Ver fallados <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      {ev === 'revisado_ok' && corte.revision_activa && (
        <div className="mt-2 text-[10.5px] text-muted-foreground">
          Revisado por {corte.revision_activa.revisado_por_nombre} · {fmtFecha(corte.revision_activa.revisado_at)}
        </div>
      )}
    </div>
  );
};


// ─── Fila compacta DESKTOP (una línea por corte) ──────────────────────────
const FilaCorteDesktop = ({ corte, onMarcarFallado, onSinFallados, onAbrirDetalle }) => {
  const ev = corte.estado_visual;
  const pendientes = corte.fallados_pendientes_total || 0;
  const vencido = ev === 'con_fallados_vencido';
  const borde = vencido
    ? 'border-l-red-600'
    : ev === 'con_fallados'
      ? 'border-l-red-500'
      : ev === 'revisado_ok'
        ? 'border-l-emerald-600'
        : 'border-l-transparent';
  return (
    <div className={`flex items-center gap-3 px-3 py-2 border-l-4 ${borde} hover:bg-muted/30 transition-colors text-sm`}>
      <div className="font-mono font-bold w-20 truncate text-sm">{corte.n_corte}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{corte.modelo || '—'}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
            {corte.etapa_actual}
          </span>
          <span>· {corte.total_prendas} prendas</span>
          {corte.urgente && <span className="text-red-600 font-semibold">· URGENTE</span>}
          {vencido && <span className="text-red-600 font-semibold">· ⏱ vencido</span>}
        </div>
      </div>

      {pendientes > 0 && (
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
          {pendientes} pend.
        </span>
      )}
      {ev === 'revisado_ok' && (
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
          OK
        </span>
      )}

      {/* Acciones inline */}
      {ev === 'sin_revisar' && (
        <>
          <button
            onClick={() => onMarcarFallado(corte)}
            className="shrink-0 h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> + Fallado
          </button>
          <button
            onClick={() => onSinFallados(corte)}
            className="shrink-0 h-8 px-3 rounded-md border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs font-bold inline-flex items-center gap-1"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Sin fallados
          </button>
        </>
      )}
      {(ev === 'con_fallados' || ev === 'con_fallados_vencido') && (
        <button
          onClick={() => onAbrirDetalle(corte)}
          className="shrink-0 h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1"
        >
          Ver fallados <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
      {ev === 'revisado_ok' && corte.revision_activa && (
        <span className="shrink-0 text-[10.5px] text-muted-foreground">
          Revisado por {corte.revision_activa.revisado_por_nombre} · {fmtFecha(corte.revision_activa.revisado_at)}
        </span>
      )}
    </div>
  );
};


// ─── Componente principal ───────────────────────────────────────────────
export default function CortesCalidad() {
  const [data, setData] = useState({ items: [], conteos_por_etapa: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [etapaFiltro, setEtapaFiltro] = useState('Acabado');
  const [busqueda, setBusqueda] = useState('');
  const [ocultarResueltos, setOcultarResueltos] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [corteSeleccionado, setCorteSeleccionado] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [corteConfirm, setCorteConfirm] = useState(null);
  const [savingConfirm, setSavingConfirm] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (etapaFiltro) params.set('etapa', etapaFiltro);
      if (busqueda.trim()) params.set('q', busqueda.trim());
      if (!ocultarResueltos) params.set('incluir_resueltos', 'true');

      const r = await axios.get(`${API}/cortes/pendientes-revision?${params}`, { headers: hdrs() });
      setData(r.data);
    } catch (e) {
      toast.error('No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  }, [etapaFiltro, busqueda, ocultarResueltos]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 350 : 0); // debounce búsqueda
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  const abrirFallado = (corte) => {
    setCorteSeleccionado(corte);
    setDrawerOpen(true);
  };

  const abrirConfirmSinFallados = (corte) => {
    setCorteConfirm(corte);
    setConfirmOpen(true);
  };

  const confirmarSinFallados = async () => {
    if (!corteConfirm) return;
    setSavingConfirm(true);
    try {
      await axios.post(
        `${API}/cortes/${corteConfirm.id}/revisar`,
        { observacion: null },
        { headers: hdrs() }
      );
      toast.success(`Corte ${corteConfirm.n_corte} marcado sin fallados`);
      setConfirmOpen(false);
      setCorteConfirm(null);
      cargar();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string'
        ? e.response.data.detail
        : 'Error al marcar');
    } finally {
      setSavingConfirm(false);
    }
  };

  const abrirDetalle = (corte) => {
    // Sprint 2-3: abrirá la pantalla de detalle TELA / SERVICIO.
    // Por ahora navegamos a la existente o mostramos toast.
    toast.info(`Detalle pendiente — ver corte ${corte.n_corte} en Control Fallados`);
  };

  const conteos = data.conteos_por_etapa || {};

  return (
    // Sin `min-h-screen` ni header azul propio: la página vive dentro del
    // Layout (que ya provee header global). Antes los dos headers se apilaban
    // en mobile y el del Layout quedaba cortado bajo este.
    <div className="bg-muted/30 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Título + acción refrescar */}
      <div className="bg-card border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-semibold">Cortes — Calidad</h1>
        <button
          onClick={cargar}
          title="Actualizar"
          className="h-9 w-9 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center text-foreground/80"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Búsqueda */}
      <div className="bg-card border-b px-4 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar N° corte o modelo…"
            className="pl-9 h-10"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Chips de etapa */}
      <div className="bg-card border-b px-3 py-2 overflow-x-auto flex gap-1.5">
        {ETAPAS.map(et => {
          const n = conteos[et] || 0;
          const active = etapaFiltro === et;
          return (
            <button
              key={et}
              onClick={() => setEtapaFiltro(et)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground/70 hover:bg-muted/70'
              }`}
            >
              {et} <span className={`ml-1 inline-flex items-center px-1.5 rounded-full text-[10px] ${active ? 'bg-white/25' : 'bg-foreground/10'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Toggle ocultar resueltos */}
      <div className="bg-card border-b px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Ocultar resueltos</span>
        <button
          onClick={() => setOcultarResueltos(v => !v)}
          className={`w-10 h-5 rounded-full relative transition ${ocultarResueltos ? 'bg-emerald-600' : 'bg-zinc-300'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${ocultarResueltos ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Lista — VISTA MÓVIL (tarjetas) */}
      <div className="md:hidden p-3 space-y-2.5">
        {loading && data.items.length === 0 && (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && data.items.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
            No hay cortes pendientes en <b>{etapaFiltro}</b>.
            {!ocultarResueltos && <div className="text-xs mt-1">Tampoco hay resueltos.</div>}
          </div>
        )}
        {data.items.map(corte => (
          <TarjetaCorte
            key={corte.id}
            corte={corte}
            onMarcarFallado={abrirFallado}
            onSinFallados={abrirConfirmSinFallados}
            onAbrirDetalle={abrirDetalle}
          />
        ))}
      </div>

      {/* Lista — VISTA DESKTOP (filas compactas) */}
      <div className="hidden md:block max-w-5xl mx-auto px-4 py-4">
        {loading && data.items.length === 0 && (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && data.items.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
            No hay cortes pendientes en <b>{etapaFiltro}</b>.
            {!ocultarResueltos && <div className="text-xs mt-1">Tampoco hay resueltos.</div>}
          </div>
        )}
        {data.items.length > 0 && (
          <div className="rounded-lg border bg-card divide-y">
            {data.items.map(corte => (
              <FilaCorteDesktop
                key={corte.id}
                corte={corte}
                onMarcarFallado={abrirFallado}
                onSinFallados={abrirConfirmSinFallados}
                onAbrirDetalle={abrirDetalle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drawers / Dialogs */}
      <DrawerFallado
        open={drawerOpen}
        corte={corteSeleccionado}
        onClose={() => setDrawerOpen(false)}
        onSaved={cargar}
      />
      <ConfirmSinFallados
        open={confirmOpen}
        corte={corteConfirm}
        onConfirm={confirmarSinFallados}
        onCancel={() => { setConfirmOpen(false); setCorteConfirm(null); }}
        saving={savingConfirm}
      />
    </div>
  );
}
