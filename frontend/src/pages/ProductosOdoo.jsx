import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Package, RefreshCw, Search, Pencil, Loader2, Ban, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Palette, Check } from 'lucide-react';
import { toast } from 'sonner';
import ProductoOdooModal from '../components/ProductoOdooModal';
import ExportButton from '../components/ExportButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_COLORS = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  parcial: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  completo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  excluido: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const ProductosOdoo = () => {
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState('pendiente');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroTelaGeneral, setFiltroTelaGeneral] = useState('');
  const [filtroEntalle, setFiltroEntalle] = useState('');
  const [filtroHilo, setFiltroHilo] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [sortDir, setSortDir] = useState('asc');
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [telasGenerales, setTelasGenerales] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [hilos, setHilos] = useState([]);
  // Facets: IDs de cada dimensión que aparecen en algún producto con los filtros actuales
  const [facets, setFacets] = useState({ marca: null, tipo: null, tela: null, entalle: null, hilo: null });
  const [editing, setEditing] = useState(null);

  const limit = 50;

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/odoo-enriq/stats`);
      setStats(res.data);
    } catch {
      // silencio
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('estado', tab);
      params.append('page', page);
      params.append('limit', limit);
      if (q.trim()) params.append('q', q.trim());
      if (filtroMarca) params.append('marca_id', filtroMarca);
      if (filtroTipo) params.append('tipo_id', filtroTipo);
      if (filtroTelaGeneral) params.append('tela_general_id', filtroTelaGeneral);
      if (filtroEntalle) params.append('entalle_id', filtroEntalle);
      if (filtroHilo) params.append('hilo_id', filtroHilo);
      if (sortBy !== 'default') {
        params.append('sort_by', sortBy);
        params.append('sort_dir', sortDir);
      }
      const res = await axios.get(`${API}/odoo-enriq?${params.toString()}`);
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [tab, page, q, filtroMarca, filtroTipo, filtroTelaGeneral, filtroEntalle, filtroHilo, sortBy, sortDir]);

  // Facets cascada: recomputa qué opciones están disponibles dados los filtros actuales
  const fetchFacets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('estado', tab);
      if (filtroMarca) params.append('marca_id', filtroMarca);
      if (filtroTipo) params.append('tipo_id', filtroTipo);
      if (filtroTelaGeneral) params.append('tela_general_id', filtroTelaGeneral);
      if (filtroEntalle) params.append('entalle_id', filtroEntalle);
      if (filtroHilo) params.append('hilo_id', filtroHilo);
      const res = await axios.get(`${API}/odoo-enriq/facets/cascada?${params.toString()}`);
      setFacets({
        marca: new Set(res.data.marca || []),
        tipo: new Set(res.data.tipo || []),
        tela: new Set(res.data.tela || []),
        entalle: new Set(res.data.entalle || []),
        hilo: new Set(res.data.hilo || []),
      });
    } catch {
      setFacets({ marca: null, tipo: null, tela: null, entalle: null, hilo: null });
    }
  }, [tab, filtroMarca, filtroTipo, filtroTelaGeneral, filtroEntalle, filtroHilo]);

  useEffect(() => {
    (async () => {
      try {
        const [m, t, tg, e, h] = await Promise.all([
          axios.get(`${API}/marcas`),
          axios.get(`${API}/tipos`),
          axios.get(`${API}/telas-general`),
          axios.get(`${API}/entalles`),
          axios.get(`${API}/hilos`),
        ]);
        setMarcas(m.data || []);
        setTipos(t.data || []);
        setTelasGenerales(tg.data || []);
        setEntalles(e.data || []);
        setHilos(h.data || []);
      } catch {}
    })();
    fetchStats();
  }, [fetchStats]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchFacets(); }, [fetchFacets]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const toastId = toast.loading('Sincronizando con Odoo…');
    try {
      const res = await axios.post(`${API}/odoo-enriq/sync`);
      const d = res.data;
      toast.success(
        `Sync OK: ${d.total_odoo} productos · ${d.nuevos} nuevos · ${d.actualizados} actualizados · ${d.duracion_segundos}s`,
        { id: toastId, duration: 6000 }
      );
      await fetchStats();
      await fetchList();
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error en sync';
      toast.error(msg, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      // mismo col: alterna dirección; si ya está en desc, vuelve a default
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortBy('default'); setSortDir('asc'); }
    } else {
      setSortBy(col);
      // Stock y fechas por defecto desc (mayor primero); resto asc
      setSortDir(col === 'stock' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleEdit = (item) => setEditing(item);

  const handleSaved = async () => {
    setEditing(null);
    await Promise.all([fetchStats(), fetchList()]);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4" data-testid="productos-odoo-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Productos Odoo</h1>
            <p className="text-sm text-muted-foreground">
              Clasifica los productos sincronizados desde Odoo con los catálogos de producción.
              {stats?.last_sync && <span className="ml-2">Último sync: {new Date(stats.last_sync).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            tabla="productos_odoo"
            label="Exportar"
            variant="outline"
            data-testid="export-productos-odoo"
          />
          <Button onClick={handleSync} disabled={syncing} data-testid="btn-sync-odoo">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync desde Odoo
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} color="" />
          <StatCard label="Pendientes" value={stats.pendiente} color="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" />
          <StatCard label="Parciales" value={stats.parcial} color="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900" />
          <StatCard label="Completos" value={stats.completo} color="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900" />
          <StatCard label="Excluidos" value={stats.excluido} color="bg-zinc-100 dark:bg-zinc-900/40 border-zinc-300 dark:border-zinc-800" />
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
            <TabsList>
              <TabsTrigger value="pendiente" data-testid="tab-pendientes">Pendientes</TabsTrigger>
              <TabsTrigger value="parcial" data-testid="tab-parciales">Parciales</TabsTrigger>
              <TabsTrigger value="completo" data-testid="tab-completos">Completos</TabsTrigger>
              <TabsTrigger value="excluido" data-testid="tab-excluidos">Excluidos</TabsTrigger>
              <TabsTrigger value="todos" data-testid="tab-todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SKU, nombre, marca…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="pl-8 h-9"
              />
            </div>
            <CascadeSelect label="marcas" items={marcas} availableSet={facets.marca}
              value={filtroMarca} onChange={v => { setFiltroMarca(v); setPage(1); }} width={180}/>
            <CascadeSelect label="tipos" items={tipos} availableSet={facets.tipo}
              value={filtroTipo} onChange={v => { setFiltroTipo(v); setPage(1); }} width={150}/>
            <CascadeSelect label="entalles" items={entalles} availableSet={facets.entalle}
              value={filtroEntalle} onChange={v => { setFiltroEntalle(v); setPage(1); }} width={150}/>
            <CascadeSelect label="telas" items={telasGenerales} availableSet={facets.tela}
              value={filtroTelaGeneral} onChange={v => { setFiltroTelaGeneral(v); setPage(1); }} width={170}/>
            <CascadeSelect label="hilos" items={hilos} availableSet={facets.hilo}
              value={filtroHilo} onChange={v => { setFiltroHilo(v); setPage(1); }} width={150}/>
            {(filtroMarca || filtroTipo || filtroTelaGeneral || filtroEntalle || filtroHilo) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs"
                onClick={() => { setFiltroMarca(''); setFiltroTipo(''); setFiltroTelaGeneral(''); setFiltroEntalle(''); setFiltroHilo(''); setPage(1); }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">SKU</TableHead>
                  <TableHead>
                    <SortHeader label="Producto" col="nombre" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  </TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entalle</TableHead>
                  <TableHead>Tela</TableHead>
                  <TableHead>Hilo</TableHead>
                  <TableHead>Línea Negocio</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Stock" col="stock" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
                  </TableHead>
                  <TableHead className="text-center w-[90px]" title="Colores Odoo mapeados al catálogo / total">Colores</TableHead>
                  <TableHead className="text-right w-[110px]">Costo</TableHead>
                  <TableHead>
                    <SortHeader label="Estado" col="estado" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  </TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Cargando…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Sin productos</TableCell></TableRow>
                ) : items.map(it => (
                  <TableRow key={it.id} data-testid={`producto-row-${it.id}`}>
                    <TableCell className="font-mono text-xs">{it.odoo_default_code || `#${it.odoo_template_id}`}</TableCell>
                    <TableCell className="text-sm font-medium">{it.odoo_nombre}</TableCell>
                    <TableCell>
                      {it.marca_nombre ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">{it.marca_nombre}</Badge>
                      ) : it.odoo_marca_texto ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">{it.odoo_marca_texto}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      {it.tipo_nombre ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">{it.tipo_nombre}</Badge>
                      ) : it.odoo_tipo_texto ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">{it.odoo_tipo_texto}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{it.entalle_nombre || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{it.tela_general_nombre || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{it.hilo_nombre || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {it.linea_negocio_nombre ? (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300">{it.linea_negocio_nombre}</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{parseFloat(it.odoo_stock_actual || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-center">
                      <ColoresBadge mapeados={it.colores_mapeados} total={it.colores_total} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {it.costo_manual != null ? (
                        <span className="text-emerald-700 dark:text-emerald-400">S/ {parseFloat(it.costo_manual).toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${ESTADO_COLORS[it.estado] || ''} capitalize`}>
                        {it.estado}
                        {it.excluido_motivo && <span className="ml-1 text-[9px] opacity-70">({it.excluido_motivo})</span>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(it)} title="Clasificar" data-testid={`btn-edit-${it.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">Página {page} de {totalPages} · {total} productos</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ProductoOdooModal
          producto={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

const SortHeader = ({ label, col, sortBy, sortDir, onClick, align = 'left' }) => {
  const active = sortBy === col;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onClick(col)}
      className={`inline-flex items-center gap-1 hover:text-primary transition-colors font-medium ${align === 'right' ? 'ml-auto' : ''} ${active ? 'text-primary' : ''}`}
      data-testid={`sort-${col}`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3" />
    </button>
  );
};

const StatCard = ({ label, value, color }) => (
  <Card className={color}>
    <CardContent className="py-4 text-center">
      <div className="text-2xl font-bold font-mono">{(value ?? 0).toLocaleString('es-PE')}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </CardContent>
  </Card>
);

// Badge de colores mapeados: muestra X/Y con icono según estado
function ColoresBadge({ mapeados, total }) {
  const m = parseInt(mapeados) || 0;
  const t = parseInt(total) || 0;
  if (t === 0) {
    return <span className="text-muted-foreground text-xs" title="Este producto no tiene variantes con color en Odoo">—</span>;
  }
  if (m === t) {
    // Completo
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-mono"
        title={`Los ${t} colores Odoo están mapeados al catálogo`}
      >
        <Check className="h-3 w-3" /> {m}/{t}
      </span>
    );
  }
  if (m === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-mono"
        title={`Ningún color mapeado todavía. Faltan los ${t} colores.`}
      >
        <Palette className="h-3 w-3" /> 0/{t}
      </span>
    );
  }
  // Parcial
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-mono"
      title={`${m} de ${t} colores mapeados. Faltan ${t - m}.`}
    >
      <Palette className="h-3 w-3" /> {m}/{t}
    </span>
  );
}

// Select "cascada" — deshabilita opciones que no aparecen en ningún producto
// con los filtros actuales. availableSet: Set<id> o null (= sin restricción).
const CascadeSelect = ({ label, items, availableSet, value, onChange, width = 160 }) => {
  const placeholder = `Todas${label.endsWith('s') ? ' las' : ' los'} ${label}`;
  return (
    <Select value={value || '_all'} onValueChange={v => onChange(v === '_all' ? '' : v)}>
      <SelectTrigger className="h-9 text-sm" style={{ width }}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_all">{placeholder}</SelectItem>
        {items.map(it => {
          const disabled = availableSet && !availableSet.has(it.id) && it.id !== value;
          return (
            <SelectItem key={it.id} value={it.id} disabled={disabled}>
              {it.nombre}
              {disabled && <span className="ml-2 text-[10px] text-muted-foreground">(0)</span>}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default ProductosOdoo;
