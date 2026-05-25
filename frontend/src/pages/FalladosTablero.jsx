/**
 * FalladosTablero.jsx — Tablero supervisor (PC) Sprint 2
 *
 * Vista única consolidada de fallados/arreglos ordenada por urgencia.
 * Reusa el endpoint GET /api/fallados/tablero (creado en fallados_v2.py).
 *
 * Funcionalidad:
 *  - 4 KPIs arriba que funcionan como filtros (Sin asignar / Vencidos / Por vencer / En proceso)
 *  - Tabla agrupada por sección, urgentes arriba
 *  - Acciones inline:
 *      * Sin asignar → "Asignar a..." (modal)
 *      * Arreglos abiertos → "Recibí OK" / "Parcial" / "Merma" / "Prórroga"
 *  - Búsqueda + filtros por servicio y marca
 *  - Refresh manual y automático cada 60s (opcional)
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  RefreshCw, Search, AlertTriangle, Clock, CheckCircle2, Inbox,
  Loader2, X, Calendar, User, Package, ChevronRight,
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const PLAZO_DEFAULT_DIAS = 3;

const fmtFecha = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
};

const fmtFechaCorta = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const [, m, dd] = s.split('-');
  return `${dd}/${m}`;
};

const diasEntre = (fecha) => {
  if (!fecha) return null;
  const f = new Date(String(fecha).slice(0, 10));
  const hoy = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((f - hoy) / 86400000);
};


// ─── Modal: Asignar arreglo a un fallado sin asignar ────────────────────
const ModalAsignar = ({ open, registro, onClose, onSaved }) => {
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [form, setForm] = useState({
    cantidad: '',
    servicio_id: '',
    persona_id: '',
    fecha_envio: new Date().toISOString().slice(0, 10),
    fecha_limite: '',
    observacion: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // Cargar catálogos
      Promise.all([
        axios.get(`${API}/servicios-produccion`, { headers: hdrs() }).catch(() => ({ data: [] })),
        axios.get(`${API}/personas-produccion`, { headers: hdrs() }).catch(() => ({ data: [] })),
      ]).then(([s, p]) => {
        setServicios(Array.isArray(s.data) ? s.data : (s.data.items || []));
        setPersonas(Array.isArray(p.data) ? p.data : (p.data.items || []));
      });
      // Inicializar form con cantidad pendiente del registro
      const limite = new Date();
      limite.setDate(limite.getDate() + PLAZO_DEFAULT_DIAS);
      setForm({
        cantidad: registro?.pendiente_sin_asignar || '',
        servicio_id: '',
        persona_id: '',
        fecha_envio: new Date().toISOString().slice(0, 10),
        fecha_limite: limite.toISOString().slice(0, 10),
        observacion: '',
      });
    }
  }, [open, registro?.registro_id]);

  const handleGuardar = async () => {
    const cant = parseInt(form.cantidad);
    if (!cant || cant <= 0) return toast.error('Cantidad inválida');
    if (!form.servicio_id) return toast.error('Selecciona un servicio');
    if (!form.persona_id) return toast.error('Selecciona una persona');
    if (!form.fecha_limite) return toast.error('Define la fecha límite');

    setSaving(true);
    try {
      await axios.post(
        `${API}/registros/${registro.registro_id}/arreglos`,
        {
          cantidad: cant,
          servicio_id: form.servicio_id,
          persona_id: form.persona_id,
          fecha_envio: form.fecha_envio,
          fecha_limite: form.fecha_limite,
          observacion: form.observacion || null,
        },
        { headers: hdrs() }
      );
      toast.success('Arreglo asignado');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al asignar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar arreglo</DialogTitle>
          <DialogDescription>
            Corte <span className="font-mono font-medium">{registro?.n_corte}</span> · {registro?.modelo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Cantidad a enviar</Label>
            <Input
              type="number" min={1}
              value={form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              className="h-10"
            />
          </div>

          <div>
            <Label className="text-xs">Servicio</Label>
            <Select value={form.servicio_id} onValueChange={(v) => setForm({ ...form, servicio_id: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Costura, Lavado, Estampado…" /></SelectTrigger>
              <SelectContent>
                {servicios.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Persona / proveedor</Label>
            <Select value={form.persona_id} onValueChange={(v) => setForm({ ...form, persona_id: v })}>
              <SelectTrigger className="h-10"><SelectValue placeholder="A quién se envía…" /></SelectTrigger>
              <SelectContent>
                {personas
                  .filter(p => p.activo !== false)
                  .map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} {p.tipo_persona === 'EXTERNO' ? '(ext.)' : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha envío</Label>
              <Input
                type="date"
                value={form.fecha_envio}
                onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha límite</Label>
              <Input
                type="date"
                value={form.fecha_limite}
                onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
                className="h-10"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Plazo por defecto: {PLAZO_DEFAULT_DIAS} días.
          </p>

          <div>
            <Label className="text-xs">Observación (opcional)</Label>
            <textarea
              value={form.observacion}
              onChange={(e) => setForm({ ...form, observacion: e.target.value })}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ─── Modal: Registrar entrega parcial ───────────────────────────────────
// Render CONDICIONAL según tipo_arreglo:
//   - servicio (proveedor): OK + Liquidación + checkbox "Enviar a facturación"
//   - tela     (interno):   OK + LQ Leve + LQ Grave (sin checkbox)
// En ambos casos, link rojo para "Marcar como NO devuelto".
const ModalEntrega = ({ open, arreglo, onClose, onSaved }) => {
  const esServicio = arreglo?.tipo_arreglo === 'servicio';
  const yaMarcado  = Boolean(arreglo?.marcado_para_cobro);

  const [form, setForm] = useState({
    cant_ok: '',
    cant_lq_leve: '', cant_lq_grave: '',   // solo tela
    cant_liquidacion: '',                  // solo servicio
    enviar_a_facturacion: false,           // solo servicio
    observacion: '',
  });
  const [modoNoDev, setModoNoDev] = useState(false);
  const [noDevForm, setNoDevForm] = useState({ cant_no_devuelto: '', motivo: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        cant_ok: '',
        cant_lq_leve: '', cant_lq_grave: '',
        cant_liquidacion: '',
        enviar_a_facturacion: false,
        observacion: '',
      });
      setNoDevForm({ cant_no_devuelto: '', motivo: '' });
      setModoNoDev(false);
    }
  }, [open, arreglo?.arreglo_id]);

  const pendiente = arreglo?.pendiente || 0;
  const ok  = parseInt(form.cant_ok) || 0;
  const lqL = parseInt(form.cant_lq_leve) || 0;
  const lqG = parseInt(form.cant_lq_grave) || 0;
  const liq = parseInt(form.cant_liquidacion) || 0;
  const total = esServicio ? (ok + liq) : (ok + lqL + lqG);
  const excede = total > pendiente;

  const noDev = parseInt(noDevForm.cant_no_devuelto) || 0;
  const excedeNoDev = noDev > pendiente;

  const handleGuardarEntrega = async () => {
    if (total === 0) return toast.error('Indica al menos una cantidad');
    if (excede) return toast.error(`Excede el pendiente (${pendiente})`);
    setSaving(true);
    try {
      const body = esServicio
        ? {
            cant_ok: ok,
            cant_liquidacion: liq,
            cant_no_devuelto: 0,
            enviar_a_facturacion: Boolean(form.enviar_a_facturacion) && liq > 0 && !yaMarcado,
            observacion: form.observacion || null,
          }
        : {
            cant_ok: ok,
            cant_lq_leve: lqL,
            cant_lq_grave: lqG,
            cant_no_devuelto: 0,
            observacion: form.observacion || null,
          };
      const r = await axios.post(
        `${API}/arreglos/${arreglo.arreglo_id}/entregas`,
        body,
        { headers: hdrs() },
      );
      if (esServicio && body.enviar_a_facturacion && r.data?.marcado_para_cobro) {
        toast.success('Entrega registrada · enviada a facturación');
      } else {
        toast.success('Entrega registrada');
      }
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarNoDev = async () => {
    if (noDev <= 0) return toast.error('Indica la cantidad no devuelta');
    if (excedeNoDev) return toast.error(`Excede el pendiente (${pendiente})`);
    if (!noDevForm.motivo.trim()) return toast.error('El motivo es obligatorio');
    setSaving(true);
    try {
      // body limpio según tipo para no chocar con la validación 422 del backend
      const body = esServicio
        ? {
            cant_ok: 0, cant_liquidacion: 0, cant_no_devuelto: noDev,
            observacion: `[NO DEVUELTO] ${noDevForm.motivo.trim()}`,
          }
        : {
            cant_ok: 0, cant_lq_leve: 0, cant_lq_grave: 0, cant_no_devuelto: noDev,
            observacion: `[NO DEVUELTO] ${noDevForm.motivo.trim()}`,
          };
      await axios.post(
        `${API}/arreglos/${arreglo.arreglo_id}/entregas`,
        body,
        { headers: hdrs() },
      );
      toast.success(`Marcado ${noDev} como NO devuelto`);
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modoNoDev ? 'Marcar como NO devuelto' : 'Recibir entrega'}</DialogTitle>
          <DialogDescription>
            Corte <span className="font-mono">{arreglo?.n_corte}</span>
            {arreglo?.servicio && <> · {arreglo.servicio}</>}
            {arreglo?.persona && <> · {arreglo.persona}</>}
            <br />
            <span className="text-xs">
              {esServicio ? 'Arreglo a proveedor' : 'Arreglo interno (tela)'} · Pendiente: <b>{pendiente}</b> prendas
            </span>
          </DialogDescription>
        </DialogHeader>

        {!modoNoDev && (
          <div className="space-y-3 py-2">
            {esServicio ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-emerald-700">✓ OK</Label>
                  <Input
                    type="number" min={0} max={pendiente}
                    value={form.cant_ok}
                    onChange={(e) => setForm({ ...form, cant_ok: e.target.value })}
                    className="h-10 text-center text-lg font-bold border-emerald-300"
                  />
                </div>
                <div>
                  <Label className="text-xs text-orange-700">⚠ Liquidación</Label>
                  <Input
                    type="number" min={0} max={pendiente}
                    value={form.cant_liquidacion}
                    onChange={(e) => setForm({ ...form, cant_liquidacion: e.target.value })}
                    className="h-10 text-center text-lg font-bold border-orange-400"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-emerald-700">✓ OK</Label>
                  <Input
                    type="number" min={0} max={pendiente}
                    value={form.cant_ok}
                    onChange={(e) => setForm({ ...form, cant_ok: e.target.value })}
                    className="h-10 text-center text-lg font-bold border-emerald-300"
                  />
                </div>
                <div>
                  <Label className="text-xs text-amber-700">⚠ LQ Leve</Label>
                  <Input
                    type="number" min={0} max={pendiente}
                    value={form.cant_lq_leve}
                    onChange={(e) => setForm({ ...form, cant_lq_leve: e.target.value })}
                    className="h-10 text-center text-lg font-bold border-amber-300"
                  />
                </div>
                <div>
                  <Label className="text-xs text-orange-700">⚠ LQ Grave</Label>
                  <Input
                    type="number" min={0} max={pendiente}
                    value={form.cant_lq_grave}
                    onChange={(e) => setForm({ ...form, cant_lq_grave: e.target.value })}
                    className="h-10 text-center text-lg font-bold border-orange-400"
                  />
                </div>
              </div>
            )}

            <div className={`text-xs text-center ${excede ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
              Total a registrar: {total} {excede ? `(excede ${pendiente})` : ''}
            </div>

            {/* Checkbox de facturación: SOLO servicio + hay liquidación */}
            {esServicio && liq > 0 && (
              <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-2.5">
                {yaMarcado ? (
                  <p className="text-[11px] text-orange-800 dark:text-orange-200 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Este arreglo ya estaba marcado para cobro previamente.
                  </p>
                ) : (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enviar_a_facturacion}
                      onChange={(e) => setForm({ ...form, enviar_a_facturacion: e.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-orange-600"
                    />
                    <span className="text-[12px] text-orange-900 dark:text-orange-100">
                      <b>Enviar a facturación al proveedor</b>
                      <span className="block text-[11px] text-orange-700 dark:text-orange-300 font-normal mt-0.5">
                        Si tildás, este lote aparecerá en Calidad → Fallados y Arreglos para que después lo cobres.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">Observación (opcional)</Label>
              <textarea
                value={form.observacion}
                onChange={(e) => setForm({ ...form, observacion: e.target.value })}
                className="w-full min-h-[50px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="border-t pt-2 text-center">
              <button
                type="button"
                onClick={() => setModoNoDev(true)}
                className="text-xs text-red-600 underline font-semibold"
              >
                ⚠ Marcar como NO devuelto (proveedor no respondió)
              </button>
            </div>
          </div>
        )}

        {modoNoDev && (
          <div className="space-y-3 py-2">
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
              Esta opción registra una pérdida porque el proveedor no devolvió la mercancía.
              Queda como histórico pero no toca almacén ni distribución.
            </div>
            <div>
              <Label className="text-xs text-red-700">Cantidad NO devuelta</Label>
              <Input
                type="number" min={1} max={pendiente}
                value={noDevForm.cant_no_devuelto}
                onChange={(e) => setNoDevForm({ ...noDevForm, cant_no_devuelto: e.target.value })}
                className="h-10 text-center text-lg font-bold border-red-300"
              />
            </div>
            <div>
              <Label className="text-xs">Motivo (obligatorio)</Label>
              <textarea
                value={noDevForm.motivo}
                onChange={(e) => setNoDevForm({ ...noDevForm, motivo: e.target.value })}
                placeholder="Ej: proveedor no respondió a llamadas durante 2 semanas"
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setModoNoDev(false)}
              className="text-xs text-muted-foreground underline"
            >
              ← Volver a recibir entrega
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {!modoNoDev && (
            <Button onClick={handleGuardarEntrega} disabled={saving || excede || total === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar entrega'}
            </Button>
          )}
          {modoNoDev && (
            <Button onClick={handleGuardarNoDev} disabled={saving || excedeNoDev || noDev <= 0 || !noDevForm.motivo.trim()} variant="destructive">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar pérdida'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ─── Modal: Dar prórroga ────────────────────────────────────────────────
const ModalProrroga = ({ open, arreglo, onClose, onSaved }) => {
  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const prorrogasUsadas = arreglo?.num_prorrogas || 0;
  const limiteAlcanzado = prorrogasUsadas >= 2;

  useEffect(() => {
    if (open) { setDias(3); setMotivo(''); }
  }, [open, arreglo?.arreglo_id]);

  const handleGuardar = async () => {
    if (limiteAlcanzado) return;
    const diasN = parseInt(dias);
    if (!diasN || diasN < 1 || diasN > 14) return toast.error('Días debe estar entre 1 y 14');
    setSaving(true);
    try {
      const r = await axios.post(
        `${API}/arreglos/${arreglo.arreglo_id}/prorroga`,
        { dias: diasN, motivo: motivo.trim() || null },
        { headers: hdrs() }
      );
      toast.success(`Prórroga otorgada · nueva fecha límite: ${fmtFecha(r.data.fecha_limite_nueva)} · quedan ${r.data.prorrogas_restantes}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al dar prórroga');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dar prórroga</DialogTitle>
          <DialogDescription>
            Corte <span className="font-mono">{arreglo?.n_corte}</span> · vence {fmtFecha(arreglo?.fecha_limite)}
            <br />Prórrogas usadas: {prorrogasUsadas}/2 — entre 1 y 14 días
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {limiteAlcanzado && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-md px-3 py-2">
              Ya se otorgaron las 2 prórrogas permitidas. Pasar a facturación.
            </div>
          )}
          <div>
            <Label className="text-xs">Días adicionales (1–14)</Label>
            <Input
              type="number" min={1} max={14}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              disabled={limiteAlcanzado}
              className="h-10 text-center text-lg font-bold"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Sugerido: 3 días</p>
          </div>
          <div>
            <Label className="text-xs">Motivo (opcional)</Label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: proveedor tuvo emergencia, prometió entregar el viernes"
              disabled={limiteAlcanzado}
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleGuardar}
            disabled={saving || limiteAlcanzado}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dar prórroga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


// ─── KPI card clickeable ────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, tone, active, onClick }) => {
  const tones = {
    red:    { v: 'text-red-600',    border: 'border-l-red-500',    bg: 'hover:bg-red-50/40' },
    amber:  { v: 'text-amber-600',  border: 'border-l-amber-500',  bg: 'hover:bg-amber-50/40' },
    blue:   { v: 'text-blue-700',   border: 'border-l-blue-500',   bg: 'hover:bg-blue-50/40' },
    purple: { v: 'text-purple-700', border: 'border-l-purple-500', bg: 'hover:bg-purple-50/40' },
  }[tone] || { v: 'text-foreground', border: 'border-l-gray-400', bg: 'hover:bg-muted/30' };

  return (
    <button
      onClick={onClick}
      className={`text-left bg-card border border-l-[4px] ${tones.border} rounded-lg px-4 py-3 transition ${tones.bg} ${active ? 'ring-2 ring-primary ring-offset-1' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${tones.v}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </button>
  );
};


// ─── Fila de "Sin asignar" ──────────────────────────────────────────────
const FilaSinAsignar = ({ registro, onAsignar }) => (
  <tr className="border-b hover:bg-muted/30">
    <td className="px-3 py-2.5">
      <div className="font-mono font-semibold text-sm">{registro.n_corte}</div>
      <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{registro.modelo}</div>
    </td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground">{registro.marca || '—'}</td>
    <td className="px-3 py-2.5 font-mono font-semibold text-sm">{registro.pendiente_sin_asignar}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground" colSpan={3}>
      <span className="inline-flex items-center gap-1 text-purple-700 font-semibold">
        <Inbox className="h-3 w-3" /> Pendiente de asignar
      </span>
    </td>
    <td className="px-3 py-2.5">
      <button
        onClick={() => onAsignar(registro)}
        className="px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold inline-flex items-center gap-1"
      >
        Asignar <ChevronRight className="h-3 w-3" />
      </button>
    </td>
  </tr>
);


// ─── Fila de arreglo (vencido / por vencer / en proceso) ────────────────
const FilaArreglo = ({ arreglo, urgencia, onEntregar, onProrroga }) => {
  const d = diasEntre(arreglo.fecha_limite);
  let badgeFecha;
  if (urgencia === 'vencidos') {
    badgeFecha = <span className="text-red-700 font-bold">{fmtFechaCorta(arreglo.fecha_limite)} ({Math.abs(d)}d atraso)</span>;
  } else if (urgencia === 'por_vencer') {
    badgeFecha = <span className="text-amber-700 font-semibold">{fmtFechaCorta(arreglo.fecha_limite)} (en {d}d)</span>;
  } else {
    badgeFecha = <span className="text-muted-foreground">{fmtFechaCorta(arreglo.fecha_limite)} (en {d}d)</span>;
  }

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2.5">
        <div className="font-mono font-semibold text-sm">{arreglo.n_corte}</div>
        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{arreglo.modelo}</div>
      </td>
      <td className="px-3 py-2.5 text-xs">{arreglo.marca || '—'}</td>
      <td className="px-3 py-2.5">
        <span className="font-mono font-bold text-sm">{arreglo.pendiente}</span>
        <span className="text-[10px] text-muted-foreground"> / {arreglo.cantidad}</span>
      </td>
      <td className="px-3 py-2.5 text-xs">
        <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-medium">
          {arreglo.servicio}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs">{arreglo.persona || '—'}</td>
      <td className="px-3 py-2.5 text-xs">
        {fmtFechaCorta(arreglo.fecha_envio)} → {badgeFecha}
        {arreglo.num_prorrogas > 0 && (
          <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-bold">
            +{arreglo.num_prorrogas} prórr
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <button
            onClick={() => onEntregar(arreglo)}
            className="px-2 py-1 rounded text-[11px] font-semibold border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
          >
            Entrega
          </button>
          {(urgencia === 'vencidos' || urgencia === 'por_vencer') && arreglo.num_prorrogas < 2 && (
            <button
              onClick={() => onProrroga(arreglo)}
              className="px-2 py-1 rounded text-[11px] font-semibold border border-amber-600 text-amber-700 hover:bg-amber-50"
            >
              Prórroga
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};


// ─── Componente principal ──────────────────────────────────────────────
export default function FalladosTablero() {
  const [searchParams, setSearchParams] = useSearchParams();
  const corteIdFiltro = searchParams.get('corte_id') || '';

  const [data, setData] = useState({ grupos: { sin_asignar: [], vencidos: [], por_vencer: [], en_proceso: [] }, kpis: {} });
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('todos'); // 'todos' | 'sin_asignar' | 'vencidos' | 'por_vencer' | 'en_proceso'
  // Cuando se filtra por corte_id, el número de corte para mostrar en el chip.
  // Lo derivamos del primer arreglo que tenga ese registro_id en la respuesta.
  const [corteFiltroLabel, setCorteFiltroLabel] = useState('');

  // Modales
  const [asignarOpen, setAsignarOpen] = useState(false);
  const [asignarReg, setAsignarReg] = useState(null);
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [entregaArr, setEntregaArr] = useState(null);
  const [prorrogaOpen, setProrrogaOpen] = useState(false);
  const [prorrogaArr, setProrrogaArr] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = corteIdFiltro ? `?corte_id=${encodeURIComponent(corteIdFiltro)}` : '';
      const r = await axios.get(`${API}/fallados/tablero${params}`, { headers: hdrs() });
      setData(r.data);
      // Derivar el n_corte para el chip
      if (corteIdFiltro) {
        const g = r.data?.grupos || {};
        const todos = [
          ...(g.vencidos || []), ...(g.por_vencer || []), ...(g.en_proceso || []),
        ];
        const primero = todos.find(x => x.registro_id === corteIdFiltro);
        setCorteFiltroLabel(primero?.n_corte || corteIdFiltro);
      } else {
        setCorteFiltroLabel('');
      }
    } catch (e) {
      toast.error('No se pudo cargar el tablero');
    } finally {
      setLoading(false);
    }
  }, [corteIdFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

  const limpiarFiltroCorte = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('corte_id');
    setSearchParams(next, { replace: true });
  };

  // Filtrado por búsqueda
  const filtrar = useCallback((items) => {
    if (!busqueda.trim()) return items;
    const q = busqueda.toLowerCase().trim();
    return items.filter(i =>
      (i.n_corte || '').toLowerCase().includes(q) ||
      (i.modelo || '').toLowerCase().includes(q) ||
      (i.marca || '').toLowerCase().includes(q) ||
      (i.persona || '').toLowerCase().includes(q)
    );
  }, [busqueda]);

  const grupos = data.grupos || {};
  const kpis = data.kpis || {};

  const mostrarGrupo = (g) => filtroActivo === 'todos' || filtroActivo === g;

  const totalVisible = useMemo(() => {
    let n = 0;
    if (mostrarGrupo('sin_asignar')) n += filtrar(grupos.sin_asignar || []).length;
    if (mostrarGrupo('vencidos'))    n += filtrar(grupos.vencidos || []).length;
    if (mostrarGrupo('por_vencer'))  n += filtrar(grupos.por_vencer || []).length;
    if (mostrarGrupo('en_proceso'))  n += filtrar(grupos.en_proceso || []).length;
    return n;
  }, [grupos, filtroActivo, filtrar]);

  // Lista de arreglos para vista móvil (orden: vencidos > por_vencer > en_proceso)
  const arreglosMobile = useMemo(() => {
    const sin = filtrar(grupos.sin_asignar || []).map(x => ({ ...x, _grupo: 'sin_asignar' }));
    const ven = filtrar(grupos.vencidos    || []).map(x => ({ ...x, _grupo: 'vencidos' }));
    const por = filtrar(grupos.por_vencer  || []).map(x => ({ ...x, _grupo: 'por_vencer' }));
    const eps = filtrar(grupos.en_proceso  || []).map(x => ({ ...x, _grupo: 'en_proceso' }));
    return [
      ...(mostrarGrupo('sin_asignar') ? sin : []),
      ...(mostrarGrupo('vencidos')    ? ven : []),
      ...(mostrarGrupo('por_vencer')  ? por : []),
      ...(mostrarGrupo('en_proceso')  ? eps : []),
    ];
  }, [grupos, filtroActivo, filtrar]);

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      {/* ================== VISTA MÓVIL ================== */}
      <div className="md:hidden">
        <div className="bg-gray-900 text-white px-4 py-3 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold">Fallados — Tablero</h1>
              <p className="text-[11px] opacity-80">{totalVisible} {totalVisible === 1 ? 'arreglo' : 'arreglos'} · hoy {data.hoy}</p>
            </div>
            <button
              onClick={cargar}
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="bg-card border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar corte, modelo, persona…"
              className="pl-9 h-9"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* KPIs 2x2 */}
        <div className="p-3 grid grid-cols-2 gap-2 bg-muted/20 border-b">
          <KpiCard
            label="Sin asignar"
            value={kpis.sin_asignar?.n_arreglos || 0}
            sub={`${kpis.sin_asignar?.prendas || 0} prendas`}
            tone="purple"
            active={filtroActivo === 'sin_asignar'}
            onClick={() => setFiltroActivo(filtroActivo === 'sin_asignar' ? 'todos' : 'sin_asignar')}
          />
          <KpiCard
            label="Vencidos"
            value={kpis.vencidos?.n_arreglos || 0}
            sub={`${kpis.vencidos?.prendas || 0} prendas`}
            tone="red"
            active={filtroActivo === 'vencidos'}
            onClick={() => setFiltroActivo(filtroActivo === 'vencidos' ? 'todos' : 'vencidos')}
          />
          <KpiCard
            label="Por vencer"
            value={kpis.por_vencer?.n_arreglos || 0}
            sub={`${kpis.por_vencer?.prendas || 0} prendas`}
            tone="amber"
            active={filtroActivo === 'por_vencer'}
            onClick={() => setFiltroActivo(filtroActivo === 'por_vencer' ? 'todos' : 'por_vencer')}
          />
          <KpiCard
            label="En proceso"
            value={kpis.en_proceso?.n_arreglos || 0}
            sub={`${kpis.en_proceso?.prendas || 0} prendas`}
            tone="blue"
            active={filtroActivo === 'en_proceso'}
            onClick={() => setFiltroActivo(filtroActivo === 'en_proceso' ? 'todos' : 'en_proceso')}
          />
        </div>

        {/* Cards */}
        <div className="p-3 space-y-3">
          {loading && arreglosMobile.length === 0 && (
            <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
          {!loading && arreglosMobile.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
              No hay fallados con los filtros actuales.
            </div>
          )}
          {arreglosMobile.map((a) => {
            if (a._grupo === 'sin_asignar') {
              return (
                <div key={`m-sa-${a.registro_id}`} className="border-2 border-purple-300 bg-purple-50 rounded-xl p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-purple-700 font-bold">🟣 SIN ASIGNAR</div>
                      <div className="font-bold mt-1">{a.n_corte} · {a.modelo}</div>
                      <div className="text-xs text-muted-foreground">{a.marca || '—'}</div>
                    </div>
                    <span className="text-xs bg-purple-600 text-white font-bold px-2 py-0.5 rounded">{a.pendiente_sin_asignar}</span>
                  </div>
                  <button
                    onClick={() => { setAsignarReg(a); setAsignarOpen(true); }}
                    className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1"
                  >
                    Asignar a proveedor <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              );
            }
            const d = diasEntre(a.fecha_limite);
            const esServ = a.tipo_arreglo === 'servicio';
            const histLine = esServ
              ? `Hist: ${a.hist_ok || 0} OK · ${a.hist_liquidacion || 0} Liquidación${(a.hist_no_devuelto || 0) > 0 ? ` · ${a.hist_no_devuelto} no dev` : ''}`
              : `Hist: ${a.hist_ok || 0} OK · ${a.hist_lq_leve || 0} LQ Leve · ${a.hist_lq_grave || 0} LQ Grave${(a.hist_no_devuelto || 0) > 0 ? ` · ${a.hist_no_devuelto} no dev` : ''}`;
            let chip, bg, lab, bgB;
            if (a._grupo === 'vencidos') {
              chip = 'bg-red-600'; bg = 'border-red-300 bg-red-50'; bgB = 'bg-red-600';
              lab = `🔴 VENCIDO ${Math.abs(d)}d`;
            } else if (a._grupo === 'por_vencer') {
              chip = 'bg-amber-500'; bg = 'border-amber-300 bg-amber-50'; bgB = 'bg-amber-500';
              lab = d === 0 ? '🟡 VENCE HOY' : d === 1 ? '🟡 VENCE MAÑANA' : `🟡 EN ${d}d`;
            } else {
              chip = 'bg-blue-500'; bg = 'border-blue-200 bg-white'; bgB = 'bg-blue-500';
              lab = `🔵 EN PROCESO (en ${d}d)`;
            }
            const puedeProrroga = (a._grupo === 'vencidos' || a._grupo === 'por_vencer') && (a.num_prorrogas || 0) < 2;
            return (
              <div key={`m-${a._grupo}-${a.arreglo_id}`} className={`border-2 rounded-xl p-3 ${bg}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold`}>{lab}</div>
                    <div className="font-bold mt-1 truncate">{a.persona || '—'}</div>
                    <div className="text-xs text-muted-foreground">{a.servicio || '—'}</div>
                  </div>
                  <span className={`text-xs ${bgB} text-white font-bold px-2 py-0.5 rounded shrink-0`}>
                    {a.pendiente}/{a.cantidad}
                  </span>
                </div>
                <div className="text-xs text-foreground mt-2">{a.n_corte} · {a.modelo}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{histLine}</div>
                {(a.num_prorrogas || 0) > 0 && (
                  <div className="mt-1 text-[10px] text-purple-700 font-semibold">+{a.num_prorrogas} prórroga{a.num_prorrogas === 1 ? '' : 's'} usada{a.num_prorrogas === 1 ? '' : 's'}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => { setEntregaArr(a); setEntregaOpen(true); }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg"
                  >
                    📦 Recibir entrega
                  </button>
                  {puedeProrroga && (
                    <button
                      onClick={() => { setProrrogaArr(a); setProrrogaOpen(true); }}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-3 py-2 rounded-lg"
                    >
                      Prórroga
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modales (compartidos con desktop más abajo) */}
      </div>

      {/* Chip de filtro por corte (aplica a desktop y mobile) */}
      {corteIdFiltro && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900 px-4 sm:px-6 py-2 flex items-center gap-2 text-sm">
          <span className="text-blue-900 dark:text-blue-200">
            Filtrando por corte <span className="font-mono font-bold">{corteFiltroLabel || corteIdFiltro}</span>
          </span>
          <button
            type="button"
            onClick={limpiarFiltroCorte}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline"
          >
            <X className="h-3 w-3" /> Limpiar
          </button>
        </div>
      )}

      {/* ================== VISTA DESKTOP (md+) ================== */}
      <div className="hidden md:block">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-30">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Fallados — Control diario</h1>
            <p className="text-xs text-muted-foreground">{totalVisible} {totalVisible === 1 ? 'item' : 'items'} visibles · hoy {data.hoy}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar corte, modelo, persona…"
                className="pl-9 h-9 w-72"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" onClick={cargar} className="h-9 w-9">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="px-6 py-3 grid grid-cols-4 gap-3 bg-muted/30 border-t">
          <KpiCard
            label="Sin asignar"
            value={kpis.sin_asignar?.n_arreglos || 0}
            sub={`${kpis.sin_asignar?.prendas || 0} prendas pendientes`}
            tone="purple"
            active={filtroActivo === 'sin_asignar'}
            onClick={() => setFiltroActivo(filtroActivo === 'sin_asignar' ? 'todos' : 'sin_asignar')}
          />
          <KpiCard
            label="Vencidos"
            value={kpis.vencidos?.n_arreglos || 0}
            sub={`${kpis.vencidos?.prendas || 0} prendas`}
            tone="red"
            active={filtroActivo === 'vencidos'}
            onClick={() => setFiltroActivo(filtroActivo === 'vencidos' ? 'todos' : 'vencidos')}
          />
          <KpiCard
            label="Por vencer ≤ 3 días"
            value={kpis.por_vencer?.n_arreglos || 0}
            sub={`${kpis.por_vencer?.prendas || 0} prendas`}
            tone="amber"
            active={filtroActivo === 'por_vencer'}
            onClick={() => setFiltroActivo(filtroActivo === 'por_vencer' ? 'todos' : 'por_vencer')}
          />
          <KpiCard
            label="En proceso"
            value={kpis.en_proceso?.n_arreglos || 0}
            sub={`${kpis.en_proceso?.prendas || 0} prendas`}
            tone="blue"
            active={filtroActivo === 'en_proceso'}
            onClick={() => setFiltroActivo(filtroActivo === 'en_proceso' ? 'todos' : 'en_proceso')}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="p-6">
        {loading && totalVisible === 0 && (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}
        {!loading && totalVisible === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
            No hay fallados pendientes con los filtros actuales.
          </div>
        )}

        {totalVisible > 0 && (
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                  <th className="px-3 py-2 font-semibold">Corte / Modelo</th>
                  <th className="px-3 py-2 font-semibold">Marca</th>
                  <th className="px-3 py-2 font-semibold">Cant.</th>
                  <th className="px-3 py-2 font-semibold">Servicio</th>
                  <th className="px-3 py-2 font-semibold">Persona</th>
                  <th className="px-3 py-2 font-semibold">Envío → Límite</th>
                  <th className="px-3 py-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>

                {mostrarGrupo('sin_asignar') && filtrar(grupos.sin_asignar || []).length > 0 && (
                  <>
                    <tr className="bg-purple-50">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-800">
                        <Inbox className="inline h-3.5 w-3.5 mr-1" /> Sin asignar — {filtrar(grupos.sin_asignar).length} cortes
                      </td>
                    </tr>
                    {filtrar(grupos.sin_asignar).map(r => (
                      <FilaSinAsignar
                        key={`sa-${r.registro_id}`}
                        registro={r}
                        onAsignar={(reg) => { setAsignarReg(reg); setAsignarOpen(true); }}
                      />
                    ))}
                  </>
                )}

                {mostrarGrupo('vencidos') && filtrar(grupos.vencidos || []).length > 0 && (
                  <>
                    <tr className="bg-red-50">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-800">
                        <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> Vencidos — {filtrar(grupos.vencidos).length} arreglos
                      </td>
                    </tr>
                    {filtrar(grupos.vencidos).map(a => (
                      <FilaArreglo
                        key={`v-${a.arreglo_id}`}
                        arreglo={a}
                        urgencia="vencidos"
                        onEntregar={(arr) => { setEntregaArr(arr); setEntregaOpen(true); }}
                        onProrroga={(arr) => { setProrrogaArr(arr); setProrrogaOpen(true); }}
                      />
                    ))}
                  </>
                )}

                {mostrarGrupo('por_vencer') && filtrar(grupos.por_vencer || []).length > 0 && (
                  <>
                    <tr className="bg-amber-50">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                        <Clock className="inline h-3.5 w-3.5 mr-1" /> Por vencer en ≤ 3 días — {filtrar(grupos.por_vencer).length} arreglos
                      </td>
                    </tr>
                    {filtrar(grupos.por_vencer).map(a => (
                      <FilaArreglo
                        key={`pv-${a.arreglo_id}`}
                        arreglo={a}
                        urgencia="por_vencer"
                        onEntregar={(arr) => { setEntregaArr(arr); setEntregaOpen(true); }}
                        onProrroga={(arr) => { setProrrogaArr(arr); setProrrogaOpen(true); }}
                      />
                    ))}
                  </>
                )}

                {mostrarGrupo('en_proceso') && filtrar(grupos.en_proceso || []).length > 0 && (
                  <>
                    <tr className="bg-blue-50">
                      <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-800">
                        <Package className="inline h-3.5 w-3.5 mr-1" /> En proceso — {filtrar(grupos.en_proceso).length} arreglos
                      </td>
                    </tr>
                    {filtrar(grupos.en_proceso).map(a => (
                      <FilaArreglo
                        key={`ep-${a.arreglo_id}`}
                        arreglo={a}
                        urgencia="en_proceso"
                        onEntregar={(arr) => { setEntregaArr(arr); setEntregaOpen(true); }}
                        onProrroga={(arr) => { setProrrogaArr(arr); setProrrogaOpen(true); }}
                      />
                    ))}
                  </>
                )}

              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>{/* /vista desktop */}

      {/* Modales (compartidos móvil + desktop) */}
      <ModalAsignar
        open={asignarOpen}
        registro={asignarReg}
        onClose={() => setAsignarOpen(false)}
        onSaved={cargar}
      />
      <ModalEntrega
        open={entregaOpen}
        arreglo={entregaArr}
        onClose={() => setEntregaOpen(false)}
        onSaved={cargar}
      />
      <ModalProrroga
        open={prorrogaOpen}
        arreglo={prorrogaArr}
        onClose={() => setProrrogaOpen(false)}
        onSaved={cargar}
      />
    </div>
  );
}
