import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  FlaskConical, ExternalLink, AlertCircle, Send, CheckCircle2, XCircle, Download, Loader2, Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NuevaMuestraForm, DetalleColores } from '../components/MuestrasLavanderiaSection';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_CFG = {
  enviada:            { label: 'Enviada',    icon: Send,         classes: 'bg-blue-100 text-blue-700 border-blue-300' },
  pendiente_decision: { label: 'Pendiente',  icon: AlertCircle,  classes: 'bg-orange-100 text-orange-700 border-orange-300' },
  aprobada:           { label: 'Aprobada',   icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  rechazada:          { label: 'Rechazada',  icon: XCircle,      classes: 'bg-red-100 text-red-700 border-red-300' },
  parcial:            { label: 'Parcial',    icon: AlertCircle,  classes: 'bg-amber-100 text-amber-700 border-amber-300' },
};

const formatFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

const exportCSV = (rows) => {
  const headers = ['Corte', 'Modelo', 'Marca', 'Tipo', 'Entalle', 'Tela', 'Hilo', 'Lavandería', 'Estado', 'Muestra', 'Cantidad', 'Envío', 'Retorno', 'Días', 'Colores', 'Destino', 'Observaciones'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const colores = (r.colores || []).map(c => `${c.color}:${c.cantidad}${c.decision ? `(${c.decision})` : ''}`).join('; ');
    const fields = [
      r.n_corte, r.modelo, r.marca, r.tipo, r.entalle, r.tela, r.hilo,
      r.lavanderia_nombre || '',
      r.estado_corte,
      ESTADO_CFG[r.estado]?.label || r.estado,
      r.cantidad_total, formatFecha(r.fecha_envio), formatFecha(r.fecha_retorno),
      r.dias_en_lavanderia ?? '', colores, r.destino || '', r.observaciones || '',
    ].map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(fields.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `muestras-lavanderia-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function ReporteMuestrasLavanderia() {
  const navigate = useNavigate();
  const { empresaId } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soloEnProceso, setSoloEnProceso] = useState(true);
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [search, setSearch] = useState('');

  // Dialog nueva muestra
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [cortesElegibles, setCortesElegibles] = useState([]);
  const [coloresCatalogo, setColoresCatalogo] = useState([]);
  const [loadingNueva, setLoadingNueva] = useState(false);

  // Dialog detalle de muestra (colores con decisiones)
  const [detalleId, setDetalleId] = useState(null);
  const detalleMuestra = useMemo(
    () => (detalleId != null ? data.find(m => m.id === detalleId) || null : null),
    [detalleId, data]
  );

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('empresa_id', String(empresaId || 7));
    params.set('solo_en_proceso', String(soloEnProceso));
    if (estadoFiltro !== 'todos') params.set('estado', estadoFiltro);
    axios.get(`${API}/muestras-lavanderia?${params}`)
      .then(r => setData(Array.isArray(r.data) ? r.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [empresaId, soloEnProceso, estadoFiltro]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Carga cortes en estados taller + catálogo de colores al abrir el dialog
  useEffect(() => {
    if (!nuevaOpen) return;
    setLoadingNueva(true);
    const params = new URLSearchParams();
    params.set('empresa_id', String(empresaId || 7));
    params.set('estados', 'Para Lavandería,Para Atraque,Atraque,Muestra Lavanderia');
    params.set('limit', '500');
    Promise.all([
      axios.get(`${API}/registros?${params}`).catch(() => ({ data: { items: [] } })),
      axios.get(`${API}/colores-catalogo?incluir_todos=true`).catch(() => ({ data: [] })),
    ]).then(([rr, rc]) => {
      const items = Array.isArray(rr.data?.items) ? rr.data.items : (Array.isArray(rr.data) ? rr.data : []);
      setCortesElegibles(items.map(it => ({
        id: it.id,
        n_corte: it.n_corte,
        modelo: it.modelo_nombre || it.modelo || '',
        estado: it.estado || '',
      })));
      setColoresCatalogo(Array.isArray(rc.data) ? rc.data : []);
    }).finally(() => setLoadingNueva(false));
  }, [nuevaOpen, empresaId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(r =>
      (r.n_corte || '').toLowerCase().includes(q) ||
      (r.modelo || '').toLowerCase().includes(q) ||
      (r.marca || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  const totales = useMemo(() => ({
    total: filtered.length,
    enviadas: filtered.filter(r => r.estado === 'enviada').length,
    pendientes: filtered.filter(r => r.estado === 'pendiente_decision').length,
    cantidad: filtered.reduce((s, r) => s + (r.cantidad_total || 0), 0),
  }), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-sky-700 dark:text-sky-400" /> Muestras de lavandería
          </h2>
          <p className="text-sm text-muted-foreground">Listado global de envíos a lavandería con estado y trazabilidad por corte</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setNuevaOpen(true)}
            data-testid="btn-nueva-muestra"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nueva muestra
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(filtered)}
            disabled={!filtered.length}
            data-testid="btn-export-muestras-csv"
          >
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="search-muestras" className="text-xs text-muted-foreground">Búsqueda</Label>
          <Input
            id="search-muestras"
            placeholder="Corte, modelo o marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[220px] text-xs"
            data-testid="input-search-muestras"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="estado-muestras" className="text-xs text-muted-foreground">Estado</Label>
          <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
            <SelectTrigger id="estado-muestras" className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="enviada">Enviadas</SelectItem>
              <SelectItem value="pendiente_decision">Pendiente decisión</SelectItem>
              <SelectItem value="aprobada">Aprobadas</SelectItem>
              <SelectItem value="rechazada">Rechazadas</SelectItem>
              <SelectItem value="parcial">Parciales</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pl-2 border-l h-8 self-end">
          <Switch
            id="solo-en-proceso"
            checked={soloEnProceso}
            onCheckedChange={setSoloEnProceso}
            data-testid="switch-solo-en-proceso"
          />
          <Label htmlFor="solo-en-proceso" className="text-xs cursor-pointer">Solo en proceso</Label>
        </div>
      </div>

      {/* Totales */}
      <div className="flex gap-2 flex-wrap text-xs">
        <Badge variant="outline" className="px-2 py-1">{totales.total} muestra{totales.total !== 1 ? 's' : ''}</Badge>
        <Badge variant="outline" className="px-2 py-1 bg-blue-50 text-blue-700 border-blue-300">{totales.enviadas} enviadas</Badge>
        <Badge variant="outline" className="px-2 py-1 bg-orange-50 text-orange-700 border-orange-300">{totales.pendientes} pendientes</Badge>
        <Badge variant="outline" className="px-2 py-1">{totales.cantidad} prendas en muestreo</Badge>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando muestras...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
          <FlaskConical className="h-8 w-8 opacity-30" />
          <p className="text-sm">Sin muestras con los filtros actuales</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto" data-testid="tabla-muestras">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2 border-b font-medium">Corte</th>
                <th className="text-left p-2 border-b font-medium">Modelo</th>
                <th className="text-left p-2 border-b font-medium">Marca · Tipo · Entalle · Tela · Hilo</th>
                <th className="text-left p-2 border-b font-medium">Lavandería</th>
                <th className="text-left p-2 border-b font-medium">Estado</th>
                <th className="text-right p-2 border-b font-medium w-[60px]">Cant</th>
                <th className="text-center p-2 border-b font-medium w-[80px]">Envío</th>
                <th className="text-center p-2 border-b font-medium w-[80px]">Retorno</th>
                <th className="text-center p-2 border-b font-medium w-[60px]">Días</th>
                <th className="text-left p-2 border-b font-medium">Colores</th>
                <th className="text-center p-2 border-b font-medium w-[110px]">Muestra</th>
                <th className="text-center p-2 border-b font-medium w-[60px]">—</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cfg = ESTADO_CFG[r.estado] || ESTADO_CFG.enviada;
                const StatusIcon = cfg.icon;
                const meta = [r.marca, r.tipo, r.entalle, r.tela, r.hilo].filter(Boolean).join(' · ');
                return (
                  <tr
                    key={r.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => setDetalleId(r.id)}
                    title="Ver colores de la muestra y aprobar/rechazar"
                    data-testid={`fila-muestra-${r.id}`}
                  >
                    <td className="p-2 font-mono font-medium">{r.n_corte}</td>
                    <td className="p-2 truncate max-w-[160px]" title={r.modelo}>{r.modelo || '—'}</td>
                    <td className="p-2 text-muted-foreground">{meta || '—'}</td>
                    <td className="p-2 truncate max-w-[160px] text-[11px]" title={r.lavanderia_nombre || ''}>
                      {r.lavanderia_nombre || <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[9px] px-1">{r.estado_corte || '—'}</Badge>
                    </td>
                    <td className="p-2 text-right font-mono">{r.cantidad_total}</td>
                    <td className="p-2 text-center text-[10px]">{formatFecha(r.fecha_envio)}</td>
                    <td className="p-2 text-center text-[10px]">{formatFecha(r.fecha_retorno)}</td>
                    <td className="p-2 text-center font-mono">
                      {r.dias_en_lavanderia != null ? (
                        <span className={r.fecha_retorno ? '' : (r.dias_en_lavanderia >= 7 ? 'text-red-600 font-semibold' : 'text-amber-700')}>
                          {r.dias_en_lavanderia}d
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {(r.colores || []).slice(0, 5).map((c, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1 py-0.5 rounded border bg-background"
                            title={c.decision ? `${c.color} (${c.decision})` : c.color}
                          >
                            {c.color} <span className="text-muted-foreground font-mono">({c.cantidad})</span>
                          </span>
                        ))}
                        {(r.colores || []).length > 5 && (
                          <span className="text-[9px] text-muted-foreground">+{r.colores.length - 5}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={`text-[9px] px-1 gap-0.5 ${cfg.classes}`}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); navigate(`/registros/editar/${r.registro_id}`); }}
                        title="Abrir registro completo"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog: crear nueva muestra */}
      <Dialog open={nuevaOpen} onOpenChange={setNuevaOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-700 dark:text-sky-400" />
              Nueva muestra a lavandería
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Elige el corte (debe estar en taller: Para Lavandería, Atraque, Muestra Lavanderia) y los colores con su cantidad.
            </p>
          </DialogHeader>
          {loadingNueva ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cortes y colores...
            </div>
          ) : (
            <NuevaMuestraForm
              cortes={cortesElegibles}
              colores={coloresCatalogo}
              onCancel={() => setNuevaOpen(false)}
              onCreated={() => { setNuevaOpen(false); fetchData(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: detalle de colores de la muestra */}
      <Dialog open={!!detalleMuestra} onOpenChange={(v) => !v && setDetalleId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-700 dark:text-sky-400" />
              Muestra · Corte {detalleMuestra?.n_corte} · {detalleMuestra?.modelo || '—'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Enviada {formatFecha(detalleMuestra?.fecha_envio)}
              {detalleMuestra?.fecha_retorno && ` · Devuelta ${formatFecha(detalleMuestra.fecha_retorno)}`}
              {' · '}{detalleMuestra?.cantidad_total} prendas
            </p>
          </DialogHeader>
          {detalleMuestra && (
            <>
              <DetalleColores muestra={detalleMuestra} onChanged={fetchData} />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/registros/editar/${detalleMuestra.registro_id}`)}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Abrir registro completo
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
