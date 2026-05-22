import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import {
  AlertTriangle, Plus, Trash2, Wrench,
  Scissors, Layers as LayersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DIAS_LIMITE_TELA_DESTRABAR = 5;

const fmtDate = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};

// DD/MM (compacto para las tarjetas)
const fmtDM = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [, m, dd] = s.split('-');
  return `${dd}/${m}`;
};

// ─── Helpers de fechas ────────────────────────────────────────────────────
// Días naturales (negativo si fechaFutura ya pasó).
const diasDesde = (fechaISO) => {
  if (!fechaISO) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(String(fechaISO).slice(0, 10));
  return Math.floor((hoy - f) / 86400000);
};

// Días hábiles (sin domingos) entre dos fechas ISO. Devuelve null si falta una.
const diasHabilesEntre = (fechaIniISO, fechaFinISO) => {
  if (!fechaIniISO || !fechaFinISO) return null;
  const a = new Date(String(fechaIniISO).slice(0, 10));
  const b = new Date(String(fechaFinISO).slice(0, 10));
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  if (a.getTime() === b.getTime()) return 0;
  const adelante = a < b;
  const inicio = adelante ? a : b;
  const fin = adelante ? b : a;
  let dias = 0;
  const cur = new Date(inicio);
  while (cur < fin) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) dias += 1;
  }
  return adelante ? dias : -dias;
};

// Días hábiles SIN domingos restantes (positivo = quedan, 0 = hoy, negativo = vencido).
const diasHabilesHastaLimite = (fechaLimiteISO) => {
  if (!fechaLimiteISO) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(String(fechaLimiteISO).slice(0, 10));
  if (limite < hoy) {
    // Vencido — devolvemos cuántos días naturales pasaron desde el vencimiento.
    return -Math.ceil((hoy - limite) / 86400000);
  }
  // Contar días hacia adelante saltando domingos (0 = domingo en JS).
  let dias = 0;
  const cur = new Date(hoy);
  while (cur < limite) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) dias += 1;
  }
  return dias;
};

const countdownBadge = (fechaLimiteISO) => {
  const d = diasHabilesHastaLimite(fechaLimiteISO);
  if (d === null) return null;
  if (d < 0) {
    const abs = Math.abs(d);
    return {
      label: `VENCIDO ${abs}d`,
      cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200',
    };
  }
  if (d === 0) {
    return { label: 'VENCE HOY', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200' };
  }
  if (d === 1) {
    return { label: 'QUEDA 1 DÍA', cls: 'bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200 border-amber-300' };
  }
  return { label: `QUEDAN ${d} DÍAS`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200' };
};

export const ArreglosPanel = ({ registroId, servicios = [], personas = [] }) => {
  const [resumen, setResumen] = useState(null);
  const [fallados, setFallados] = useState([]);
  const [arreglos, setArreglos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [falladoDialogOpen, setFalladoDialogOpen] = useState(false);
  const [editingFalladoId, setEditingFalladoId] = useState(null);
  const [arregloDialogOpen, setArregloDialogOpen] = useState(false);
  const [resolucionDialogOpen, setResolucionDialogOpen] = useState(false);
  const [selectedArreglo, setSelectedArreglo] = useState(null);

  const [falladoForm, setFalladoForm] = useState({ cantidad_detectada: '', fecha_deteccion: '', observacion: '', causa: 'servicio' });
  const [arregloForm, setArregloForm] = useState({ cantidad: '', servicio_id: '', persona_id: '', fecha_envio: '', observacion: '' });
  // Resolución del envío a servicio: 3 inputs (recuperadas + a cobrar + pasa a tela).
  // `cantidad_merma` se mantiene oculto en el modal nuevo pero se conserva en la
  // BD por compatibilidad con datos viejos.
  const [resolucionForm, setResolucionForm] = useState({
    cantidad_recuperada: 0,
    cantidad_liquidacion: 0,
    cantidad_pasa_a_tela: 0,
    cantidad_merma: 0,
  });

  const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchAll = useCallback(async () => {
    if (!registroId) return;
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.allSettled([
        axios.get(`${API}/registros/${registroId}/resumen-cantidades`, { headers: hdrs() }),
        axios.get(`${API}/fallados?registro_id=${registroId}`, { headers: hdrs() }),
        axios.get(`${API}/registros/${registroId}/arreglos`, { headers: hdrs() }),
      ]);
      if (r1.status === 'fulfilled') setResumen(r1.value.data);
      if (r2.status === 'fulfilled') setFallados(r2.value.data);
      if (r3.status === 'fulfilled') setArreglos(r3.value.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [registroId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Personas filtradas por servicio seleccionado
  const personasFiltradas = arregloForm.servicio_id
    ? personas.filter(p => {
        const enDetalle = (p.servicios_detalle || []).some(s => s.servicio_id === arregloForm.servicio_id);
        const enServicios = (p.servicios || []).some(s => s.servicio_id === arregloForm.servicio_id);
        const enIds = (p.servicio_ids || []).includes(arregloForm.servicio_id);
        return enDetalle || enServicios || enIds;
      })
    : personas;

  // ===== FALLADOS =====
  const handleSaveFallado = async () => {
    if (saving) return;
    const cant = parseInt(falladoForm.cantidad_detectada) || 0;
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    const causa = falladoForm.causa === 'tela' ? 'tela' : 'servicio';
    setSaving(true);
    try {
      const payload = {
        registro_id: registroId,
        cantidad_detectada: cant,
        fecha_deteccion: falladoForm.fecha_deteccion || undefined,
        observacion: falladoForm.observacion,
        causa,
      };
      if (editingFalladoId) {
        // El PUT actual no permite cambiar causa (es decisión de origen); solo
        // permite editar cantidad/fecha/obs. Mandamos esos campos únicamente.
        const { causa: _c, ...putPayload } = payload;
        await axios.put(`${API}/fallados/${editingFalladoId}`, putPayload, { headers: hdrs() });
        toast.success('Fallado actualizado');
      } else {
        await axios.post(`${API}/fallados`, payload, { headers: hdrs() });
        toast.success(causa === 'tela' ? 'Fallado de tela registrado en evaluación' : 'Fallado registrado');
      }
      setFalladoDialogOpen(false);
      setEditingFalladoId(null);
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Cierre rápido (legacy / atajo): cierra TODO el saldo pendiente con un destino.
  // Soporta también el nuevo modo acumulativo via openResolverTela().
  const handleCerrarTela = async (falladoId, resolucion) => {
    if (saving) return;
    const txt = resolucion === 'RECUPERADO' ? 'recuperar TODO el saldo (vuelve al lote bueno)' : 'liquidar TODO el saldo (sale del inventario)';
    if (!window.confirm(`¿Confirmas ${txt}?`)) return;
    setSaving(true);
    try {
      await axios.post(`${API}/fallados/${falladoId}/cerrar-tela`, { resolucion }, { headers: hdrs() });
      toast.success(resolucion === 'RECUPERADO' ? 'Marcado como recuperado' : 'Marcado como liquidado');
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al cerrar');
    } finally {
      setSaving(false);
    }
  };

  // Modal de resolución parcial: acumula deltas a recuperada/liquidada.
  const [telaModal, setTelaModal] = useState(null); // fallado actual
  const [telaForm, setTelaForm] = useState({ agregar_recuperada: 0, agregar_liquidada: 0 });
  const openResolverTela = (f) => {
    setTelaModal(f);
    setTelaForm({ agregar_recuperada: 0, agregar_liquidada: 0 });
  };
  const submitResolverTela = async () => {
    if (!telaModal || saving) return;
    const rec = parseFloat(telaForm.agregar_recuperada || 0);
    const liq = parseFloat(telaForm.agregar_liquidada || 0);
    if (rec <= 0 && liq <= 0) {
      toast.error('Indica al menos una cantidad > 0');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/fallados/${telaModal.id}/cerrar-tela`,
        { agregar_recuperada: rec, agregar_liquidada: liq },
        { headers: hdrs() },
      );
      const d = res.data || {};
      if (d.cerrado) {
        toast.success(`Cerrado como ${d.estado_tela}`);
      } else {
        toast.success(`Parcial guardado · pendiente: ${d.pendiente}`);
      }
      setTelaModal(null);
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFallado = async (id) => {
    if (!window.confirm('Eliminar este registro de fallado?')) return;
    try {
      await axios.delete(`${API}/fallados/${id}`, { headers: hdrs() });
      toast.success('Fallado eliminado');
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al eliminar');
    }
  };

  // ===== ARREGLOS =====
  const handleSaveArreglo = async () => {
    if (saving) return;
    const cant = parseInt(arregloForm.cantidad) || 0;
    if (cant <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/registros/${registroId}/arreglos`, {
        cantidad: cant,
        servicio_id: arregloForm.servicio_id || null,
        persona_id: arregloForm.persona_id || null,
        fecha_envio: arregloForm.fecha_envio || undefined,
        observacion: arregloForm.observacion,
      }, { headers: hdrs() });
      toast.success('Envio a arreglo creado');
      setArregloDialogOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al crear arreglo');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveResolucion = async () => {
    if (saving || !selectedArreglo) return;
    // Inputs son DELTA: sumamos al previo para obtener el total a enviar.
    const deltaRec = parseInt(resolucionForm.cantidad_recuperada) || 0;
    const deltaLiq = parseInt(resolucionForm.cantidad_liquidacion) || 0;
    const deltaPat = parseInt(resolucionForm.cantidad_pasa_a_tela) || 0;
    const deltaMer = parseInt(resolucionForm.cantidad_merma) || 0;
    const delta = deltaRec + deltaLiq + deltaPat + deltaMer;
    if (delta === 0) {
      toast.error('Indica al menos una cantidad > 0');
      return;
    }
    const prevR = selectedArreglo.cantidad_recuperada || 0;
    const prevL = selectedArreglo.cantidad_liquidacion || 0;
    const prevP = selectedArreglo.cantidad_pasa_a_tela || 0;
    const prevM = selectedArreglo.cantidad_merma || 0;
    const rec = prevR + deltaRec;
    const liq = prevL + deltaLiq;
    const pat = prevP + deltaPat;
    const mer = prevM + deltaMer;
    const suma = rec + liq + pat + mer;
    if (suma > selectedArreglo.cantidad) {
      toast.error(`Excede el saldo pendiente (${selectedArreglo.cantidad - (prevR + prevL + prevP + prevM)})`);
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/arreglos/${selectedArreglo.id}`, {
        cantidad_recuperada: rec,
        cantidad_liquidacion: liq,
        cantidad_pasa_a_tela: pat,
        cantidad_merma: mer,
      }, { headers: hdrs() });
      const cierra = suma === selectedArreglo.cantidad;
      if (cierra) {
        toast.success(deltaPat > 0
          ? `Entrega cerrada · ${deltaPat} pasaron a evaluación de tela`
          : 'Entrega cerrada');
      } else {
        toast.success(`Resolución parcial guardada · pendiente: ${selectedArreglo.cantidad - suma}`);
      }
      setResolucionDialogOpen(false);
      setSelectedArreglo(null);
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al guardar resolucion');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArreglo = async (id) => {
    if (!window.confirm('Eliminar este arreglo?')) return;
    try {
      await axios.delete(`${API}/arreglos/${id}`, { headers: hdrs() });
      toast.success('Arreglo eliminado');
      fetchAll();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'Error al eliminar');
    }
  };

  const openResolucion = (arreglo) => {
    setSelectedArreglo(arreglo);
    // Inputs como DELTA (cantidades que se ENTREGAN ahora). Arrancan en 0.
    // El previo se muestra aparte como "Ya entregado" y se suma al guardar.
    setResolucionForm({
      cantidad_recuperada: 0,
      cantidad_liquidacion: 0,
      cantidad_pasa_a_tela: 0,
      cantidad_merma: 0,
    });
    setResolucionDialogOpen(true);
  };

  // ── Cálculos del diálogo "Marcar entregado" ──
  // resRec/resLiq/resPat/resMer son DELTAS (lo que se agrega ahora).
  // prevRec/prevLiq/prevPat/prevMer es lo que YA estaba.
  // totalRec/...: lo que QUEDARÁ tras guardar (previo + delta).
  const resRec = parseInt(resolucionForm.cantidad_recuperada) || 0;
  const resLiq = parseInt(resolucionForm.cantidad_liquidacion) || 0;
  const resPat = parseInt(resolucionForm.cantidad_pasa_a_tela) || 0;
  const resMer = parseInt(resolucionForm.cantidad_merma) || 0;
  const resDelta = resRec + resLiq + resPat + resMer;
  const prevRec = selectedArreglo ? (selectedArreglo.cantidad_recuperada || 0) : 0;
  const prevLiq = selectedArreglo ? (selectedArreglo.cantidad_liquidacion || 0) : 0;
  const prevPat = selectedArreglo ? (selectedArreglo.cantidad_pasa_a_tela || 0) : 0;
  const prevMer = selectedArreglo ? (selectedArreglo.cantidad_merma || 0) : 0;
  const prevTotal = prevRec + prevLiq + prevPat + prevMer;
  const totalRec = prevRec + resRec;
  const totalLiq = prevLiq + resLiq;
  const totalPat = prevPat + resPat;
  const totalMer = prevMer + resMer;
  const resTotal = prevTotal + resDelta;
  const resCantidad = selectedArreglo ? selectedArreglo.cantidad : 0;
  const resFaltante = Math.max(resCantidad - prevTotal, 0);
  const resExcede = resDelta > resFaltante;
  const resFalta = resTotal < resCantidad;
  const resDiasRestantes = selectedArreglo ? diasHabilesHastaLimite(selectedArreglo.fecha_limite) : null;
  const resVencido = resDiasRestantes !== null && resDiasRestantes <= 0;

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando trazabilidad...</div>;

  const r = resumen || {};
  const falladoPendiente = r.fallado_pendiente || 0;
  // Originales (sin origen_arreglo_id) — sirven para calcular cupo de
  // envíos a servicio. No se renderizan como lista propia.
  const falladosOriginales = (fallados || []).filter(f => !f.origen_arreglo_id);
  // Panel "De tela": TODOS los fallados causa='tela' (originales + derivados),
  // incluyendo cerrados RECUPERADO/LIQUIDADO. Las tarjetas se pintan distinto
  // según `estado_tela`.
  const falladosTela = (fallados || []).filter(
    f => (f.causa || 'servicio') === 'tela',
  );
  const falladosTelaEvaluando = falladosTela.filter(f => f.estado_tela === 'EVALUANDO');
  // Cupo disponible para enviar a arreglo: solo los originales causa='servicio'.
  // El backend usa la misma regla (`_get_total_fallados`).
  const falladoServicioOriginal = falladosOriginales
    .filter(f => (f.causa || 'servicio') === 'servicio')
    .reduce((acc, f) => acc + (f.cantidad_detectada || 0), 0);
  const totalEnArreglo = r.total_en_arreglo || 0;
  const disponibleParaArreglo = Math.max(0, falladoServicioOriginal - totalEnArreglo);

  // Contadores de los headers del grid: suma de pendientes (no cerrados).
  const pzsServicioPendientes = (arreglos || [])
    .filter(a => a.estado !== 'COMPLETADO')
    .reduce((acc, a) => acc + (a.cantidad || 0), 0);
  const pzsTelaPendientes = falladosTelaEvaluando
    .reduce((acc, f) => acc + (f.cantidad_detectada || 0), 0);

  return (
    <div className="space-y-4" data-testid="arreglos-panel">
      {/* Cabecera mínima — número de corte arriba */}
      <div data-testid="bloque-resumen">
        <p className="text-xs text-muted-foreground">Detección de fallados</p>
      </div>

      {/* Banners de alerta (solo si X > 0 — el backend ya los filtra) */}
      {r.alertas && r.alertas.length > 0 && (
        <div className="space-y-1">
          {r.alertas.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border ${
                a.tipo === 'VENCIDO'
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300'
                  : a.tipo === 'MERMA'
                    ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'
                    : a.tipo === 'EVALUANDO'
                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300'
                      : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'
              }`}
              data-testid={`alerta-${a.tipo.toLowerCase()}`}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {a.mensaje}
            </div>
          ))}
        </div>
      )}

      {/* Math row — verde si OK, rojo si no cuadra */}
      <div
        className={`text-[11px] font-mono px-3 py-2 rounded-md border ${
          r.ecuacion_valida
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400'
            : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400'
        }`}
        data-testid="ecuacion"
      >
        {r.ecuacion_valida ? '✓ ' : '✗ '}
        {r.normal || 0} buenas
        {' + '}{(r.recuperado || 0) + (r.tela_recuperado || 0)} recup
        {' + '}{r.liquidacion || 0} cobrar
        {(r.tela_liquidado || 0) > 0 && ` + ${r.tela_liquidado} liq_tela`}
        {' + '}{(r.merma || 0) + (r.merma_arreglos || 0)} merma
        {' + '}{falladoPendiente + (r.tela_evaluando || 0)} proc
        {r.divididos > 0 ? ` + ${r.divididos} div` : ''}
        {' = '}{r.total_producido || 0}
      </div>

      {/* Botón ancho: registrar fallado */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 text-sm font-medium border-blue-300 bg-blue-50/50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/50"
        onClick={() => {
          setEditingFalladoId(null);
          setFalladoForm({ cantidad_detectada: '', fecha_deteccion: '', observacion: '', causa: 'servicio' });
          setFalladoDialogOpen(true);
        }}
        data-testid="btn-nuevo-fallado"
      >
        <Plus className="h-4 w-4 mr-2" /> Registrar fallado
      </Button>

      {/* Grid 2 columnas: De servicio | De tela */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ───────── COLUMNA IZQUIERDA: De servicio ───────── */}
        <Card data-testid="col-de-servicio" className="min-h-[240px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4 text-violet-500" /> De servicio
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  data-testid="badge-servicio-pzs"
                >
                  {pzsServicioPendientes} pzs
                </span>
              </CardTitle>
              {disponibleParaArreglo > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] px-2"
                  onClick={() => {
                    setArregloForm({ cantidad: '', servicio_id: '', persona_id: '', fecha_envio: '', observacion: '' });
                    setArregloDialogOpen(true);
                  }}
                  data-testid="btn-nuevo-arreglo"
                  title={`${disponibleParaArreglo} disponibles para asignar`}
                >
                  <Plus className="h-3 w-3 mr-1" /> Envío
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {arreglos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8" data-testid="empty-servicio">
                Sin envíos a servicio
              </p>
            ) : (
              arreglos.map(a => {
                const rec = a.cantidad_recuperada || 0;
                const liq = a.cantidad_liquidacion || 0;
                const mer = a.cantidad_merma || 0;
                const pat = a.cantidad_pasa_a_tela || 0;
                const completado = a.estado === 'COMPLETADO';
                const cb = completado ? null : countdownBadge(a.fecha_limite);
                // Categoría visual según countdown
                const isVencido = !completado && cb && (cb.label.startsWith('VENCIDO') || cb.label === 'VENCE HOY');
                const isCriticoHoy = !completado && cb && cb.label === 'QUEDA 1 DÍA';
                // Días hábiles que tomó la entrega (si está cerrado)
                const diasEntrega = completado ? diasHabilesEntre(a.fecha_envio, a.fecha_limite) : null;

                // Estilos según estado
                let bg, borderLeft, txtCant;
                if (completado) {
                  bg = 'bg-muted/50 dark:bg-zinc-900/40';
                  borderLeft = 'border-l-emerald-500';
                  txtCant = '';
                } else if (isVencido) {
                  bg = 'bg-red-50 dark:bg-red-950/30';
                  borderLeft = 'border-l-red-500';
                  txtCant = 'text-red-700 dark:text-red-300';
                } else if (isCriticoHoy) {
                  bg = 'bg-amber-100 dark:bg-amber-900/40';
                  borderLeft = 'border-l-amber-500';
                  txtCant = 'text-amber-800 dark:text-amber-200';
                } else {
                  // Neutro: 2+ días
                  bg = 'bg-muted/40 dark:bg-zinc-900/40';
                  borderLeft = 'border-l-zinc-300 dark:border-l-zinc-700';
                  txtCant = '';
                }

                // Badge derecha
                const badge = completado
                  ? { label: 'CERRADO', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' }
                  : cb;
                const badgeBgCls = completado
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : isVencido
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                    : isCriticoHoy
                      ? 'bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';

                return (
                  <div
                    key={a.id}
                    className={`relative p-3 rounded-md border border-l-4 ${bg} ${borderLeft}`}
                    data-testid={`arreglo-card-${a.id}`}
                  >
                    {/* Eliminar (sólo si no completado) */}
                    {!completado && (
                      <button
                        type="button"
                        onClick={() => handleDeleteArreglo(a.id)}
                        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-600 rounded"
                        data-testid={`btn-delete-arreglo-${a.id}`}
                        title="Eliminar envío"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2 pr-6">
                      <span className={`font-semibold text-base ${txtCant}`}>{a.cantidad} pzs</span>
                      {badge && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${badgeBgCls}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <div className={`text-xs mt-0.5 ${txtCant || 'text-muted-foreground'}`}>
                      {(a.servicio_nombre || '-')} · {(a.persona_nombre || '-')}
                    </div>

                    <div className={`text-[10px] mt-0.5 ${txtCant ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {completado ? (
                        <>
                          enviado {fmtDM(a.fecha_envio)}
                          {diasEntrega !== null && diasEntrega > 0
                            ? ` · entregado en ${diasEntrega}d hábiles`
                            : ' · entregado'}
                        </>
                      ) : (
                        <>enviado {fmtDM(a.fecha_envio)} · vence {fmtDM(a.fecha_limite)}</>
                      )}
                    </div>

                    {/* Mini resolución (sólo si ya hay valores parciales) */}
                    {!completado && (rec + liq + mer + pat) > 0 && (
                      <div className="text-[10px] mt-1 flex flex-wrap gap-2">
                        {rec > 0 && <span className="text-emerald-600 dark:text-emerald-400">Rec:{rec}</span>}
                        {liq > 0 && <span className="text-orange-600 dark:text-orange-400">Cobr:{liq}</span>}
                        {pat > 0 && <span className="text-blue-600 dark:text-blue-400">Tela:{pat}</span>}
                        {mer > 0 && <span className="text-red-600 dark:text-red-400">Mer:{mer}</span>}
                      </div>
                    )}

                    {!completado && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-8 text-xs mt-2 bg-background/60"
                        onClick={() => openResolucion(a)}
                        data-testid={`btn-resolver-${a.id}`}
                      >
                        Marcar entregado →
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ───────── COLUMNA DERECHA: De tela ───────── */}
        <Card data-testid="col-de-tela" className="min-h-[240px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LayersIcon className="h-4 w-4 text-blue-500" /> De tela
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                  data-testid="badge-tela-pzs"
                >
                  {pzsTelaPendientes} pzs
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {falladosTela.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8" data-testid="empty-tela">
                Sin fallados de tela
              </p>
            ) : (
              falladosTela.map(f => {
                const dias = diasDesde(f.fecha_deteccion);
                const detectada = Number(f.cantidad_detectada) || 0;
                const rec = Number(f.cantidad_tela_recuperada) || 0;
                const liq = Number(f.cantidad_tela_liquidada) || 0;
                const resuelto = rec + liq;
                const pendiente = Math.max(detectada - resuelto, 0);
                const estadoT = f.estado_tela || 'EVALUANDO';
                const cerrado = pendiente <= 0 && detectada > 0;
                const parcial = !cerrado && resuelto > 0;
                const todoRec = cerrado && liq === 0;
                const todoLiq = cerrado && rec === 0;
                const mixto = cerrado && rec > 0 && liq > 0;
                const destrabar = !cerrado && (dias || 0) > DIAS_LIMITE_TELA_DESTRABAR;
                const diasCierre = cerrado ? diasHabilesEntre(f.fecha_deteccion, f.fecha_cierre) : null;

                // Estilos según estado real (cerrado/parcial/evaluando)
                let bg, borderLeft, txt;
                if (todoRec) {
                  bg = 'bg-muted/50 dark:bg-zinc-900/40';
                  borderLeft = 'border-l-emerald-500';
                  txt = '';
                } else if (todoLiq) {
                  bg = 'bg-muted/50 dark:bg-zinc-900/40';
                  borderLeft = 'border-l-red-500';
                  txt = '';
                } else if (mixto) {
                  bg = 'bg-muted/50 dark:bg-zinc-900/40';
                  borderLeft = 'border-l-violet-500';
                  txt = '';
                } else if (destrabar) {
                  bg = 'bg-amber-100 dark:bg-amber-900/40';
                  borderLeft = 'border-l-amber-500';
                  txt = 'text-amber-800 dark:text-amber-200';
                } else if (parcial) {
                  bg = 'bg-blue-50 dark:bg-blue-950/30';
                  borderLeft = 'border-l-blue-400 dark:border-l-blue-700';
                  txt = 'text-blue-700 dark:text-blue-300';
                } else {
                  bg = 'bg-blue-50 dark:bg-blue-950/30';
                  borderLeft = 'border-l-blue-300 dark:border-l-blue-800';
                  txt = 'text-blue-700 dark:text-blue-300';
                }

                const badgeLbl = todoRec ? 'RECUPERADO'
                  : todoLiq ? 'LIQUIDADO'
                  : mixto ? 'CERRADO'
                  : destrabar ? `LLEVA ${dias}d`
                  : parcial ? `PENDIENTE ${pendiente}`
                  : 'EVALUANDO';
                const badgeCls = todoRec ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : todoLiq ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                  : mixto ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                  : destrabar ? 'bg-amber-200 text-amber-900 dark:bg-amber-800/60 dark:text-amber-200'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';

                return (
                  <div
                    key={f.id}
                    className={`relative p-3 rounded-md border border-l-4 ${bg} ${borderLeft}`}
                    data-testid={`tela-card-${f.id}`}
                  >
                    {/* Eliminar (sólo si nada resuelto; sino preservamos trazabilidad) */}
                    {!cerrado && !parcial && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFallado(f.id)}
                        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-red-600 rounded"
                        data-testid={`btn-delete-fallado-${f.id}`}
                        title="Eliminar fallado"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2 pr-6">
                      <span className={`font-semibold text-base ${txt}`}>{detectada} pzs</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${badgeCls}`}>
                        {badgeLbl}
                      </span>
                    </div>

                    <div className={`text-xs mt-0.5 ${txt || 'text-muted-foreground'} flex items-center gap-1 flex-wrap`}>
                      {cerrado ? (todoRec ? 'acabado recuperó' : todoLiq ? 'acabado liquidó' : 'cerrado mixto')
                        : parcial ? 'resolución parcial'
                        : 'acabado pendiente'}
                      {f.origen_arreglo_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-background/50 text-muted-foreground">
                          {f.observacion && f.observacion.startsWith('Viene de')
                            ? f.observacion.replace(/\s*\(envío.*\)\s*$/, '')
                            : 'viene de servicio'}
                        </span>
                      )}
                    </div>

                    {/* Desglose rec/liq cuando hay algo resuelto */}
                    {(rec > 0 || liq > 0) && (
                      <div className="text-[10px] mt-1 flex flex-wrap gap-2">
                        {rec > 0 && <span className="text-emerald-600 dark:text-emerald-400">Rec: {rec}</span>}
                        {liq > 0 && <span className="text-red-600 dark:text-red-400">Liq: {liq}</span>}
                        {pendiente > 0 && <span className="text-muted-foreground">Pend: {pendiente}</span>}
                      </div>
                    )}

                    <div className={`text-[10px] mt-0.5 ${txt ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {cerrado ? (
                        <>
                          detectado {fmtDM(f.fecha_deteccion)}
                          {diasCierre !== null ? ` · cerrado en ${diasCierre}d` : ' · cerrado'}
                          {f.fecha_cierre ? ` (${fmtDM(f.fecha_cierre)})` : ''}
                        </>
                      ) : (
                        <>
                          detectado {fmtDM(f.fecha_deteccion)}{dias !== null ? ` · hace ${dias}d` : ''}
                          {destrabar ? ' · destrabar' : ''}
                        </>
                      )}
                    </div>

                    {!cerrado && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-8 text-xs mt-2 bg-background/60"
                        onClick={() => openResolverTela(f)}
                        data-testid={`btn-resolver-tela-${f.id}`}
                      >
                        Resolver tela →
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* DIALOG: Fallado */}
      <Dialog open={falladoDialogOpen} onOpenChange={setFalladoDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-fallado">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingFalladoId ? 'Editar Fallado' : 'Registrar Fallado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad Detectada *</Label>
              <Input type="number" min={1} value={falladoForm.cantidad_detectada} onChange={e => setFalladoForm({ ...falladoForm, cantidad_detectada: e.target.value })} data-testid="input-fallado-cantidad" />
            </div>
            {/* Causa: solo se elige al CREAR. Al editar la causa queda fija. */}
            {!editingFalladoId && (
              <div>
                <Label className="text-xs">Causa *</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFalladoForm({ ...falladoForm, causa: 'servicio' })}
                    className={`text-xs px-2 py-2 rounded-md border flex items-center justify-center gap-1.5 transition-colors ${falladoForm.causa === 'servicio'
                      ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-400 text-violet-900 dark:text-violet-200'
                      : 'bg-background border-input hover:bg-muted'}`}
                    data-testid="radio-causa-servicio"
                  >
                    <Scissors className="h-3 w-3" /> Servicio
                  </button>
                  <button
                    type="button"
                    onClick={() => setFalladoForm({ ...falladoForm, causa: 'tela' })}
                    className={`text-xs px-2 py-2 rounded-md border flex items-center justify-center gap-1.5 transition-colors ${falladoForm.causa === 'tela'
                      ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-900 dark:text-blue-200'
                      : 'bg-background border-input hover:bg-muted'}`}
                    data-testid="radio-causa-tela"
                  >
                    <LayersIcon className="h-3 w-3" /> Tela
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  {falladoForm.causa === 'tela'
                    ? 'No se envía a proveedor. Queda en evaluación interna de Acabado.'
                    : 'Se envía a un servicio para arreglo (flujo estándar).'}
                </p>
              </div>
            )}
            <div>
              <Label className="text-xs">Fecha Detección</Label>
              <Input type="date" value={falladoForm.fecha_deteccion} onChange={e => setFalladoForm({ ...falladoForm, fecha_deteccion: e.target.value })} data-testid="input-fallado-fecha" />
            </div>
            <div>
              <Label className="text-xs">Observación</Label>
              <Input value={falladoForm.observacion} onChange={e => setFalladoForm({ ...falladoForm, observacion: e.target.value })} placeholder="Motivo o detalle..." data-testid="input-fallado-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setFalladoDialogOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSaveFallado} disabled={saving} data-testid="btn-guardar-fallado">{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Nuevo Arreglo */}
      <Dialog open={arregloDialogOpen} onOpenChange={setArregloDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-arreglo">
          <DialogHeader>
            <DialogTitle className="text-sm">Nuevo Envio a Arreglo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad * <span className="text-muted-foreground">(max: {falladoPendiente})</span></Label>
              <Input type="number" min={1} max={falladoPendiente} value={arregloForm.cantidad} onChange={e => setArregloForm({ ...arregloForm, cantidad: e.target.value })} data-testid="input-arreglo-cantidad" />
            </div>
            <div>
              <Label className="text-xs">Servicio</Label>
              <Select value={arregloForm.servicio_id || '_none'} onValueChange={v => setArregloForm({ ...arregloForm, servicio_id: v === '_none' ? '' : v, persona_id: '' })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-arreglo-servicio"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin servicio</SelectItem>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Persona</Label>
              <Select value={arregloForm.persona_id || '_none'} onValueChange={v => setArregloForm({ ...arregloForm, persona_id: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-arreglo-persona"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin persona</SelectItem>
                  {personasFiltradas.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha Envio</Label>
              <Input type="date" value={arregloForm.fecha_envio} onChange={e => setArregloForm({ ...arregloForm, fecha_envio: e.target.value })} data-testid="input-arreglo-fecha" />
            </div>
            <div>
              <Label className="text-xs">Observacion</Label>
              <Input value={arregloForm.observacion} onChange={e => setArregloForm({ ...arregloForm, observacion: e.target.value })} placeholder="Detalle..." data-testid="input-arreglo-obs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setArregloDialogOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSaveArreglo} disabled={saving} data-testid="btn-guardar-arreglo">{saving ? 'Guardando...' : 'Crear Envio'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Marcar entregado (resolución del envío a servicio con 3 inputs) */}
      <Dialog open={resolucionDialogOpen} onOpenChange={setResolucionDialogOpen}>
        <DialogContent className="max-w-sm" data-testid="dialog-resolucion">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Marcar entregado · {resCantidad} prendas
              {(() => {
                if (!selectedArreglo) return null;
                const d = diasHabilesHastaLimite(selectedArreglo.fecha_limite);
                if (d === null || d > 0) return null;
                const label = d === 0 ? 'VENCE HOY' : `VENCIDO ${Math.abs(d)}d`;
                return (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200">
                    {label}
                  </span>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Contexto del envío: proveedor, fechas, vencimiento */}
            {selectedArreglo && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Servicio · Proveedor</span>
                  <span className="font-medium text-right truncate">
                    {selectedArreglo.servicio || '—'} · {selectedArreglo.persona || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Envío · Vence</span>
                  <span className="font-mono">
                    {fmtDM(selectedArreglo.fecha_envio)} · {fmtDM(selectedArreglo.fecha_limite)}
                  </span>
                </div>
              </div>
            )}
            {/* Estado actual (lo que ya se entregó) */}
            <div className="rounded-md border bg-card px-3 py-2 text-[11px]">
              <div className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Ya entregado</div>
              <div className="grid grid-cols-4 gap-2 text-center tabular-nums">
                <div>
                  <div className="text-emerald-600 font-semibold">{prevRec}</div>
                  <div className="text-[9px] text-muted-foreground">Rec.</div>
                </div>
                <div>
                  <div className="text-orange-600 font-semibold">{prevLiq}</div>
                  <div className="text-[9px] text-muted-foreground">Cobrar</div>
                </div>
                <div>
                  <div className="text-blue-600 font-semibold">{prevPat}</div>
                  <div className="text-[9px] text-muted-foreground">Tela</div>
                </div>
                <div>
                  <div className="font-semibold">{prevMer}</div>
                  <div className="text-[9px] text-muted-foreground">Merma</div>
                </div>
              </div>
              <div className="flex justify-between mt-2 pt-1.5 border-t text-[10px]">
                <span className="text-muted-foreground">Saldo pendiente</span>
                <span className={`font-semibold tabular-nums ${resFaltante === 0 ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400'}`}>
                  {resFaltante} de {resCantidad}
                </span>
              </div>
            </div>
            {/* Sugerencia si vencido sin haber recibido nada */}
            {resVencido && prevTotal === 0 && resFaltante > 0 && resLiq === 0 && (
              <button
                type="button"
                onClick={() => setResolucionForm({ ...resolucionForm, cantidad_liquidacion: resFaltante })}
                className="w-full text-left text-[11px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-2 rounded text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                data-testid="btn-sugerencia-cobrar-saldo"
              >
                <span className="font-semibold">Sugerencia:</span> el plazo venció y el proveedor no entregó.{' '}
                <span className="underline">Click para cobrar el saldo ({resFaltante}) al proveedor</span>.
              </button>
            )}
            {/* Inputs como DELTA (cantidad a agregar AHORA) */}
            {resFaltante === 0 ? (
              <div className="text-[11px] text-center text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 rounded-md px-3 py-2">
                ✓ Este envío ya está completo. No hay saldo pendiente para asignar.
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-emerald-600 font-medium">+ Recuperar</Label>
                  <Input type="number" min={0} max={resFaltante} value={resolucionForm.cantidad_recuperada} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_recuperada: e.target.value })} data-testid="input-res-recuperado" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Vuelven al lote bueno</p>
                </div>
                <div>
                  <Label className="text-xs text-orange-600 font-medium">+ A cobrar al proveedor</Label>
                  <Input type="number" min={0} max={resFaltante} value={resolucionForm.cantidad_liquidacion} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_liquidacion: e.target.value })} data-testid="input-res-liquidacion" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">El servicio no las recuperó · se le facturan</p>
                </div>
                <div>
                  <Label className="text-xs text-blue-600 font-medium">+ Pasa a evaluación de tela</Label>
                  <Input type="number" min={0} max={resFaltante} value={resolucionForm.cantidad_pasa_a_tela} onChange={e => setResolucionForm({ ...resolucionForm, cantidad_pasa_a_tela: e.target.value })} data-testid="input-res-pasa-a-tela" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Servicio OK pero detectó defecto de tela · va a Acabado</p>
                </div>
              </>
            )}
            {/* Resumen del resultado tras guardar */}
            {resDelta > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-[10px] mb-1">
                  <span>Asignando ahora: <span className="font-semibold tabular-nums">{resDelta}</span></span>
                  <span className={resExcede ? 'text-red-600 font-semibold' : (resTotal === resCantidad ? 'text-emerald-600 font-semibold' : 'text-amber-600')}>
                    {resExcede
                      ? `EXCEDE saldo +${resDelta - resFaltante}`
                      : (resTotal === resCantidad ? 'CIERRA EL ENVÍO ✓' : `Quedarán ${resCantidad - resTotal} pendientes`)}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${resExcede ? 'bg-red-500' : resTotal === resCantidad ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(Math.round(resTotal / Math.max(resCantidad, 1) * 100), 100)}%` }} />
                </div>
              </div>
            )}
            {resPat > 0 && (
              <div className="text-[11px] bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2 py-1.5 rounded text-blue-700 dark:text-blue-300">
                ℹ Se creará automáticamente un fallado de tela por {resPat} prendas en evaluación.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setResolucionDialogOpen(false)}>Cancelar</Button>
            <Button
              type="button" size="sm"
              onClick={handleSaveResolucion}
              disabled={saving || resExcede || resDelta === 0 || resFaltante === 0}
              data-testid="btn-guardar-resolucion"
            >
              {saving
                ? 'Guardando...'
                : (resTotal === resCantidad ? 'Confirmar y cerrar envío' : 'Guardar avance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: Resolver tela (parcial / acumulativo) */}
      <Dialog open={!!telaModal} onOpenChange={(o) => { if (!o) setTelaModal(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-resolver-tela">
          <DialogHeader>
            <DialogTitle className="text-sm">Resolver tela</DialogTitle>
          </DialogHeader>
          {telaModal && (() => {
            const det = Number(telaModal.cantidad_detectada) || 0;
            const recAct = Number(telaModal.cantidad_tela_recuperada) || 0;
            const liqAct = Number(telaModal.cantidad_tela_liquidada) || 0;
            const pend = Math.max(det - recAct - liqAct, 0);
            const dRec = parseFloat(telaForm.agregar_recuperada) || 0;
            const dLiq = parseFloat(telaForm.agregar_liquidada) || 0;
            const nuevoRec = recAct + dRec;
            const nuevoLiq = liqAct + dLiq;
            const nuevoPend = Math.max(det - nuevoRec - nuevoLiq, 0);
            const excede = (dRec + dLiq) > pend + 0.0001;
            return (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Detectado:</span><span className="font-mono">{det}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Recuperado hasta hoy:</span><span className="font-mono text-emerald-600">{recAct}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Liquidado hasta hoy:</span><span className="font-mono text-red-600">{liqAct}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1 font-semibold"><span>Pendiente:</span><span className="font-mono">{pend}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs flex items-center gap-1 text-emerald-700"><span>+ Recuperar</span></Label>
                    <Input
                      type="number" min={0} max={pend} step={1}
                      value={telaForm.agregar_recuperada}
                      onChange={e => setTelaForm({ ...telaForm, agregar_recuperada: e.target.value })}
                      className="h-8 text-sm font-mono"
                      data-testid="input-tela-recuperar"
                    />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1 text-red-700"><span>+ Liquidar</span></Label>
                    <Input
                      type="number" min={0} max={pend} step={1}
                      value={telaForm.agregar_liquidada}
                      onChange={e => setTelaForm({ ...telaForm, agregar_liquidada: e.target.value })}
                      className="h-8 text-sm font-mono"
                      data-testid="input-tela-liquidar"
                    />
                  </div>
                </div>

                {(dRec > 0 || dLiq > 0) && (
                  <div className={`text-[11px] rounded-md px-3 py-2 border ${excede ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300'}`}>
                    Después de guardar: rec={nuevoRec}, liq={nuevoLiq}, pendiente={nuevoPend}
                    {nuevoPend === 0 && !excede && <> · <strong>se cerrará</strong></>}
                    {excede && <> · <strong>excede el pendiente</strong></>}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Tip: puedes guardar parcial varias veces hasta llegar a 0 pendientes.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setTelaModal(null)}>Cancelar</Button>
            <Button
              type="button" size="sm"
              onClick={submitResolverTela}
              disabled={saving || (!parseFloat(telaForm.agregar_recuperada) && !parseFloat(telaForm.agregar_liquidada))}
              data-testid="btn-submit-resolver-tela"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

