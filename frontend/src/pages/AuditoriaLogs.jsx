import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, User, Package, Database, RefreshCw, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { formatDateTime, formatDate } from '../lib/dateUtils';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ACCION_CFG = {
  INSERT: { label: 'Creado',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-500' },
  UPDATE: { label: 'Editado',   cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',       dot: 'bg-blue-500' },
  DELETE: { label: 'Eliminado', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',           dot: 'bg-red-500' },
  LOGIN:  { label: 'Login',     cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300', dot: 'bg-purple-500' },
};

const MODULO_ICON = {
  produccion: Package,
  inventario: Database,
  auth:       User,
};

const TABLE_LABELS = {
  prod_registros: 'Registro',
  inv_items: 'Inventario',
  inv_salidas: 'Salida',
  inv_ingresos: 'Ingreso',
  auth_users: 'Usuario',
};

function getCambios(antes, despues) {
  if (!antes || !despues) return [];
  const cambios = [];
  const keys = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
  keys.forEach(k => {
    const a = JSON.stringify(antes[k]);
    const d = JSON.stringify(despues[k]);
    if (a !== d) cambios.push({ campo: k, antes: antes[k], despues: despues[k] });
  });
  return cambios;
}

function fmtVal(v) {
  if (v === null || v === undefined) return <span className="text-muted-foreground italic text-xs">vacío</span>;
  if (typeof v === 'boolean') return <span className={v ? 'text-emerald-600' : 'text-red-600'}>{v ? 'Sí' : 'No'}</span>;
  return <span>{String(v)}</span>;
}

function AuditoriaRow({ item }) {
  const [open, setOpen] = useState(false);
  const accion = ACCION_CFG[item.accion] || { label: item.accion, cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-gray-400' };
  const ModIcon = MODULO_ICON[item.modulo] || Shield;
  const cambios = getCambios(item.datos_antes, item.datos_despues);
  const tabla = TABLE_LABELS[item.tabla] || item.tabla;
  const fechaStr = formatDate(item.fecha_hora);
  const horaStr = new Date(item.fecha_hora).toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit', timeZone: 'America/Lima' });

  return (
    <div className="relative pl-8">
      <div className={"absolute left-2.5 top-4 h-2.5 w-2.5 rounded-full border-2 border-background ring-1 ring-border " + accion.dot} />
      <div className={"rounded-xl border bg-card transition-all " + (open ? 'shadow-sm' : '')}>
        <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors rounded-xl"
          onClick={() => setOpen(p => !p)}>
          <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-muted">
            <ModIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{item.usuario}</span>
              <span className={"inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border " + accion.cls}>{accion.label}</span>
              <span className="text-xs text-muted-foreground">{tabla}</span>
              {item.referencia && <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{item.referencia}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.modulo} · {item.resultado === 'OK' ? <span className="text-emerald-600">OK</span> : <span className="text-red-600">{item.resultado}</span>}
              {item.observacion && <span> · {item.observacion}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs font-medium">{fechaStr}</p>
              <p className="text-[11px] text-muted-foreground">{horaStr}</p>
            </div>
            {cambios.length > 0 && (
              open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {open && cambios.length > 0 && (
          <div className="px-4 pb-3 border-t">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Cambios ({cambios.length})</p>
            <div className="space-y-1.5">
              {cambios.map((c, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_1fr] gap-2 text-xs items-center">
                  <span className="font-mono text-muted-foreground truncate">{c.campo}</span>
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded px-2 py-1 truncate line-through text-red-600">{fmtVal(c.antes)}</div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded px-2 py-1 truncate text-emerald-700">{fmtVal(c.despues)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {open && cambios.length === 0 && item.datos_antes && (
          <div className="px-4 pb-3 border-t">
            <p className="text-xs text-muted-foreground mt-2">Sin cambios de campos detectados.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function groupByDate(items) {
  const groups = {};
  items.forEach(item => {
    const d = item.fecha_hora?.substring(0, 10) || 'Sin fecha';
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export const AuditoriaLogs = () => {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [filtroAccion, setFiltroAccion] = useState('todos');
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const LIMIT = 50;

  const cargar = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: p * LIMIT });
      if (filtroAccion !== 'todos') params.set('accion', filtroAccion);
      if (filtroModulo !== 'todos') params.set('modulo', filtroModulo);
      if (busqueda) params.set('usuario', busqueda);
      const r = await axios.get(`${API}/auditoria?${params.toString()}`);
      setItems(r.data?.items || r.data || []);
      setTotal(r.data?.total || 0);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [filtroAccion, filtroModulo, busqueda]);

  useEffect(() => { setPage(0); cargar(0); }, [filtroAccion, filtroModulo]);
  useEffect(() => { cargar(page); }, [page]);

  const grupos = groupByDate(items);
  const fmtFecha = (d) => {
    const hoy = new Date().toISOString().substring(0,10);
    const ayer = new Date(Date.now()-86400000).toISOString().substring(0,10);
    if (d === hoy) return 'Hoy';
    if (d === ayer) return 'Ayer';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday:'long', day:'numeric', month:'long' });
  };

  const insertCount = items.filter(i => i.accion === 'INSERT').length;
  const updateCount = items.filter(i => i.accion === 'UPDATE').length;
  const deleteCount = items.filter(i => i.accion === 'DELETE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Auditoria del Sistema
          </h2>
          <p className="text-sm text-muted-foreground">Registro visual de cambios criticos en produccion e inventario</p>
        </div>
        <button onClick={() => cargar(page)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Creaciones', value: insertCount, cls: 'text-emerald-600', dot: 'bg-emerald-500' },
          { label: 'Ediciones',  value: updateCount, cls: 'text-blue-600',    dot: 'bg-blue-500' },
          { label: 'Eliminaciones', value: deleteCount, cls: 'text-red-600',  dot: 'bg-red-500' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className={"h-3 w-3 rounded-full flex-shrink-0 " + k.dot} />
            <div>
              <p className={"text-xl font-bold font-mono " + k.cls}>{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar usuario..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && cargar(0)}
            className="pl-8 h-8 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['todos','INSERT','UPDATE','DELETE'].map(a => (
            <button key={a} onClick={() => setFiltroAccion(a)}
              className={"px-2.5 py-1 text-xs rounded-md border font-medium transition-colors " + (filtroAccion===a ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border')}>
              {a === 'todos' ? 'Todos' : a === 'INSERT' ? 'Creados' : a === 'UPDATE' ? 'Editados' : 'Eliminados'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {['todos','produccion','inventario'].map(m => (
            <button key={m} onClick={() => setFiltroModulo(m)}
              className={"px-2.5 py-1 text-xs rounded-md border font-medium transition-colors " + (filtroModulo===m ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border')}>
              {m === 'todos' ? 'Todo' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Cargando auditoria...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Shield className="h-10 w-10 opacity-20 mb-2" />
          <p className="text-sm">Sin registros en este filtro</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([fecha, rows]) => (
            <div key={fecha}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">{fmtFecha(fecha)}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="relative space-y-2">
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
                {rows.map(item => <AuditoriaRow key={item.id} item={item} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">{total} registros totales</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
              className="px-3 py-1.5 text-xs rounded-md border hover:bg-muted disabled:opacity-40 transition-colors">
              Anterior
            </button>
            <span className="px-3 py-1.5 text-xs text-muted-foreground">Pag {page+1} / {Math.ceil(total/LIMIT)}</span>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*LIMIT >= total}
              className="px-3 py-1.5 text-xs rounded-md border hover:bg-muted disabled:opacity-40 transition-colors">
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditoriaLogs;
