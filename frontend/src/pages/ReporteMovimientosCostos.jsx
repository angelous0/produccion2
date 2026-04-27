import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import {
  Receipt, Users, Package, DollarSign, RefreshCw, Search,
  FileCheck, Link2, Unlink, Download, Calendar, FilePlus,
  ExternalLink, Building2, Factory,
} from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const KpiCard = ({ label, value, icon: Icon, color = 'text-primary' }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={`text-xl font-bold ${color} truncate`}>{value}</p>
      </div>
    </CardContent>
  </Card>
);

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => {
  const dt = new Date(); dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
};
const firstOfMonthISO = () => {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const fmtMoney = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(v || 0));

export default function ReporteMovimientosCostos() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Filtros
  const [desde, setDesde] = useState(firstOfMonthISO());
  const [hasta, setHasta] = useState(todayISO());
  const [servicioId, setServicioId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [facturadoFiltro, setFacturadoFiltro] = useState(''); // '', 'si', 'no'
  const [tipoPersonaFiltro, setTipoPersonaFiltro] = useState(''); // '', 'INTERNO', 'EXTERNO'
  const [busqueda, setBusqueda] = useState('');

  // Catálogos
  const [servicios, setServicios] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [personasFiltradas, setPersonasFiltradas] = useState([]);

  // Selección múltiple
  const [seleccionados, setSeleccionados] = useState(new Set());

  // Modal vincular
  const [modalVincularOpen, setModalVincularOpen] = useState(false);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaId, setFacturaId] = useState('');

  // Modal generar factura borrador
  const [modalGenerarOpen, setModalGenerarOpen] = useState(false);
  const [genTipoDoc, setGenTipoDoc] = useState('factura'); // factura | boleta | recibo
  const [genAplicarIgv, setGenAplicarIgv] = useState(false);
  const [genNotas, setGenNotas] = useState('');
  const [generando, setGenerando] = useState(false);
  const [ultimaFacturaGenerada, setUltimaFacturaGenerada] = useState(null);
  const FINANZAS_URL = process.env.REACT_APP_FINANZAS_URL || 'http://localhost:3001';

  // Cargar catálogos
  useEffect(() => {
    (async () => {
      try {
        const [srvRes, perRes] = await Promise.all([
          axios.get(`${API}/api/servicios-produccion`),
          axios.get(`${API}/api/personas-produccion?activo=true`),
        ]);
        setServicios(srvRes.data || []);
        setPersonas(perRes.data || []);
      } catch {
        toast.error('Error al cargar catálogos');
      }
    })();
  }, []);

  // Cascada: cuando cambia servicio, filtrar personas
  useEffect(() => {
    if (!servicioId) {
      setPersonasFiltradas(personas);
      return;
    }
    const filtered = personas.filter(p => {
      const servicios = p.servicios || [];
      return servicios.some(s => (typeof s === 'string' ? s : s.servicio_id) === servicioId);
    });
    setPersonasFiltradas(filtered);
    // Si la persona seleccionada ya no pertenece al nuevo servicio, la limpio
    if (personaId && !filtered.some(p => p.id === personaId)) {
      setPersonaId('');
    }
  }, [servicioId, personas, personaId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (desde) params.fecha_desde = desde;
      if (hasta) params.fecha_hasta = hasta;
      if (servicioId) params.servicio_id = servicioId;
      if (personaId) params.persona_id = personaId;
      if (facturadoFiltro) params.facturado = facturadoFiltro;
      if (tipoPersonaFiltro) params.tipo_persona = tipoPersonaFiltro;
      const res = await axios.get(`${API}/api/reportes-produccion/movimientos-costos`, { params });
      setData(res.data);
      setSeleccionados(new Set()); // reset selección al refiltrar
    } catch {
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, servicioId, personaId, facturadoFiltro, tipoPersonaFiltro]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Items filtrados por búsqueda (cliente)
  const items = useMemo(() => {
    if (!data?.items) return [];
    if (!busqueda.trim()) return data.items;
    const q = busqueda.toLowerCase();
    return data.items.filter(it =>
      (it.n_corte || '').toLowerCase().includes(q) ||
      (it.modelo_nombre || '').toLowerCase().includes(q) ||
      (it.marca_nombre || '').toLowerCase().includes(q) ||
      (it.persona_nombre || '').toLowerCase().includes(q) ||
      (it.servicio_nombre || '').toLowerCase().includes(q) ||
      (it.factura_numero || '').toLowerCase().includes(q)
    );
  }, [data, busqueda]);

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (seleccionados.size === items.length) setSeleccionados(new Set());
    else setSeleccionados(new Set(items.map(i => i.movimiento_id)));
  };

  const totalesSeleccion = useMemo(() => {
    if (!seleccionados.size) return {
      count: 0, costo: 0, personas: [], facturados: 0, pendientes: 0,
      internos: 0, externos: 0, conCargo: 0, sinUnidad: 0,
    };
    let costo = 0;
    const personas = new Set();
    let facturados = 0, pendientes = 0;
    let internos = 0, externos = 0, conCargo = 0, sinUnidad = 0;
    for (const it of items) {
      if (!seleccionados.has(it.movimiento_id)) continue;
      costo += Number(it.costo_calculado || 0);
      if (it.persona_nombre) personas.add(it.persona_nombre);
      if (it.facturado) facturados++; else pendientes++;
      if (it.persona_tipo === 'INTERNO') {
        internos++;
        if (it.tiene_cargo_interno) conCargo++;
        if (!it.unidad_interna_id) sinUnidad++;
      } else {
        externos++;
      }
    }
    return {
      count: seleccionados.size, costo,
      personas: [...personas],
      facturados, pendientes,
      internos, externos, conCargo, sinUnidad,
      soloInternos: internos > 0 && externos === 0,
      soloExternos: externos > 0 && internos === 0,
      mezclado: internos > 0 && externos > 0,
    };
  }, [seleccionados, items]);

  const abrirModalVincular = () => {
    if (seleccionados.size === 0) {
      toast.info('Seleccioná al menos un movimiento');
      return;
    }
    setFacturaNumero('');
    setFacturaId('');
    setModalVincularOpen(true);
  };

  const vincular = async () => {
    if (!facturaNumero.trim()) {
      toast.error('Ingresá el número de factura');
      return;
    }
    // Si no hay factura_id, usamos el mismo número como ID temporal (antes de conectar a Finanzas)
    const fid = facturaId.trim() || `manual-${facturaNumero.trim()}`;
    try {
      const res = await axios.post(`${API}/api/reportes-produccion/movimientos-costos/vincular-factura-bulk`, {
        movimiento_ids: Array.from(seleccionados),
        factura_numero: facturaNumero.trim(),
        factura_id: fid,
      });
      toast.success(res.data?.message || 'Vinculados');
      setModalVincularOpen(false);
      setSeleccionados(new Set());
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al vincular');
    }
  };

  const abrirModalGenerar = () => {
    if (seleccionados.size === 0) { toast.info('Seleccioná al menos un movimiento'); return; }
    if (totalesSeleccion.mezclado) {
      toast.error('No podés mezclar personas INTERNO y EXTERNO en un mismo documento.');
      return;
    }
    if (totalesSeleccion.facturados > 0) {
      toast.error(`${totalesSeleccion.facturados} movimiento(s) ya están facturados. Desvinculalos primero.`);
      return;
    }
    if (totalesSeleccion.personas.length > 1) {
      toast.error(`Solo podés generar 1 documento por persona. Seleccionaste ${totalesSeleccion.personas.length} personas distintas.`);
      return;
    }
    if (totalesSeleccion.soloInternos && totalesSeleccion.sinUnidad > 0) {
      toast.error(`${totalesSeleccion.sinUnidad} persona(s) INTERNO sin unidad asignada.`);
      return;
    }
    // Reset del form
    setGenTipoDoc(totalesSeleccion.soloInternos ? 'nota_interna' : 'factura');
    setGenAplicarIgv(false);
    setGenNotas('');
    setModalGenerarOpen(true);
  };

  const generarFactura = async () => {
    setGenerando(true);
    try {
      const res = await axios.post(
        `${API}/api/reportes-produccion/movimientos-costos/generar-factura-borrador`,
        {
          movimiento_ids: Array.from(seleccionados),
          tipo_documento: genTipoDoc,
          aplicar_igv: genAplicarIgv,
          notas: genNotas || null,
        }
      );
      toast.success(res.data?.message || 'Factura borrador creada');
      setUltimaFacturaGenerada(res.data);
      setModalGenerarOpen(false);
      setSeleccionados(new Set());
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al generar factura borrador');
    } finally {
      setGenerando(false);
    }
  };

  const desvincular = async () => {
    if (seleccionados.size === 0) {
      toast.info('Seleccioná al menos un movimiento');
      return;
    }
    if (!window.confirm(`¿Desvincular ${seleccionados.size} movimiento(s)?`)) return;
    try {
      const res = await axios.post(`${API}/api/reportes-produccion/movimientos-costos/desvincular-factura-bulk`,
        Array.from(seleccionados));
      toast.success(res.data?.message || 'Desvinculados');
      setSeleccionados(new Set());
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al desvincular');
    }
  };

  const exportarCSV = () => {
    if (!items.length) return;
    const headers = [
      'N° Corte', 'Fecha Inicio', 'Fecha Fin', 'Persona', 'Servicio',
      'Modelo', 'Marca', 'Tipo', 'Prendas', 'Tarifa', 'Costo Ref.', 'Factura', 'Estado',
    ];
    const rows = items.map(it => [
      it.n_corte || '', it.fecha_inicio || '', it.fecha_fin || '',
      it.persona_nombre || '', it.servicio_nombre || '',
      it.modelo_nombre || '', it.marca_nombre || '', it.tipo_nombre || '',
      it.prendas || 0,
      Number(it.tarifa_aplicada || 0).toFixed(4),
      Number(it.costo_calculado || 0).toFixed(2),
      it.factura_numero || '',
      it.facturado ? 'Facturado' : 'Pendiente',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-costos_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resumen = data?.resumen || {};
  const facturas = data?.facturas || [];

  return (
    <div className="space-y-5" data-testid="reporte-movimientos-costos">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Movimientos y costos de producción
          </h2>
          <p className="text-muted-foreground">
            Reporte de servicios prestados por terceros. Permite vincular a factura/gasto de Finanzas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" onClick={exportarCSV} disabled={!items.length}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-7 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Servicio</Label>
            <Select value={servicioId || 'todos'} onValueChange={v => setServicioId(v === 'todos' ? '' : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos los servicios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los servicios</SelectItem>
                {servicios.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Persona
              {servicioId && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({personasFiltradas.length} en el servicio)
                </span>
              )}
            </Label>
            <Select value={personaId || 'todos'} onValueChange={v => setPersonaId(v === 'todos' ? '' : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas las personas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {personasFiltradas.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <Select value={facturadoFiltro || 'todos'} onValueChange={v => setFacturadoFiltro(v === 'todos' ? '' : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="si">Facturados</SelectItem>
                <SelectItem value="no">Pendientes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo persona</Label>
            <Select value={tipoPersonaFiltro || 'todos'} onValueChange={v => setTipoPersonaFiltro(v === 'todos' ? '' : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="EXTERNO">Solo externos</SelectItem>
                <SelectItem value="INTERNO">Solo internos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Corte, modelo, factura..."
                className="h-9 pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard label="Movimientos" value={resumen.total_movimientos ?? 0} icon={Package} />
        <KpiCard label="Costo total" value={fmtMoney(resumen.total_costo)} icon={DollarSign} color="text-blue-600" />
        <KpiCard label="Prendas" value={resumen.total_prendas ?? 0} icon={Package} color="text-emerald-600" />
        <KpiCard
          label="Externo"
          value={`${resumen.externos ?? 0} · ${fmtMoney(resumen.costo_externo)}`}
          icon={Users}
          color="text-slate-600"
        />
        <KpiCard
          label="Interno"
          value={`${resumen.internos ?? 0} · ${fmtMoney(resumen.costo_interno)}`}
          icon={Factory}
          color="text-amber-600"
        />
        <KpiCard
          label="Facturados / Pendientes"
          value={`${resumen.facturados ?? 0} / ${resumen.pendientes ?? 0}`}
          icon={FileCheck}
          color="text-purple-600"
        />
      </div>

      {/* Resumen por unidad interna */}
      {(data?.unidades_internas || []).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Unidades internas en el rango
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">Unidad</th>
                    <th className="text-right">Movimientos</th>
                    <th className="text-right">Costo total</th>
                    <th className="text-right">Con cargo</th>
                    <th className="text-right">Sin cargo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unidades_internas.map(u => (
                    <tr key={u.unidad_interna_id} className="border-b last:border-b-0">
                      <td className="py-2">{u.unidad_interna_nombre || `Unidad #${u.unidad_interna_id}`}</td>
                      <td className="text-right">{u.movimientos}</td>
                      <td className="text-right font-mono">{fmtMoney(u.costo_total)}</td>
                      <td className="text-right text-emerald-600">{u.con_cargo}</td>
                      <td className="text-right text-amber-600">{u.sin_cargo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Barra de acciones selección */}
      {seleccionados.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm space-y-0.5">
              <div>
                <b>{totalesSeleccion.count}</b> movimiento(s) — costo total:{' '}
                <b>{fmtMoney(totalesSeleccion.costo)}</b>
              </div>
              <div className="text-xs text-muted-foreground">
                {totalesSeleccion.personas.length === 1 ? (
                  <>Persona: <b>{totalesSeleccion.personas[0]}</b></>
                ) : (
                  <>Personas: {totalesSeleccion.personas.length} distintas</>
                )}
                {totalesSeleccion.facturados > 0 && (
                  <span className="ml-2 text-amber-600">
                    {totalesSeleccion.facturados} ya facturado(s)
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setSeleccionados(new Set())}>
                Limpiar
              </Button>
              <Button size="sm" variant="outline" onClick={desvincular}>
                <Unlink className="h-4 w-4 mr-1" /> Desvincular
              </Button>
              <Button size="sm" variant="outline" onClick={abrirModalVincular}>
                <Link2 className="h-4 w-4 mr-1" /> Vincular a factura existente
              </Button>
              {/* Botón unificado: el backend decide tipo según la persona */}
              <Button
                size="sm"
                onClick={abrirModalGenerar}
                disabled={
                  totalesSeleccion.mezclado ||
                  totalesSeleccion.facturados > 0 ||
                  totalesSeleccion.personas.length !== 1 ||
                  (totalesSeleccion.soloInternos && totalesSeleccion.sinUnidad > 0)
                }
                title={
                  totalesSeleccion.mezclado
                    ? 'No se puede mezclar personas INTERNO y EXTERNO'
                    : totalesSeleccion.facturados > 0
                      ? 'Hay movimientos ya facturados'
                      : totalesSeleccion.personas.length !== 1
                        ? 'Seleccioná movimientos de una sola persona'
                        : totalesSeleccion.sinUnidad > 0
                          ? 'Persona INTERNO sin unidad asignada'
                          : totalesSeleccion.soloInternos
                            ? 'Crear Nota Interna + cargo en la unidad'
                            : 'Crear factura borrador de proveedor'
                }
              >
                {totalesSeleccion.soloInternos ? (
                  <><Factory className="h-4 w-4 mr-1" /> Generar nota interna</>
                ) : (
                  <><FilePlus className="h-4 w-4 mr-1" /> Generar factura borrador</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banner con última generación (factura o nota interna) */}
      {ultimaFacturaGenerada && (
        <Card className={`border-green-500/40 bg-green-50 dark:bg-green-950/20 ${ultimaFacturaGenerada.es_nota_interna ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              {ultimaFacturaGenerada.es_nota_interna ? (
                <>
                  🏭 Nota Interna <b className="font-mono">{ultimaFacturaGenerada.factura_numero}</b>{' '}
                  creada · <b>{fmtMoney(ultimaFacturaGenerada.total)}</b> ·{' '}
                  <b>{ultimaFacturaGenerada.cargos_internos_creados}</b> cargo(s) interno(s) generados
                  {ultimaFacturaGenerada.saldo_cuenta_ficticia !== null && (
                    <span className="ml-2 text-xs text-amber-700">
                      · Saldo cuenta ficticia: <b>{fmtMoney(ultimaFacturaGenerada.saldo_cuenta_ficticia)}</b>
                    </span>
                  )}
                </>
              ) : (
                <>
                  ✅ Factura borrador <b className="font-mono">{ultimaFacturaGenerada.factura_numero}</b>{' '}
                  creada en Finanzas ·{' '}
                  <b>{fmtMoney(ultimaFacturaGenerada.total)}</b> ·{' '}
                  {ultimaFacturaGenerada.movimientos_vinculados} movimiento(s) vinculados
                  {ultimaFacturaGenerada.proveedor_creado && (
                    <span className="ml-2 text-xs text-amber-700">
                      · Proveedor <b>{ultimaFacturaGenerada.persona_nombre}</b> creado automáticamente
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(
                  ultimaFacturaGenerada.es_nota_interna
                    ? `${FINANZAS_URL}/cargos-internos`
                    : `${FINANZAS_URL}/facturas-proveedor`,
                  '_blank'
                )}
              >
                <ExternalLink className="h-4 w-4 mr-1" />{' '}
                {ultimaFacturaGenerada.es_nota_interna ? 'Ver Cargos Internos' : 'Abrir en Finanzas'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUltimaFacturaGenerada(null)}>
                Cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Facturas con múltiples movimientos */}
      {facturas.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Facturas vinculadas ({facturas.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">Factura</th>
                    <th className="text-right">Movimientos</th>
                    <th className="text-right">Costo</th>
                    <th>Cortes</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2 font-mono">{f.factura_numero}</td>
                      <td className="text-right">{f.movimientos}</td>
                      <td className="text-right font-mono">{fmtMoney(f.costo_total)}</td>
                      <td className="text-xs text-muted-foreground">{f.cortes.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla principal */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="data-table-header border-b">
                  <th className="px-3 py-2 w-10">
                    <Checkbox
                      checked={seleccionados.size > 0 && seleccionados.size === items.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">N° Corte</th>
                  <th className="px-3 py-2 text-left">Fecha Inicio</th>
                  <th className="px-3 py-2 text-left">Fecha Fin</th>
                  <th className="px-3 py-2 text-left">Persona</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Servicio</th>
                  <th className="px-3 py-2 text-left">Modelo</th>
                  <th className="px-3 py-2 text-left">Marca</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Prendas</th>
                  <th className="px-3 py-2 text-right">Tarifa</th>
                  <th className="px-3 py-2 text-right">Costo Ref.</th>
                  <th className="px-3 py-2 text-left">Factura</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={14} className="text-center py-8 text-muted-foreground">Cargando...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={14} className="text-center py-8 text-muted-foreground">Sin resultados con los filtros actuales</td></tr>
                ) : (
                  items.map(it => (
                    <tr
                      key={it.movimiento_id}
                      className={`border-b hover:bg-muted/40 ${seleccionados.has(it.movimiento_id) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={seleccionados.has(it.movimiento_id)}
                          onCheckedChange={() => toggleSeleccion(it.movimiento_id)}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">{it.n_corte || '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{it.fecha_inicio ? formatDate(it.fecha_inicio) : '-'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{it.fecha_fin ? formatDate(it.fecha_fin) : '-'}</td>
                      <td className="px-3 py-2">{it.persona_nombre || '-'}</td>
                      <td className="px-3 py-2">
                        {it.persona_tipo === 'INTERNO' ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge className="bg-amber-500 text-white text-[10px] w-fit">
                              <Factory className="h-3 w-3 mr-0.5" /> Interno
                            </Badge>
                            {it.unidad_interna_nombre && (
                              <span className="text-[10px] text-muted-foreground">{it.unidad_interna_nombre}</span>
                            )}
                            {it.tiene_cargo_interno && (
                              <span className="text-[10px] text-emerald-600">✓ con cargo</span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Externo</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">{it.servicio_nombre || '-'}</td>
                      <td className="px-3 py-2">{it.modelo_nombre || '-'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{it.marca_nombre || '-'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{it.tipo_nombre || '-'}</td>
                      <td className="px-3 py-2 text-right font-mono">{it.prendas ?? 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{Number(it.tarifa_aplicada || 0).toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmtMoney(it.costo_calculado)}</td>
                      <td className="px-3 py-2">
                        {it.facturado ? (
                          <Badge className="bg-green-600 text-white font-mono text-xs">{it.factura_numero}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Pendiente</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Generar documento (factura o nota interna) */}
      <Dialog open={modalGenerarOpen} onOpenChange={setModalGenerarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {totalesSeleccion.soloInternos ? (
                <><Factory className="h-5 w-5" /> Generar Nota Interna</>
              ) : (
                <><FilePlus className="h-5 w-5" /> Generar factura borrador</>
              )}
            </DialogTitle>
            <DialogDescription>
              {totalesSeleccion.soloInternos
                ? 'Se creará una Nota Interna en Finanzas (sin cuentas por pagar) y se registrará como INGRESO en la cuenta ficticia de la unidad.'
                : 'Se creará una factura en Finanzas con todos los datos llenados, y los movimientos quedarán vinculados automáticamente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-muted/50 border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {totalesSeleccion.soloInternos ? 'Persona interna' : 'Proveedor'}
                </span>
                <b>{totalesSeleccion.personas[0] || '-'}</b>
              </div>
              {totalesSeleccion.soloInternos && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unidad interna</span>
                  <b className="text-amber-600">
                    {items.find(i => seleccionados.has(i.movimiento_id))?.unidad_interna_nombre || '-'}
                  </b>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Movimientos</span>
                <b>{totalesSeleccion.count}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <b className="font-mono">{fmtMoney(totalesSeleccion.costo)}</b>
              </div>
              {genAplicarIgv && !totalesSeleccion.soloInternos && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">IGV 18%</span>
                    <span className="font-mono">{fmtMoney(totalesSeleccion.costo * 0.18)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Total</span>
                    <b className="font-mono">{fmtMoney(totalesSeleccion.costo * 1.18)}</b>
                  </div>
                </>
              )}
            </div>

            {!totalesSeleccion.soloInternos && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de documento</Label>
                  <Select value={genTipoDoc} onValueChange={setGenTipoDoc}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factura">Factura</SelectItem>
                      <SelectItem value="boleta">Boleta</SelectItem>
                      <SelectItem value="recibo">Recibo por Honorarios</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={genAplicarIgv} onCheckedChange={setGenAplicarIgv} />
                  <span>Aplicar IGV 18% (el proveedor factura con IGV)</span>
                </label>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input
                value={genNotas}
                onChange={e => setGenNotas(e.target.value)}
                placeholder={totalesSeleccion.soloInternos ? 'Ej. Producción interna abril 2026' : 'Ej. Servicios de abril 2026'}
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {totalesSeleccion.soloInternos ? (
                <>
                  • Número asignado: <code>NI-&lt;timestamp&gt;</code> (Nota Interna)<br />
                  • <b>No</b> genera cuenta por pagar ni sale plata de tu caja.<br />
                  • Se crea automáticamente un <b>Cargo Interno</b> por cada movimiento.<br />
                  • La cuenta ficticia de la unidad sube de saldo (INGRESO virtual).
                </>
              ) : (
                <>
                  • Si la persona no existe como proveedor, se crea automáticamente.<br />
                  • Número asignado: <code>BORR-&lt;timestamp&gt;</code>; editalo en Finanzas cuando tengas la factura real.<br />
                  • Los movimientos quedan vinculados y pasan a <b>Facturado</b>.
                </>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalGenerarOpen(false)} disabled={generando}>
              Cancelar
            </Button>
            <Button onClick={generarFactura} disabled={generando}>
              {generando ? 'Generando...' : (totalesSeleccion.soloInternos ? 'Crear Nota Interna' : 'Generar borrador')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Vincular a factura */}
      <Dialog open={modalVincularOpen} onOpenChange={setModalVincularOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Vincular a factura
            </DialogTitle>
            <DialogDescription>
              Asignás una misma factura a los {totalesSeleccion.count} movimiento(s) seleccionado(s).
              Costo total: <b>{fmtMoney(totalesSeleccion.costo)}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>N° de factura *</Label>
              <Input
                value={facturaNumero}
                onChange={e => setFacturaNumero(e.target.value)}
                placeholder="F001-123"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>
                ID de factura en Finanzas <span className="text-xs text-muted-foreground">(opcional por ahora)</span>
              </Label>
              <Input
                value={facturaId}
                onChange={e => setFacturaId(e.target.value)}
                placeholder="UUID de la factura (opcional)"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Si lo dejás vacío, se guarda un identificador temporal (<code>manual-&lt;número&gt;</code>).
                Cuando conectes Finanzas podrás reemplazarlo por el ID real.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalVincularOpen(false)}>Cancelar</Button>
            <Button onClick={vincular}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
