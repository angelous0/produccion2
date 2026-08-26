import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Camera, Globe, Search, Loader2, RefreshCw, Undo2, CheckCircle2, Image, Check,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const ESTADOS = ['Para Acabado', 'Acabado', 'Producto Terminado', 'Almacen PT', 'Tienda'];

// Orden real del flujo de producción (no alfabético): un corte en
// "Para Acabado" va antes que uno en "Tienda".
const ORDEN_ESTADO = {
  'Para Acabado': 0, 'Acabado': 1, 'Producto Terminado': 2, 'Almacen PT': 3, 'Tienda': 4,
};

// Encabezado de columna clickeable: asc → desc → asc...
const ThOrden = ({ campo, orden, setOrden, children, align = 'left' }) => {
  const activo = orden.campo === campo;
  const alineacion = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '';
  return (
    <button
      type="button"
      onClick={() => setOrden(o => ({ campo, dir: o.campo === campo && o.dir === 'asc' ? 'desc' : 'asc' }))}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${alineacion} ${activo ? 'text-foreground font-semibold' : ''}`}
      title="Ordenar"
    >
      {children}
      {activo
        ? (orden.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
        : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
    </button>
  );
};

const estadoColor = (e) => ({
  'Para Acabado': 'bg-amber-100 text-amber-800 border-amber-200',
  'Acabado': 'bg-orange-100 text-orange-800 border-orange-200',
  'Producto Terminado': 'bg-violet-100 text-violet-800 border-violet-200',
  'Almacen PT': 'bg-red-100 text-red-800 border-red-200',
  'Tienda': 'bg-blue-100 text-blue-800 border-blue-200',
}[e] || 'bg-zinc-100 text-zinc-700 border-zinc-200');

const fmtFecha = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: 'short', year: '2-digit',
    });
  } catch { return null; }
};

// Botón de marcado: gris con ícono cuando falta, verde con check cuando está hecho.
// Reemplaza al checkbox chico (16px, borde azul) que se leía como un cuadrado macizo.
const MarcaToggle = ({ activo, onClick, disabled, Icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={activo ? `${label} hecho — click para desmarcar` : `Marcar ${label}`}
    aria-pressed={activo}
    className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-all
      ${activo
        ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm hover:bg-emerald-600'
        : 'bg-background border-input text-muted-foreground/40 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'}
      disabled:opacity-40 disabled:cursor-not-allowed`}
  >
    {activo ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
  </button>
);

// Marca visual de quién/cuándo marcó una casilla
const Firma = ({ por, at }) => {
  if (!por && !at) return null;
  return (
    <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">
      {por || '—'}{at && <> · {fmtFecha(at)}</>}
    </div>
  );
};

export const PublicacionCortes = () => {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({ pendientes: 0, solo_foto: 0, solo_web: 0, realizados: 0 });
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('pendientes');
  const [busq, setBusq] = useState('');
  const [fEstado, setFEstado] = useState('todos');
  const [fMarca, setFMarca] = useState('todas');
  const [orden, setOrden] = useState({ campo: 'estado', dir: 'asc' });
  const [seleccion, setSeleccion] = useState(new Set());
  const [guardando, setGuardando] = useState(new Set());
  // Filas que acaban de completarse: se muestran tachadas unos segundos
  // antes de salir de la lista, con opción de deshacer.
  const [saliendo, setSaliendo] = useState({});   // { registro_id: timeoutId }
  const saliendoRef = useRef({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/publicacion-cortes?vista=${vista}`, { headers: hdrs() });
      setItems(res.data.items || []);
      setKpis(res.data.kpis || {});
    } catch {
      toast.error('No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  }, [vista]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => () => {
    Object.values(saliendoRef.current).forEach(clearTimeout);
  }, []);

  const marcas = useMemo(
    () => [...new Set(items.map(i => i.marca).filter(Boolean))].sort(),
    [items],
  );

  const visibles = useMemo(() => {
    let arr = items;
    if (fEstado !== 'todos') arr = arr.filter(i => i.estado === fEstado);
    if (fMarca !== 'todas') arr = arr.filter(i => i.marca === fMarca);
    const q = busq.trim().toLowerCase();
    if (q) {
      arr = arr.filter(i =>
        (i.n_corte || '').toLowerCase().includes(q) ||
        (i.modelo || '').toLowerCase().includes(q));
    }

    if (orden.campo) {
      const signo = orden.dir === 'asc' ? 1 : -1;
      arr = [...arr].sort((a, b) => {
        let va, vb;
        if (orden.campo === 'estado') {
          // por flujo de producción, no alfabético
          va = ORDEN_ESTADO[a.estado] ?? 99;
          vb = ORDEN_ESTADO[b.estado] ?? 99;
        } else if (orden.campo === 'prendas') {
          va = a.prendas; vb = b.prendas;
        } else if (orden.campo === 'n_corte') {
          // numérico cuando se puede ("028" < "169"), si no alfabético
          const na = parseInt(a.n_corte, 10), nb = parseInt(b.n_corte, 10);
          va = isNaN(na) ? Infinity : na; vb = isNaN(nb) ? Infinity : nb;
          if (va === vb) { va = a.n_corte || ''; vb = b.n_corte || ''; }
        } else {
          va = (a[orden.campo] || '').toLowerCase();
          vb = (b[orden.campo] || '').toLowerCase();
        }
        if (va < vb) return -1 * signo;
        if (va > vb) return 1 * signo;
        // desempate estable por n° de corte
        return (a.n_corte || '').localeCompare(b.n_corte || '');
      });
    }
    return arr;
  }, [items, fEstado, fMarca, busq, orden]);

  const quitarDiferido = (registroId) => {
    const t = setTimeout(() => {
      setItems(prev => prev.filter(i => i.registro_id !== registroId));
      setSaliendo(prev => { const n = { ...prev }; delete n[registroId]; return n; });
      delete saliendoRef.current[registroId];
    }, 4000);
    saliendoRef.current[registroId] = t;
    setSaliendo(prev => ({ ...prev, [registroId]: t }));
  };

  const cancelarSalida = (registroId) => {
    const t = saliendoRef.current[registroId];
    if (t) clearTimeout(t);
    delete saliendoRef.current[registroId];
    setSaliendo(prev => { const n = { ...prev }; delete n[registroId]; return n; });
  };

  const toggle = async (item, campo, valor) => {
    setGuardando(prev => new Set(prev).add(item.registro_id));
    try {
      const res = await axios.patch(
        `${API}/publicacion-cortes/${item.registro_id}`,
        { [campo]: valor },
        { headers: hdrs() },
      );
      const d = res.data;
      setItems(prev => prev.map(i => i.registro_id === item.registro_id ? { ...i, ...d } : i));

      // Si quedó completo estando en "pendientes", se va (con opción de deshacer)
      if (vista === 'pendientes' && d.realizado) {
        setKpis(k => ({ ...k, pendientes: Math.max(0, k.pendientes - 1), realizados: k.realizados + 1 }));
        quitarDiferido(item.registro_id);
        toast.success(`Corte ${item.n_corte} · ${item.modelo} realizado`, {
          description: 'Sale de pendientes',
          action: {
            label: 'Deshacer',
            onClick: () => { cancelarSalida(item.registro_id); toggle({ ...item, ...d }, campo, !valor); },
          },
        });
      } else if (vista === 'realizados' && !d.realizado) {
        setKpis(k => ({ ...k, realizados: Math.max(0, k.realizados - 1), pendientes: k.pendientes + 1 }));
        quitarDiferido(item.registro_id);
        toast.info(`Corte ${item.n_corte} vuelve a pendientes`);
      }
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'No se pudo guardar');
    } finally {
      setGuardando(prev => { const n = new Set(prev); n.delete(item.registro_id); return n; });
    }
  };

  const marcarSeleccion = async (campos, etiqueta) => {
    if (seleccion.size === 0) return;
    try {
      const res = await axios.post(`${API}/publicacion-cortes/bulk`,
        { registro_ids: [...seleccion], ...campos }, { headers: hdrs() });
      toast.success(`${res.data.actualizados} cortes marcados como ${etiqueta}`);
      setSeleccion(new Set());
      fetchData();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Error al marcar');
    }
  };

  const toggleSel = (id) => setSeleccion(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const todosSel = visibles.length > 0 && visibles.every(i => seleccion.has(i.registro_id));

  const Kpi = ({ label, valor, sub, color }) => (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
      <p className={`text-2xl mt-1 tabular-nums leading-none ${color}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="publicacion-cortes">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <nav className="text-xs text-muted-foreground mb-1">Reportes</nav>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Camera className="h-6 w-6 text-teal-600" />
            Publicación de Cortes
          </h1>
          <p className="text-sm text-muted-foreground">
            Fotografía y publicación web · desde "Para Acabado" en adelante
          </p>
        </div>
        <div className="flex items-center gap-2">
          {seleccion.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1">Marcar {seleccion.size} ▾</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => marcarSeleccion({ tiene_foto: true }, 'fotografiados')}>
                  <Camera className="h-3.5 w-3.5 mr-2" /> Solo fotografía
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => marcarSeleccion({ en_web: true }, 'publicados')}>
                  <Globe className="h-3.5 w-3.5 mr-2" /> Solo página web
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => marcarSeleccion({ tiene_foto: true, en_web: true }, 'realizados')}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Ambas (realizado)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={fetchData} variant="outline" size="sm" className="gap-1" disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refrescar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Pendientes" valor={kpis.pendientes ?? 0} sub="falta foto o web" color="text-amber-600" />
        <Kpi label="Solo con foto" valor={kpis.solo_foto ?? 0} sub="falta subir a web" color="text-blue-600" />
        <Kpi label="Solo en web" valor={kpis.solo_web ?? 0} sub="falta fotografiar" color="text-violet-600" />
        <Kpi label="Realizados" valor={kpis.realizados ?? 0} sub="foto + web" color="text-emerald-600" />
      </div>

      {/* Tabs + filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
          {[
            { v: 'pendientes', l: `Pendientes (${kpis.pendientes ?? 0})` },
            { v: 'realizados', l: `Realizados (${kpis.realizados ?? 0})` },
          ].map(o => (
            <button key={o.v} type="button" onClick={() => { setVista(o.v); setSeleccion(new Set()); }}
              className={`px-3 py-1.5 rounded transition-colors ${
                vista === o.v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
              {o.l}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input className="h-9 pl-8 w-[220px]" placeholder="Buscar corte o modelo..."
            value={busq} onChange={e => setBusq(e.target.value)} />
        </div>
        <Select value={fEstado} onValueChange={setFEstado}>
          <SelectTrigger className="h-9 w-[190px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fMarca} onValueChange={setFMarca}>
          <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las marcas</SelectItem>
            {marcas.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Cargando...
        </CardContent></Card>
      ) : visibles.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Image className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">
            {vista === 'pendientes' ? '¡Todo publicado!' : 'Todavía no hay cortes realizados'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {vista === 'pendientes'
              ? 'No quedan cortes sin fotografiar ni publicar.'
              : 'Marcá fotografía y web en la pestaña Pendientes.'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-[36px_90px_minmax(160px,1.4fr)_minmax(120px,1fr)_130px_80px_130px_130px] gap-3 items-center px-3 py-2 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            <Checkbox className="border-muted-foreground/30 bg-transparent data-[state=checked]:bg-transparent data-[state=checked]:border-emerald-500 data-[state=checked]:text-emerald-600" checked={todosSel}
              onCheckedChange={(c) => setSeleccion(c ? new Set(visibles.map(i => i.registro_id)) : new Set())} />
            <ThOrden campo="n_corte" orden={orden} setOrden={setOrden}>N° Corte</ThOrden>
            <ThOrden campo="modelo" orden={orden} setOrden={setOrden}>Modelo</ThOrden>
            <ThOrden campo="marca" orden={orden} setOrden={setOrden}>Marca</ThOrden>
            <ThOrden campo="estado" orden={orden} setOrden={setOrden}>Estado</ThOrden>
            <ThOrden campo="prendas" orden={orden} setOrden={setOrden} align="right">Prendas</ThOrden>
            <span className="text-center">Fotografía</span>
            <span className="text-center">Página Web</span>
          </div>
          <div className="divide-y">
            {visibles.map(i => {
              const seSale = !!saliendo[i.registro_id];
              const busy = guardando.has(i.registro_id);
              return (
                <div key={i.registro_id}
                  className={`grid grid-cols-[36px_90px_minmax(160px,1.4fr)_minmax(120px,1fr)_130px_80px_130px_130px] gap-3 items-center px-3 py-2 text-sm transition-all ${
                    seSale ? 'bg-emerald-50 dark:bg-emerald-950/20 opacity-50 line-through' : 'hover:bg-muted/30'}`}>
                  <Checkbox className="border-muted-foreground/30 bg-transparent data-[state=checked]:bg-transparent data-[state=checked]:border-emerald-500 data-[state=checked]:text-emerald-600" checked={seleccion.has(i.registro_id)}
                    onCheckedChange={() => toggleSel(i.registro_id)} />
                  <span className="font-mono tabular-nums font-semibold">{i.n_corte}</span>
                  <span className="font-medium truncate" title={i.modelo}>{i.modelo}</span>
                  <span className="text-muted-foreground truncate">{i.marca}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border justify-self-start ${estadoColor(i.estado)}`}>
                    {i.estado}
                  </span>
                  <span className="text-right tabular-nums">{i.prendas.toLocaleString('es-PE')}</span>
                  <div className="flex flex-col items-center" data-testid={`foto-${i.registro_id}`}>
                    <MarcaToggle activo={i.tiene_foto} disabled={busy} Icon={Camera} label="Fotografía"
                      onClick={() => toggle(i, 'tiene_foto', !i.tiene_foto)} />
                    <Firma por={i.foto_por} at={i.foto_at} />
                  </div>
                  <div className="flex flex-col items-center" data-testid={`web-${i.registro_id}`}>
                    <MarcaToggle activo={i.en_web} disabled={busy} Icon={Globe} label="Página web"
                      onClick={() => toggle(i, 'en_web', !i.en_web)} />
                    <Firma por={i.web_por} at={i.web_at} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t bg-muted/15 text-[11px] text-muted-foreground flex items-center gap-2">
            <span>{visibles.length} de {items.length} cortes</span>
            {Object.keys(saliendo).length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Undo2 className="h-3 w-3" /> Usá "Deshacer" en el aviso si te equivocaste
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicacionCortes;
