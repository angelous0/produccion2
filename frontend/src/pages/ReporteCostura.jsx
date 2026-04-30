import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/dateUtils';
import IncidenciaAvances from '../components/registro/IncidenciaAvances';
import {
  ChevronDown, ChevronRight, Users, Package, AlertTriangle, Clock, FileWarning,
  ExternalLink, Plus, Pencil, Filter, X, RefreshCw, History, Eye, Check, Download, Trash2,
  Info, MessageSquare, PauseCircle,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const RIESGO_CONFIG = {
  normal:   { label: 'Normal',   color: 'bg-transparent text-muted-foreground border-transparent', dot: 'bg-emerald-500', rowClass: '' },
  atencion: { label: 'Atención', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500', rowClass: 'bg-amber-50/50' },
  critico:  { label: 'Crítico',  color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', rowClass: 'bg-red-50/50' },
  vencido:  { label: 'Vencido',  color: 'bg-zinc-800 text-white border-zinc-700', dot: 'bg-zinc-800', rowClass: 'bg-red-50/70' },
};

const KpiCard = ({ label, value, icon: Icon, accent }) => (
  <div className={`rounded-lg border p-3 ${accent || 'bg-card'}`}>
    <div className="flex items-center gap-2 mb-1">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
    </div>
    <p className="text-2xl font-bold font-mono leading-none">{value}</p>
  </div>
);

// Inline avance editor
const AvanceEditor = ({ movimientoId, currentValue, onSaved, nCorte }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentValue ?? 0);
  const [saving, setSaving] = useState(false);
  const [displayValue, setDisplayValue] = useState(currentValue);
  const [historial, setHistorial] = useState(null);
  const [showHist, setShowHist] = useState(false);

  const fetchHistorial = async () => {
    try {
      const resp = await axios.get(`${API}/api/reportes-produccion/costura/avance-historial/${movimientoId}`);
      setHistorial(resp.data);
      setShowHist(true);
    } catch { toast.error('Error al cargar historial'); }
  };

  if (!editing) {
    return (
      <>
        <div className="flex items-center gap-0.5 justify-center">
          <button
            onClick={() => { setVal(displayValue ?? 0); setEditing(true); }}
            className="flex items-center gap-1 hover:bg-muted rounded px-1 py-0.5 transition-colors group"
            title="Actualizar avance"
          >
            <span className="font-mono text-sm font-semibold">{displayValue ?? '—'}%</span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={fetchHistorial}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
            title="Ver historial de avances"
          >
            <History className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <Dialog open={showHist} onOpenChange={setShowHist}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Historial de Avance — Corte {nCorte}</DialogTitle>
            </DialogHeader>
            {!historial || historial.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin registros de avance</p>
            ) : (
              <div className="space-y-0 max-h-64 overflow-y-auto">
                {historial.map((h, i) => {
                  const prev = i > 0 ? historial[i - 1].avance_porcentaje : 0;
                  const diff = h.avance_porcentaje - prev;
                  return (
                    <div key={i} className="flex items-center justify-between py-2 px-1 border-b border-border/50 last:border-0 group">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm w-10 text-right">{h.avance_porcentaje}%</span>
                        {diff > 0 && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">+{diff}%</Badge>}
                        {diff < 0 && <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">{diff}%</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs">{h.fecha ? new Date(h.fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}</p>
                          <p className="text-[10px] text-muted-foreground">{h.usuario} · {h.fecha ? new Date(h.fecha).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`¿Eliminar este registro de avance (${h.avance_porcentaje}%)?`)) return;
                            try {
                              const resp = await axios.delete(`${API}/api/reportes-produccion/costura/avance-historial/${h.id}`);
                              toast.success('Registro eliminado');
                              setDisplayValue(resp.data.nuevo_avance);
                              onSaved(movimientoId, resp.data.nuevo_avance);
                              fetchHistorial();
                            } catch { toast.error('Error al eliminar'); }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-red-100 text-red-500"
                          title="Eliminar este registro"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const newVal = parseInt(val) || 0;
      await axios.put(`${API}/api/reportes-produccion/costura/avance/${movimientoId}`, { avance_porcentaje: newVal });
      toast.success(`Avance actualizado: ${val}%`);
      setDisplayValue(newVal);
      onSaved(movimientoId, newVal);
      setEditing(false);
    } catch { toast.error('Error al guardar'); }
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Input type="number" min={0} max={100} value={val} onChange={e => setVal(e.target.value)} className="w-16 h-7 text-sm font-mono text-center p-1" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }} />
      <span className="text-xs">%</span>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={saving}><RefreshCw className={`h-3 w-3 ${saving ? 'animate-spin' : ''}`} /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
    </div>
  );
};

// Inline plazo editor — click en la celda PLAZO para setear los días desde fecha_inicio
const PlazoEditor = ({ movimientoId, fechaInicio, fechaEsperada, onSaved }) => {
  const calcDias = (inicio, esperada) => {
    if (!inicio || !esperada) return '';
    try {
      const fi = new Date(inicio + 'T00:00:00');
      const fe = new Date(esperada + 'T00:00:00');
      const d = Math.round((fe - fi) / 86400000);
      return d > 0 ? String(d) : '';
    } catch { return ''; }
  };
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(calcDias(fechaInicio, fechaEsperada));
  const [saving, setSaving] = useState(false);
  const [displayDias, setDisplayDias] = useState(calcDias(fechaInicio, fechaEsperada));

  // Si cambia el valor desde fuera (refresh), resincronizar
  useEffect(() => {
    const d = calcDias(fechaInicio, fechaEsperada);
    setDisplayDias(d);
    setVal(d);
  }, [fechaInicio, fechaEsperada]);

  const handleSave = async () => {
    if (!fechaInicio) {
      toast.error('El movimiento no tiene fecha de inicio');
      return;
    }
    setSaving(true);
    try {
      const n = val === '' ? null : parseInt(val, 10);
      if (n !== null && (isNaN(n) || n < 0)) {
        toast.error('Ingresa un número válido');
        setSaving(false);
        return;
      }
      const resp = await axios.put(`${API}/api/reportes-produccion/costura/plazo/${movimientoId}`, { dias: n });
      const nuevaFecha = resp.data?.fecha_esperada || null;
      toast.success(n ? `Plazo: ${n}d` : 'Plazo eliminado');
      setDisplayDias(n ? String(n) : '');
      setEditing(false);
      if (onSaved) onSaved(movimientoId, nuevaFecha);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    }
    setSaving(false);
  };

  if (!editing) {
    const disabled = !fechaInicio;
    return (
      <button
        type="button"
        onClick={() => { if (!disabled) { setVal(displayDias); setEditing(true); } }}
        disabled={disabled}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors group ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}
        title={disabled ? 'Falta fecha de inicio' : 'Click para editar plazo (días)'}
      >
        <span className="font-mono text-sm">{displayDias ? `${displayDias}d` : '—'}</span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number" min={0} value={val}
        onChange={e => setVal(e.target.value)}
        className="w-14 h-7 text-sm font-mono text-center p-1"
        autoFocus
        placeholder="0"
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
      />
      <span className="text-xs">d</span>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={saving}>
        {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
    </div>
  );
};

export const ReporteCostura = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedPersonas, setExpandedPersonas] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  // Filtros
  const [filtroPersona, setFiltroPersona] = useState('__all__');
  const [filtroRiesgo, setFiltroRiesgo] = useState('__all__');
  const [filtroConIncidencias, setFiltroConIncidencias] = useState('__all__');
  const [filtroVencidos, setFiltroVencidos] = useState('__all__');
  const [filtroSinActualizar, setFiltroSinActualizar] = useState('__all__');
  const [filtroTerminados, setFiltroTerminados] = useState('en_curso');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('Costura');
  const [servicios, setServicios] = useState([]);

  // Incidencia rápida
  const [incDialog, setIncDialog] = useState(null);
  const [incComentario, setIncComentario] = useState('');
  const [incSaving, setIncSaving] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [incMotivo, setIncMotivo] = useState('');
  const [incParaliza, setIncParaliza] = useState(false);

  // Ordenación, vista y estado de incidencias
  const [sortDiasDesc, setSortDiasDesc] = useState(true);
  const [vistaPlana, setVistaPlana] = useState(false);
  const [expandedInc, setExpandedInc] = useState({});
  const [incidenciasPorRegistro, setIncidenciasPorRegistro] = useState({});
  const [resolverDialog, setResolverDialog] = useState(null);
  const [resolverTexto, setResolverTexto] = useState('');
  const [resolverSaving, setResolverSaving] = useState(false);
  const [avancesDialog, setAvancesDialog] = useState(null); // { id, motivo, comentario, n_corte, paraliza, estado, fecha_hora, usuario }

  const fetchIncidencias = async (registroId) => {
    try {
      const resp = await axios.get(`${API}/api/incidencias/${registroId}`);
      setIncidenciasPorRegistro(prev => ({ ...prev, [registroId]: resp.data }));
    } catch { toast.error('Error al cargar incidencias'); }
  };

  const toggleIncidencias = (registroId) => {
    const isOpen = expandedInc[registroId];
    setExpandedInc(prev => ({ ...prev, [registroId]: !isOpen }));
    if (!isOpen && !incidenciasPorRegistro[registroId]) {
      fetchIncidencias(registroId);
    }
  };

  const handleResolver = async () => {
    if (!resolverDialog) return;
    setResolverSaving(true);
    try {
      await axios.put(`${API}/api/incidencias/${resolverDialog.id}`, {
        estado: 'RESUELTA',
        comentario_resolucion: resolverTexto || null,
      });
      toast.success('Incidencia resuelta');
      setResolverDialog(null);
      setResolverTexto('');
      fetchIncidencias(resolverDialog.registro_id);
      fetchData();
    } catch { toast.error('Error al resolver'); }
    setResolverSaving(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('servicio_nombre', filtroServicio);
      if (filtroPersona !== '__all__') params.append('persona_id', filtroPersona);
      if (filtroRiesgo !== '__all__') params.append('riesgo', filtroRiesgo);
      if (filtroConIncidencias === 'si') params.append('con_incidencias', 'true');
      if (filtroConIncidencias === 'no') params.append('con_incidencias', 'false');
      if (filtroVencidos === 'si') params.append('vencidos', 'true');
      if (filtroSinActualizar === 'si') params.append('sin_actualizar', 'true');
      if (filtroTerminados === 'todos') params.append('incluir_terminados', 'true');
      const resp = await axios.get(`${API}/api/reportes-produccion/costura?${params.toString()}`);
      setData(resp.data);
    } catch (err) {
      toast.error('Error al cargar reporte');
    }
    setLoading(false);
  };

  // Actualizar avance localmente sin recargar toda la página
  const updateAvanceLocal = useCallback((movimientoId, newValue) => {
    setData(prev => {
      if (!prev?.items) return prev;
      const now = new Date().toISOString();
      return {
        ...prev,
        items: prev.items.map(item =>
          item.movimiento_id === movimientoId
            ? { ...item, avance_porcentaje: newValue, avance_updated_at: now, dias_sin_actualizar: 0 }
            : item
        ),
      };
    });
  }, []);

  // Actualizar fecha_esperada localmente al editar el plazo
  const updatePlazoLocal = useCallback((movimientoId, nuevaFechaEsperada) => {
    setData(prev => {
      if (!prev?.items) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.movimiento_id === movimientoId
            ? { ...item, fecha_esperada: nuevaFechaEsperada }
            : item
        ),
      };
    });
  }, []);

  useEffect(() => { fetchData(); }, [filtroServicio, filtroPersona, filtroRiesgo, filtroConIncidencias, filtroVencidos, filtroSinActualizar, filtroTerminados]);

  useEffect(() => {
    axios.get(`${API}/api/motivos-incidencia`).then(r => setMotivos(r.data)).catch(() => {});
    axios.get(`${API}/api/servicios-produccion`).then(r => setServicios(r.data || [])).catch(() => {});
  }, []);

  // Generar texto de observación de riesgo
  const buildObsText = (item) => {
    if (!item || item.nivel_riesgo === 'normal') return '';
    const m = [];
    if (item.nivel_riesgo === 'vencido') m.push('Fecha vencida');
    if (item.dias_sin_actualizar != null && item.dias_sin_actualizar >= 3) m.push(`${item.dias_sin_actualizar}d sin actualizar`);
    if (item.fecha_esperada) {
      const de = Math.round((new Date(item.fecha_esperada) - new Date()) / 86400000);
      if (de <= 2 && item.avance_porcentaje < 70) m.push(`Entrega en ${de}d`);
      else if (de <= 5 && item.avance_porcentaje < 50) m.push(`Entrega en ${de}d`);
    }
    if (item.incidencias_abiertas >= 1) m.push(`${item.incidencias_abiertas} inc.`);
    if (item.urgente) m.push('Urgente');
    return m.join('; ') || '';
  };

  // Generar lista de mini-badges para la columna OBS — compacto pero informativo
  const buildObsBadges = (item) => {
    if (!item || item.nivel_riesgo === 'normal') return [];
    const badges = [];
    if (item.nivel_riesgo === 'vencido') {
      badges.push({ text: 'vencida', cls: 'bg-zinc-800 text-white' });
    }
    if (item.dias_sin_actualizar != null && item.dias_sin_actualizar >= 3) {
      badges.push({
        text: `${item.dias_sin_actualizar}d s/act`,
        cls: item.dias_sin_actualizar >= 5 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
      });
    }
    if (item.fecha_esperada) {
      const de = Math.round((new Date(item.fecha_esperada) - new Date()) / 86400000);
      const trigger = (de <= 2 && item.avance_porcentaje < 70) || (de <= 5 && item.avance_porcentaje < 50);
      if (trigger) {
        badges.push({
          text: de < 0 ? `${de}d` : `${de}d entr.`,
          cls: de < 0 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-orange-100 text-orange-700 border border-orange-200'
        });
      }
    }
    if (item.incidencias_abiertas >= 1) {
      badges.push({ text: `${item.incidencias_abiertas} inc`, cls: 'bg-purple-100 text-purple-700 border border-purple-200' });
    }
    if (item.urgente) {
      badges.push({ text: 'urg', cls: 'bg-red-600 text-white' });
    }
    return badges;
  };

  // Agrupar items por persona
  const grouped = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase();
      items = items.filter(i =>
        (i.n_corte || '').toLowerCase().includes(q) ||
        (i.modelo_nombre || '').toLowerCase().includes(q) ||
        (i.tipo_nombre || '').toLowerCase().includes(q) ||
        (i.entalle_nombre || '').toLowerCase().includes(q) ||
        (i.tela_nombre || '').toLowerCase().includes(q) ||
        (i.hilo_especifico || '').toLowerCase().includes(q) ||
        (i.persona_nombre || '').toLowerCase().includes(q)
      );
    }
    const map = {};
    for (const item of items) {
      if (!map[item.persona_id]) {
        map[item.persona_id] = {
          persona_id: item.persona_id,
          persona_nombre: item.persona_nombre,
          persona_tipo: item.persona_tipo,
          items: [],
          total_prendas: 0,
          total_criticos: 0,
          total_vencidos: 0,
          total_incidencias: 0,
          avance_sum: 0,
          avance_count: 0,
        };
      }
      const g = map[item.persona_id];
      g.items.push(item);
      g.total_prendas += item.cantidad_enviada || 0;
      if (item.nivel_riesgo === 'critico') g.total_criticos++;
      if (item.nivel_riesgo === 'vencido') g.total_vencidos++;
      g.total_incidencias += item.incidencias_abiertas;
      if (item.avance_porcentaje != null) { g.avance_sum += item.avance_porcentaje; g.avance_count++; }
    }
    const groups = Object.values(map).sort((a, b) => (b.total_criticos + b.total_vencidos) - (a.total_criticos + a.total_vencidos) || a.persona_nombre.localeCompare(b.persona_nombre));
    // Ordenar items dentro de cada grupo por días
    for (const g of groups) {
      g.items.sort((a, b) => {
        const da = a.dias_transcurridos ?? -1;
        const db = b.dias_transcurridos ?? -1;
        return sortDiasDesc ? db - da : da - db;
      });
    }
    return groups;
  }, [data, filtroBusqueda, sortDiasDesc]);

  // Vista plana: todos los items en una sola lista, ordenados por días globalmente
  const flatItems = useMemo(() => {
    if (!grouped.length) return [];
    const all = [];
    for (const g of grouped) {
      for (const item of g.items) {
        all.push({ ...item, _persona_nombre: g.persona_nombre, _persona_tipo: g.persona_tipo });
      }
    }
    all.sort((a, b) => {
      const da = a.dias_transcurridos ?? -1;
      const db = b.dias_transcurridos ?? -1;
      return sortDiasDesc ? db - da : da - db;
    });
    return all;
  }, [grouped, sortDiasDesc]);

  const togglePersona = (pid) => {
    setExpandedPersonas(prev => ({ ...prev, [pid]: !prev[pid] }));
  };

  const handleIncidenciaRapida = async () => {
    if (!incDialog || !incMotivo) return;
    setIncSaving(true);
    try {
      await axios.post(`${API}/api/incidencias`, {
        registro_id: incDialog.registro_id,
        motivo_id: incMotivo,
        comentario: incComentario,
        paraliza: incParaliza,
        usuario: user?.nombre_completo || user?.username || 'Usuario',
      });
      toast.success(incParaliza ? 'Incidencia creada — Producción paralizada' : 'Incidencia creada');
      setIncDialog(null);
      setIncComentario('');
      setIncMotivo('');
      setIncParaliza(false);
      fetchData();
      // Refresh incidencias if expanded
      if (expandedInc[incDialog.registro_id]) {
        fetchIncidencias(incDialog.registro_id);
      }
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === 'string' ? err.response?.data?.detail : 'Error al crear incidencia');
    }
    setIncSaving(false);
  };

  const kpis = data?.kpis || {};
  const personas = data?.filtros?.personas || [];

  const hasActiveFilters = filtroPersona !== '__all__' || filtroRiesgo !== '__all__' || filtroConIncidencias !== '__all__' || filtroVencidos !== '__all__' || filtroSinActualizar !== '__all__' || filtroTerminados !== 'en_curso' || filtroServicio !== 'Costura' || filtroBusqueda.trim();

  const getExportRows = () => {
    const rows = [];
    for (const grupo of grouped) {
      for (const item of grupo.items) {
        rows.push({
          persona: grupo.persona_nombre,
          tipo_persona: grupo.persona_tipo,
          corte: item.n_corte,
          urgente: item.urgente,
          modelo: item.modelo_nombre || '',
          tipo_prenda: item.tipo_nombre || '',
          entalle: item.entalle_nombre || '',
          tela: item.tela_nombre || '',
          hilo_especifico: item.hilo_especifico || '',
          cantidad: item.cantidad_enviada || 0,
          inicio: item.fecha_inicio,
          esperada: item.fecha_esperada,
          dias: item.dias_transcurridos,
          avance: item.avance_porcentaje ?? 0,
          dias_sin_act: item.dias_sin_actualizar,
          incidencias: item.incidencias_abiertas || 0,
          riesgo: item.nivel_riesgo || 'normal',
          riesgo_label: (RIESGO_CONFIG[item.nivel_riesgo] || RIESGO_CONFIG.normal).label,
        });
      }
    }
    return rows;
  };

  const handleExportExcel = async () => {
    if (!grouped.length) return;
    const XLSX = (await import('xlsx')).default || await import('xlsx');
    const rows = getExportRows();
    const wsData = [
      ['Persona', 'Tipo', 'Corte', 'Modelo', 'Tipo Prenda', 'Entalle', 'Tela', 'Hilo Esp.', 'Cant.', 'Inicio', 'Plazo', 'Días', 'Avance %', 'D/s Act.', 'Inc.', 'Riesgo'],
      ...rows.map(r => {
        const plazo = r.esperada && r.inicio ? Math.round((new Date(r.esperada + 'T00:00:00') - new Date(r.inicio + 'T00:00:00')) / 86400000) : '';
        return [
          r.persona, r.tipo_persona, r.corte + (r.urgente ? ' (URG)' : ''), r.modelo, r.tipo_prenda, r.entalle, r.tela, r.hilo_especifico,
          r.cantidad, formatDate(r.inicio), plazo > 0 ? `${plazo}d` : '', r.dias ?? '', r.avance, r.dias_sin_act ?? '', r.incidencias, r.riesgo_label,
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      {wch:20},{wch:9},{wch:10},{wch:18},{wch:15},{wch:12},{wch:10},{wch:14},{wch:7},{wch:12},{wch:7},{wch:6},{wch:9},{wch:8},{wch:5},{wch:10},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Costura');
    XLSX.writeFile(wb, `reporte_costura_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Excel exportado');
  };

  const handleExportPDF = async () => {
    if (!grouped.length) return;
    const jsPDFMod = await import('jspdf');
    const jsPDF = jsPDFMod.default || jsPDFMod.jsPDF;
    const autoTableMod = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod.applyPlugin;
    const rows = getExportRows();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Reporte Operativo — ${filtroServicio === '__todos__' ? 'Todos los Servicios' : filtroServicio}`, 14, 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}  |  Registros: ${rows.length}  |  Prendas: ${rows.reduce((s,r)=>s+r.cantidad,0).toLocaleString()}`, 14, 20);
    doc.setTextColor(0);

    // KPI bar
    const kpiY = 24;
    const kpiItems = [
      { label: 'Personas', val: kpis.costureros_activos || 0 },
      { label: 'Registros', val: kpis.registros_activos || 0 },
      { label: 'Prendas', val: kpis.total_prendas?.toLocaleString() || 0 },
      { label: 'Vencidos', val: kpis.registros_vencidos || 0, danger: true },
      { label: 'Críticos', val: kpis.registros_criticos || 0, danger: true },
      { label: 'Incidencias', val: kpis.incidencias_abiertas || 0, danger: true },
    ];
    const kpiW = (pageW - 28) / kpiItems.length;
    kpiItems.forEach((k, i) => {
      const x = 14 + i * kpiW;
      doc.setFillColor(k.danger && k.val > 0 ? 254 : 245, k.danger && k.val > 0 ? 242 : 245, k.danger && k.val > 0 ? 242 : 245);
      doc.roundedRect(x, kpiY, kpiW - 2, 10, 1.5, 1.5, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(k.label.toUpperCase(), x + 2, kpiY + 3.5);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(k.danger && k.val > 0 ? 180 : 30, k.danger && k.val > 0 ? 30 : 30, k.danger && k.val > 0 ? 30 : 30);
      doc.text(String(k.val), x + 2, kpiY + 8.5);
    });
    doc.setTextColor(0);

    // Color maps — normal sin color
    const riesgoColors = { atencion: [254,243,199], critico: [254,226,226], vencido: [63,63,70] };
    const riesgoTextColors = { atencion: [146,64,14], critico: [153,27,27], vencido: [255,255,255] };

    // Build observation text explaining risk
    const buildObs = (r) => {
      if (r.riesgo === 'normal') return '';
      const motivos = [];
      if (r.riesgo === 'vencido') {
        motivos.push('Fecha vencida');
      }
      if (r.dias_sin_act != null && r.dias_sin_act >= 5) motivos.push(`${r.dias_sin_act}d sin actualizar`);
      else if (r.dias_sin_act != null && r.dias_sin_act >= 3) motivos.push(`${r.dias_sin_act}d sin actualizar`);
      if (r.esperada) {
        const diasEntrega = Math.round((new Date(r.esperada) - new Date()) / 86400000);
        if (diasEntrega <= 2 && r.avance < 70) motivos.push(`Entrega en ${diasEntrega}d, avance ${r.avance}%`);
        else if (diasEntrega <= 5 && r.avance < 50) motivos.push(`Entrega en ${diasEntrega}d, avance ${r.avance}%`);
      }
      if (r.incidencias >= 2) motivos.push(`${r.incidencias} incidencias`);
      else if (r.incidencias >= 1) motivos.push(`${r.incidencias} incidencia`);
      if (r.urgente) motivos.push('Urgente');
      return motivos.join('; ') || r.riesgo_label;
    };

    const headers = [['Persona','Corte','Modelo','Tipo','Entalle','Tela','Hilo Esp.','Cant.','Inicio','Plazo','Días','Avance','D/s','Inc.','Riesgo','Obs.']];
    const body = rows.map(r => {
      const plazo = r.esperada && r.inicio ? Math.round((new Date(r.esperada + 'T00:00:00') - new Date(r.inicio + 'T00:00:00')) / 86400000) : null;
      return [
        r.persona,
        r.corte,
        r.modelo,
        r.tipo_prenda,
        r.entalle,
        r.tela,
        r.hilo_especifico,
        r.cantidad.toLocaleString(),
        formatDate(r.inicio),
        plazo > 0 ? `${plazo}d` : '-',
        r.dias != null ? String(r.dias) : '-',
        r.avance + '%',
        r.dias_sin_act != null ? String(r.dias_sin_act) : '-',
        String(r.incidencias),
        r.riesgo_label,
        buildObs(r),
      ];
    });

    // A4 landscape = 297mm wide, margins 14+14 = 269mm usable
    autoTable(doc, {
      startY: 36,
      head: headers,
      body: body,
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 1.2, lineColor: [220,220,220], lineWidth: 0.2, overflow: 'ellipsize' },
      headStyles: { fillColor: [30,41,59], textColor: 255, fontSize: 5.5, fontStyle: 'bold', halign: 'center', cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 24 },                                    // Persona
        1: { cellWidth: 10, halign: 'center', fontStyle: 'bold' }, // Corte
        2: { cellWidth: 28 },                                    // Modelo
        3: { cellWidth: 16 },                                    // Tipo
        4: { cellWidth: 16 },                                    // Entalle
        5: { cellWidth: 14 },                                    // Tela
        6: { cellWidth: 16 },                                    // Hilo Esp.
        7: { cellWidth: 10, halign: 'right' },                    // Cant.
        8: { cellWidth: 15, halign: 'center' },                   // Inicio
        9: { cellWidth: 10, halign: 'center' },                   // Plazo
        10: { cellWidth: 9, halign: 'center', fontStyle: 'bold' }, // Días
        11: { cellWidth: 11, halign: 'center' },                   // Avance
        12: { cellWidth: 8, halign: 'center' },                    // D/s
        13: { cellWidth: 7, halign: 'center' },                    // Inc.
        14: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },// Riesgo
        15: { cellWidth: 'auto', fontSize: 5.5 },                 // Obs. (uses remaining space)
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const row = rows[data.row.index];
        if (!row) return;

        // Urgente: Corte cell red background
        if (data.column.index === 1 && row.urgente) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [153, 27, 27];
        }

        // Riesgo cell colored — solo si NO es normal
        if (data.column.index === 14 && row.riesgo !== 'normal') {
          const bg = riesgoColors[row.riesgo];
          const tc = riesgoTextColors[row.riesgo];
          if (bg) {
            data.cell.styles.fillColor = bg;
            data.cell.styles.textColor = tc;
            data.cell.styles.fontStyle = 'bold';
          }
        }

        // Días: progressive color by % of plazo consumed
        if (data.column.index === 10 && row.dias != null) {
          const plazo = row.esperada && row.inicio ? Math.round((new Date(row.esperada + 'T00:00:00') - new Date(row.inicio + 'T00:00:00')) / 86400000) : 0;
          if (plazo > 0) {
            const pct = row.dias / plazo;
            if (pct >= 1) { data.cell.styles.fillColor = [254,242,242]; data.cell.styles.textColor = [220,38,38]; }
            else if (pct >= 0.86) { data.cell.styles.fillColor = [255,247,237]; data.cell.styles.textColor = [234,88,12]; }
            else if (pct >= 0.61) { data.cell.styles.fillColor = [254,249,195]; data.cell.styles.textColor = [202,138,4]; }
            else { data.cell.styles.fillColor = [239,246,255]; data.cell.styles.textColor = [59,130,246]; }
          } else if (row.dias >= 15) {
            data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [153, 27, 27];
          }
        }

        // Dias sin actualizar: highlight >= 3
        if (data.column.index === 12 && row.dias_sin_act != null) {
          if (row.dias_sin_act >= 3) {
            data.cell.styles.fillColor = [254, 242, 242];
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (row.dias_sin_act >= 1) {
            data.cell.styles.textColor = [234, 88, 12];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [22, 163, 74];
          }
        }

        // Incidencias: red if > 0
        if (data.column.index === 13 && row.incidencias > 0) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [153, 27, 27];
          data.cell.styles.fontStyle = 'bold';
        }

        // Avance: color by %
        if (data.column.index === 11) {
          if (row.avance >= 80) data.cell.styles.textColor = [22, 101, 52];
          else if (row.avance <= 30) { data.cell.styles.textColor = [153, 27, 27]; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
      doc.text('Producción Textil — Reporte Costura', 14, doc.internal.pageSize.getHeight() - 5);
    }

    doc.save(`reporte_costura_${new Date().toISOString().slice(0,10)}.pdf`);
    toast.success('PDF exportado');
  };

  const clearFilters = () => {
    setFiltroPersona('__all__');
    setFiltroRiesgo('__all__');
    setFiltroConIncidencias('__all__');
    setFiltroVencidos('__all__');
    setFiltroSinActualizar('__all__');
    setFiltroTerminados('en_curso');
    setFiltroBusqueda('');
  };

  return (
    <div className="space-y-4 pb-8 min-w-0" data-testid="reporte-costura">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Reporte Operativo</h2>
          <p className="text-sm text-muted-foreground">Seguimiento diario por costurero</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filtroServicio} onValueChange={setFiltroServicio}>
            <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="select-servicio">
              <SelectValue placeholder="Servicio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos los servicios</SelectItem>
              {servicios.map(s => (
                <SelectItem key={s.id} value={s.nombre}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border text-sm overflow-hidden" data-testid="toggle-estado-rapido">
            <button type="button" onClick={() => setFiltroTerminados('en_curso')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${filtroTerminados === 'en_curso' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>En curso</button>
            <button type="button" onClick={() => setFiltroTerminados('todos')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${filtroTerminados === 'todos' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Todos</button>
          </div>
          <div className="flex items-center rounded-lg border text-sm overflow-hidden" data-testid="toggle-vista">
            <button type="button" onClick={() => setVistaPlana(false)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${!vistaPlana ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Agrupado</button>
            <button type="button" onClick={() => setVistaPlana(true)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${vistaPlana ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Tabla</button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} data-testid="toggle-filtros">
            <Filter className="h-3.5 w-3.5 mr-1" />
            Filtros
            {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">ON</Badge>}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="btn-refresh">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!grouped.length} data-testid="btn-exportar-excel">
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!grouped.length} data-testid="btn-exportar-pdf">
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="kpis-costura">
        <KpiCard label="Personas" value={kpis.costureros_activos || 0} icon={Users} />
        <KpiCard label="Registros" value={kpis.registros_activos || 0} icon={Package} />
        <KpiCard label="Prendas" value={(kpis.total_prendas || 0).toLocaleString()} icon={Package} />
        <KpiCard label="Vencidos" value={kpis.registros_vencidos || 0} icon={Clock} accent={kpis.registros_vencidos > 0 ? 'bg-zinc-100 border-zinc-300' : ''} />
        <KpiCard label="Críticos" value={kpis.registros_criticos || 0} icon={AlertTriangle} accent={kpis.registros_criticos > 0 ? 'bg-red-50 border-red-200' : ''} />
        <KpiCard label="Sin actualizar" value={kpis.registros_sin_actualizar || 0} icon={FileWarning} accent={kpis.registros_sin_actualizar > 0 ? 'bg-amber-50 border-amber-200' : ''} />
        <KpiCard label="Incidencias" value={kpis.incidencias_abiertas || 0} icon={AlertTriangle} accent={kpis.incidencias_abiertas > 0 ? 'bg-orange-50 border-orange-200' : ''} />
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</span>
              {hasActiveFilters && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>Limpiar filtros</Button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Estado</label>
                <Select value={filtroTerminados} onValueChange={setFiltroTerminados}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filtro-terminados"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_curso">En curso</SelectItem>
                    <SelectItem value="todos">Todos (+ historial)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Buscar</label>
                <Input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} placeholder="Corte, modelo..." className="h-8 text-sm" data-testid="filtro-busqueda" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Persona</label>
                <Select value={filtroPersona} onValueChange={setFiltroPersona}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filtro-persona"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {personas.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Riesgo</label>
                <Select value={filtroRiesgo} onValueChange={setFiltroRiesgo}>
                  <SelectTrigger className="h-8 text-sm" data-testid="filtro-riesgo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="atencion">Atención</SelectItem>
                    <SelectItem value="critico">Crítico</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Incidencias</label>
                <Select value={filtroConIncidencias} onValueChange={setFiltroConIncidencias}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    <SelectItem value="si">Con incidencias</SelectItem>
                    <SelectItem value="no">Sin incidencias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Vencidos</label>
                <Select value={filtroVencidos} onValueChange={setFiltroVencidos}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="si">Solo vencidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Sin actualizar</label>
                <Select value={filtroSinActualizar} onValueChange={setFiltroSinActualizar}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="si">3+ días sin actualizar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenido principal */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando reporte...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay movimientos de costura registrados</div>
      ) : vistaPlana ? (
        /* ===== VISTA TABLA PLANA ===== */
        <Card data-testid="tabla-costura-plana">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Persona</th>
                  {filtroServicio === '__todos__' && <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Servicio</th>}
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Corte</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Modelo</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Tipo</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Entalle</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Tela</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Hilo Esp.</th>
                  <th className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">Cant.</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Inicio</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Plazo</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground group" onClick={() => setSortDiasDesc(p => !p)}>
                    Días {sortDiasDesc ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3 rotate-[-90deg]" />}
                  </th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Avance</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">D/s Act.</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Inc.</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Riesgo</th>
                  <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap" title="Observaciones (hover para ver detalle completo)">Obs.</th>
                  <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {flatItems.map((item) => {
                  const cfg = RIESGO_CONFIG[item.nivel_riesgo] || RIESGO_CONFIG.normal;
                  const diasSinAct = item.dias_sin_actualizar;
                  return (
                    <Fragment key={item.movimiento_id}>
                    <tr className={`border-t hover:bg-muted/30 transition-colors ${cfg.rowClass}`} data-testid={`flat-row-${item.movimiento_id}`}>
                      <td className="p-2 whitespace-nowrap font-medium">
                        {item._persona_nombre}
                        <Badge variant="outline" className="ml-1 text-[9px] py-0">{item._persona_tipo}</Badge>
                      </td>
                      {filtroServicio === '__todos__' && <td className="p-2 whitespace-nowrap text-xs">{item.servicio_nombre}</td>}
                      <td className="p-2 font-mono font-semibold whitespace-nowrap">
                        {item.n_corte}
                        {item.urgente && <span className="ml-1 text-[9px] text-red-600 font-bold">URG</span>}
                      </td>
                      <td className="p-2 whitespace-nowrap max-w-[120px] truncate" title={item.modelo_nombre}>{item.modelo_nombre || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{item.tipo_nombre || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{item.entalle_nombre || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{item.tela_nombre || '-'}</td>
                      <td className="p-2 whitespace-nowrap text-muted-foreground">{item.hilo_especifico || '-'}</td>
                      <td className="p-2 text-right font-mono">{item.cantidad_enviada?.toLocaleString() || '-'}</td>
                      <td className="p-2 text-center whitespace-nowrap">{item.fecha_inicio ? new Date(item.fecha_inicio + 'T00:00:00').toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' }) : '-'}</td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <PlazoEditor
                          movimientoId={item.movimiento_id}
                          fechaInicio={item.fecha_inicio}
                          fechaEsperada={item.fecha_esperada}
                          onSaved={updatePlazoLocal}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-bold whitespace-nowrap" style={(() => {
                        const dias = item.dias_transcurridos ?? 0;
                        if (!item.fecha_esperada || !item.fecha_inicio) return {};
                        const plazo = Math.round((new Date(item.fecha_esperada + 'T00:00:00') - new Date(item.fecha_inicio + 'T00:00:00')) / 86400000);
                        if (plazo <= 0) return { background: '#FEF2F2', color: '#DC2626' };
                        const pct = dias / plazo;
                        if (pct >= 1) return { background: '#FEF2F2', color: '#DC2626' };
                        if (pct >= 0.86) return { background: '#FFF7ED', color: '#EA580C' };
                        if (pct >= 0.61) return { background: '#FEF9C3', color: '#CA8A04' };
                        return { background: '#EFF6FF', color: '#3B82F6' };
                      })()}>
                        {item.dias_transcurridos ?? '-'}
                      </td>
                      <td className="p-2 text-center">
                        <AvanceEditor movimientoId={item.movimiento_id} currentValue={item.avance_porcentaje} onSaved={updateAvanceLocal} nCorte={item.n_corte} />
                      </td>
                      <td className="p-2 text-center font-mono whitespace-nowrap" style={(() => {
                        if (diasSinAct == null) return {};
                        if (diasSinAct >= 3) return { background: '#FEF2F2', color: '#DC2626', fontWeight: 700 };
                        if (diasSinAct >= 1) return { color: '#EA580C', fontWeight: 600 };
                        return { color: '#16a34a' };
                      })()}>
                        {diasSinAct ?? '-'}
                      </td>
                      <td className="p-2 text-center">
                        {item.incidencias_abiertas > 0 ? (
                          <button onClick={() => toggleIncidencias(item.registro_id)} className="inline-flex items-center gap-0.5 hover:bg-muted rounded px-1 py-0.5 transition-colors" title="Ver incidencias">
                            <Badge variant="destructive" className="text-[10px] px-1.5">{item.incidencias_abiertas}</Badge>
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-2 text-center">
                        {item.nivel_riesgo === 'normal' ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <Badge className={`${cfg.color} text-[10px] border`}>{cfg.label}</Badge>
                        )}
                      </td>
                      <td className="p-2 align-middle max-w-[140px]" title={buildObsText(item)}>
                        {item.nivel_riesgo !== 'normal' ? (
                          <div className="flex flex-wrap gap-0.5 leading-tight">
                            {buildObsBadges(item).map((b, idx) => (
                              <span key={idx} className={`inline-flex items-center px-1 py-0 text-[9px] font-medium rounded ${b.cls}`}>{b.text}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/registros/editar/${item.registro_id}`)} title="Abrir registro">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIncDialog(item)} title="Agregar incidencia">
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedInc[item.registro_id] && (
                      <tr className="bg-amber-50/30">
                        <td colSpan={filtroServicio === '__todos__' ? 18 : 17} className="p-0">
                          <div className="px-4 py-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Incidencias — Corte {item.n_corte}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setExpandedInc(prev => ({ ...prev, [item.registro_id]: false }))}>
                                <X className="h-3 w-3 mr-0.5" /> Cerrar
                              </Button>
                            </div>
                            {!incidenciasPorRegistro[item.registro_id] ? (
                              <p className="text-xs text-muted-foreground">Cargando...</p>
                            ) : incidenciasPorRegistro[item.registro_id].filter(i => i.estado === 'ABIERTA').length === 0 ? (
                              <p className="text-xs text-muted-foreground">Sin incidencias abiertas</p>
                            ) : (
                              incidenciasPorRegistro[item.registro_id].filter(i => i.estado === 'ABIERTA').map(inc => (
                                <div key={inc.id} className="flex items-center gap-3 p-2 rounded border bg-white text-xs">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge variant="destructive" className="text-[10px]">ABIERTA</Badge>
                                      <span className="font-medium">{inc.motivo_nombre || inc.tipo}</span>
                                      {inc.paraliza && <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">Paraliza</Badge>}
                                    </div>
                                    {inc.comentario && <p className="text-muted-foreground mt-0.5">{inc.comentario}</p>}
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {inc.usuario && <span className="font-medium">{inc.usuario} · </span>}
                                      {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                                    </p>
                                  </div>
                                  <Button
                                    type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0"
                                    onClick={() => setAvancesDialog({ ...inc, n_corte: item.n_corte })}
                                    title="Ver historial de avances"
                                  >
                                    <MessageSquare className="h-3 w-3 mr-1" /> Avances
                                  </Button>
                                  <Button
                                    type="button" variant="outline" size="sm" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 shrink-0"
                                    onClick={() => setResolverDialog({ id: inc.id, registro_id: item.registro_id, motivo: inc.motivo_nombre || inc.tipo, comentario: inc.comentario })}
                                  >
                                    <Check className="h-3 w-3 mr-1" /> Resolver
                                  </Button>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* ===== VISTA AGRUPADA (acordeón) ===== */
        <div className="space-y-2" data-testid="tabla-costura">
          {grouped.map((grupo) => {
            const isExpanded = expandedPersonas[grupo.persona_id] !== false; // default expanded
            const avgAvance = grupo.avance_count > 0 ? Math.round(grupo.avance_sum / grupo.avance_count) : null;
            return (
              <div key={grupo.persona_id} className="rounded-lg border bg-card overflow-hidden">
                {/* Fila persona */}
                <button
                  type="button"
                  onClick={() => togglePersona(grupo.persona_id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                  data-testid={`persona-row-${grupo.persona_id}`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-sm">{grupo.persona_nombre}</span>
                    <Badge variant="outline" className="text-[10px]">{grupo.persona_tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{grupo.items.length} registro{grupo.items.length !== 1 ? 's' : ''}</span>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-xs font-mono">{grupo.total_prendas.toLocaleString()} prendas</span>
                    {avgAvance !== null && <span className="text-xs font-mono text-muted-foreground">~{avgAvance}%</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {grupo.total_vencidos > 0 && <Badge className={RIESGO_CONFIG.vencido.color + ' text-[10px]'}>{grupo.total_vencidos} venc.</Badge>}
                    {grupo.total_criticos > 0 && <Badge className={RIESGO_CONFIG.critico.color + ' text-[10px]'}>{grupo.total_criticos} crít.</Badge>}
                    {grupo.total_incidencias > 0 && <Badge variant="destructive" className="text-[10px]">{grupo.total_incidencias} inc.</Badge>}
                  </div>
                </button>

                {/* Tabla de registros expandida */}
                {isExpanded && (
                  <div className="border-t overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Corte</th>
                          {filtroServicio === '__todos__' && <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Servicio</th>}
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Modelo</th>
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Tipo</th>
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Entalle</th>
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Tela</th>
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">Hilo Esp.</th>
                          <th className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">Cant.</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Inicio</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Plazo</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground group" onClick={() => setSortDiasDesc(p => !p)}>
                            Días {sortDiasDesc ? <ChevronDown className="inline h-3 w-3 text-muted-foreground group-hover:text-foreground" /> : <ChevronRight className="inline h-3 w-3 rotate-[-90deg] text-muted-foreground group-hover:text-foreground" />}
                          </th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Avance</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">D/s Act.</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Inc.</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Riesgo</th>
                          <th className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap" title="Observaciones (hover para ver detalle completo)">Obs.</th>
                          <th className="text-center p-2 font-medium text-muted-foreground whitespace-nowrap">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.items.map((item) => {
                          const cfg = RIESGO_CONFIG[item.nivel_riesgo] || RIESGO_CONFIG.normal;
                          const diasSinAct = item.dias_sin_actualizar;
                          return (
                            <Fragment key={item.movimiento_id}>
                            <tr className={`border-t hover:bg-muted/30 transition-colors ${cfg.rowClass}`} data-testid={`row-${item.movimiento_id}`}>
                              <td className="p-2 font-mono font-semibold whitespace-nowrap">
                                {item.n_corte}
                                {item.urgente && <span className="ml-1 text-[9px] text-red-600 font-bold">URG</span>}
                              </td>
                              {filtroServicio === '__todos__' && <td className="p-2 whitespace-nowrap text-xs">{item.servicio_nombre}</td>}
                              <td className="p-2 whitespace-nowrap max-w-[120px] truncate" title={item.modelo_nombre}>{item.modelo_nombre || '-'}</td>
                              <td className="p-2 whitespace-nowrap">{item.tipo_nombre || '-'}</td>
                              <td className="p-2 whitespace-nowrap">{item.entalle_nombre || '-'}</td>
                              <td className="p-2 whitespace-nowrap">{item.tela_nombre || '-'}</td>
                              <td className="p-2 whitespace-nowrap text-muted-foreground">{item.hilo_especifico || '-'}</td>
                              <td className="p-2 text-right font-mono">{item.cantidad_enviada?.toLocaleString() || '-'}</td>
                              <td className="p-2 text-center whitespace-nowrap">{item.fecha_inicio ? new Date(item.fecha_inicio + 'T00:00:00').toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' }) : '-'}</td>
                              <td className="p-2 text-center whitespace-nowrap">
                                <PlazoEditor
                                  movimientoId={item.movimiento_id}
                                  fechaInicio={item.fecha_inicio}
                                  fechaEsperada={item.fecha_esperada}
                                  onSaved={updatePlazoLocal}
                                />
                              </td>
                              <td className="p-2 text-center font-mono font-bold whitespace-nowrap" style={(() => {
                                const dias = item.dias_transcurridos ?? 0;
                                const fe = item.fecha_esperada || item.fecha_fin;
                                if (!fe || !item.fecha_inicio) return {};
                                const plazo = Math.round((new Date(fe + 'T00:00:00') - new Date(item.fecha_inicio + 'T00:00:00')) / 86400000);
                                if (plazo <= 0) return { background: '#FEF2F2', color: '#DC2626' };
                                const pct = dias / plazo;
                                if (pct >= 1) return { background: '#FEF2F2', color: '#DC2626' };
                                if (pct >= 0.86) return { background: '#FFF7ED', color: '#EA580C' };
                                if (pct >= 0.61) return { background: '#FEF9C3', color: '#CA8A04' };
                                return { background: '#EFF6FF', color: '#3B82F6' };
                              })()}>
                                {item.dias_transcurridos ?? '-'}
                              </td>
                              <td className="p-2 text-center">
                                <AvanceEditor movimientoId={item.movimiento_id} currentValue={item.avance_porcentaje} onSaved={updateAvanceLocal} nCorte={item.n_corte} />
                              </td>
                              <td className="p-2 text-center font-mono whitespace-nowrap" style={(() => {
                                if (diasSinAct == null) return {};
                                if (diasSinAct >= 3) return { background: '#FEF2F2', color: '#DC2626', fontWeight: 700 };
                                if (diasSinAct >= 1) return { color: '#EA580C', fontWeight: 600 };
                                return { color: '#16a34a' };
                              })()}>
                                {diasSinAct ?? '-'}
                              </td>
                              <td className="p-2 text-center">
                                {item.incidencias_abiertas > 0 ? (
                                  <button onClick={() => toggleIncidencias(item.registro_id)} className="inline-flex items-center gap-0.5 hover:bg-muted rounded px-1 py-0.5 transition-colors" title="Ver incidencias">
                                    <Badge variant="destructive" className="text-[10px] px-1.5">{item.incidencias_abiertas}</Badge>
                                    <Eye className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                ) : <span className="text-muted-foreground">0</span>}
                              </td>
                              <td className="p-2 text-center">
                                {item.nivel_riesgo === 'normal' ? (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                ) : (
                                  <Badge className={`${cfg.color} text-[10px] border`}>{cfg.label}</Badge>
                                )}
                              </td>
                              <td className="p-2 align-middle max-w-[140px]" title={buildObsText(item)}>
                                {item.nivel_riesgo !== 'normal' ? (
                                  <div className="flex flex-wrap gap-0.5 leading-tight">
                                    {buildObsBadges(item).map((b, idx) => (
                                      <span key={idx} className={`inline-flex items-center px-1 py-0 text-[9px] font-medium rounded ${b.cls}`}>{b.text}</span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                )}
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button
                                    type="button" variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => navigate(`/registros/editar/${item.registro_id}`)}                                    title="Abrir registro"
                                    data-testid={`open-registro-${item.movimiento_id}`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button" variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => setIncDialog(item)}
                                    title="Agregar incidencia"
                                    data-testid={`add-incidencia-${item.movimiento_id}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {/* Sub-fila: incidencias expandidas */}
                            {expandedInc[item.registro_id] && (
                              <tr className="bg-amber-50/30">
                                <td colSpan={filtroServicio === '__todos__' ? 18 : 17} className="p-0">
                                  <div className="px-4 py-2 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Incidencias — Corte {item.n_corte}</span>
                                      <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setExpandedInc(prev => ({ ...prev, [item.registro_id]: false }))}>
                                        <X className="h-3 w-3 mr-0.5" /> Cerrar
                                      </Button>
                                    </div>
                                    {!incidenciasPorRegistro[item.registro_id] ? (
                                      <p className="text-xs text-muted-foreground">Cargando...</p>
                                    ) : incidenciasPorRegistro[item.registro_id].filter(i => i.estado === 'ABIERTA').length === 0 ? (
                                      <p className="text-xs text-muted-foreground">Sin incidencias abiertas</p>
                                    ) : (
                                      incidenciasPorRegistro[item.registro_id].filter(i => i.estado === 'ABIERTA').map(inc => (
                                        <div key={inc.id} className="flex items-center gap-3 p-2 rounded border bg-white text-xs">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <Badge variant="destructive" className="text-[10px]">ABIERTA</Badge>
                                              <span className="font-medium">{inc.motivo_nombre || inc.tipo}</span>
                                              {inc.paraliza && <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">Paraliza</Badge>}
                                            </div>
                                            {inc.comentario && <p className="text-muted-foreground mt-0.5">{inc.comentario}</p>}
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                              {inc.usuario && <span className="font-medium">{inc.usuario} · </span>}
                                              {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                                            </p>
                                          </div>
                                          <Button
                                            type="button" variant="outline" size="sm" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50 shrink-0"
                                            onClick={() => setResolverDialog({ id: inc.id, registro_id: item.registro_id, motivo: inc.motivo_nombre || inc.tipo, comentario: inc.comentario })}
                                            data-testid={`resolver-inc-${inc.id}`}
                                          >
                                            <Check className="h-3 w-3 mr-1" /> Resolver
                                          </Button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog incidencia rápida */}
      <Dialog open={!!incDialog} onOpenChange={(open) => { if (!open) { setIncDialog(null); setIncParaliza(false); setIncMotivo(''); setIncComentario(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incidencia — Corte {incDialog?.n_corte}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Motivo</label>
              <Select value={incMotivo} onValueChange={setIncMotivo}>
                <SelectTrigger className="h-9" data-testid="inc-rapida-motivo"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                <SelectContent>
                  {motivos.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Comentario (opcional)</label>
              <Textarea value={incComentario} onChange={e => setIncComentario(e.target.value)} rows={2} className="text-sm" data-testid="inc-rapida-comentario" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="paraliza-check"
                checked={incParaliza}
                onCheckedChange={setIncParaliza}
                data-testid="inc-rapida-paraliza"
              />
              <label htmlFor="paraliza-check" className="text-sm font-medium leading-none cursor-pointer select-none">
                Paraliza producción
              </label>
            </div>
            {incParaliza && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                Al activar esta opción, el registro quedará paralizado hasta que se resuelva esta incidencia.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setIncDialog(null); setIncParaliza(false); setIncMotivo(''); setIncComentario(''); }}>Cancelar</Button>
            <Button onClick={handleIncidenciaRapida} disabled={!incMotivo || incSaving} className={incParaliza ? 'bg-red-600 hover:bg-red-700' : ''} data-testid="inc-rapida-guardar">
              {incSaving ? 'Guardando...' : incParaliza ? 'Crear y Paralizar' : 'Crear Incidencia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog resolver incidencia */}
      <Dialog open={!!resolverDialog} onOpenChange={(open) => { if (!open) { setResolverDialog(null); setResolverTexto(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Resolver incidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{resolverDialog?.motivo}</p>
              {resolverDialog?.comentario && <p className="text-muted-foreground text-xs mt-1">{resolverDialog.comentario}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Texto de resolución <span className="text-red-500">*</span></label>
              <Textarea
                value={resolverTexto}
                onChange={e => setResolverTexto(e.target.value)}
                rows={3}
                className="text-sm mt-1"
                placeholder="Describe cómo se resolvió..."
                data-testid="resolver-texto"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResolverDialog(null); setResolverTexto(''); }}>Cancelar</Button>
            <Button onClick={handleResolver} disabled={resolverSaving || !resolverTexto.trim()} className="bg-green-600 hover:bg-green-700" data-testid="btn-confirmar-resolver">
              <Check className="h-4 w-4 mr-1" />
              {resolverSaving ? 'Resolviendo...' : 'Marcar como resuelta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog avances de incidencia */}
      <Dialog open={!!avancesDialog} onOpenChange={(open) => !open && setAvancesDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {avancesDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <FileWarning className="h-4 w-4 text-amber-500"/>
                  Incidencia · Corte <span className="font-mono">{avancesDialog.n_corte}</span>
                  {avancesDialog.estado === 'ABIERTA'
                    ? <Badge className="bg-amber-500 text-white text-[10px] px-1.5">ABIERTA</Badge>
                    : <Badge className="bg-emerald-600 text-white text-[10px] px-1.5">RESUELTA</Badge>}
                  {avancesDialog.paraliza && (
                    <Badge className="bg-red-600 text-white text-[10px] px-1.5 gap-0.5">
                      <PauseCircle className="h-2.5 w-2.5"/>PARALIZA
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs space-y-0.5">
                  <div><strong>Motivo:</strong> {avancesDialog.motivo_nombre || avancesDialog.tipo || '-'}</div>
                  <div><strong>Reportada:</strong> {avancesDialog.fecha_hora ? formatDate(avancesDialog.fecha_hora) : '-'} por <em>{avancesDialog.usuario || '-'}</em></div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Comentario inicial</div>
                  <div className="text-sm bg-muted/30 rounded p-2 border">{avancesDialog.comentario || '—'}</div>
                </div>
                {avancesDialog.estado === 'RESUELTA' && avancesDialog.comentario_resolucion && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">Resolución</div>
                    <div className="text-sm bg-emerald-50/50 dark:bg-emerald-950/20 rounded p-2 border border-emerald-200/50 text-emerald-900 dark:text-emerald-100">
                      ✓ {avancesDialog.comentario_resolucion}
                    </div>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3"/> Historial de avances
                  </div>
                  <IncidenciaAvances incidenciaId={avancesDialog.id} canWrite />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReporteCostura;
