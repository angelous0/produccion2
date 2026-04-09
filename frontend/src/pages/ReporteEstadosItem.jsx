import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { ExportPDFButton } from '../components/ExportPDFButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  ArrowLeft,
  Filter,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLS_BASE = [
  { label: 'Para Corte', key: 'para_corte' },
  { label: 'Para Costura', key: 'para_costura' },
  // La columna en data es "para_atanque" (mapeada desde el estado "Para Atraque"/"Para Atanque")
  { label: 'Para Atraque', key: 'para_atanque' },
  { label: 'Para Lavandería', key: 'para_lavanderia' },
  { label: 'Acabado', key: 'acabado' },
  { label: 'Almacén PT', key: 'almacen_pt' },
];

export const ReporteEstadosItem = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reporte, setReporte] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEstado, setDetailEstado] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailOffset, setDetailOffset] = useState(0);
  const DETAIL_LIMIT = 50;

  // Maestros
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [entalles, setEntalles] = useState([]);
  const [telas, setTelas] = useState([]);
  const [hilosEspecificos, setHilosEspecificos] = useState([]);

  // Filtros
  const [filtros, setFiltros] = useState({
    search: '',
    marca_id: '',
    tipo_id: '',
    entalle_id: '',
    tela_id: '',
    hilo_especifico_id: '',
    prioridad: 'all', // all | urgente | normal
    include_tienda: false,
  });

  const [selectedKey, setSelectedKey] = useState('');

  const columns = useMemo(() => {
    const cols = [...COLS_BASE];
    if (filtros.include_tienda) cols.push({ label: 'Tienda', key: 'tienda' });
    return cols;
  }, [filtros.include_tienda]);

  const pdfColumns = useMemo(() => {
    const base = [
      { header: 'Item', key: 'item' },
      { header: 'Hilo', key: 'hilo' },
      ...columns.map((c) => ({ header: c.label, key: c.key })),
      { header: 'Total', key: 'total' },
    ];
    return base;
  }, [columns]);

  const fetchMaestros = async () => {
    try {
      const [marcasRes, tiposRes, entallesRes, telasRes, hilosRes] = await Promise.all([
        axios.get(`${API}/marcas`),
        axios.get(`${API}/tipos`),
        axios.get(`${API}/entalles`),
        axios.get(`${API}/telas`),
        axios.get(`${API}/hilos-especificos`),
      ]);
      setMarcas(marcasRes.data);
      setTipos(tiposRes.data);
      setEntalles(entallesRes.data);
      setTelas(telasRes.data);
      setHilosEspecificos(hilosRes.data);
    } catch (e) {
      // No bloquear el reporte si falla algún maestro
      console.error('Error cargando maestros:', e);
    }
  };

  const buildParams = () => {
    const params = new URLSearchParams();
    if (filtros.search) params.append('search', filtros.search);
    if (filtros.marca_id) params.append('marca_id', filtros.marca_id);
    if (filtros.tipo_id) params.append('tipo_id', filtros.tipo_id);
    if (filtros.entalle_id) params.append('entalle_id', filtros.entalle_id);
    if (filtros.tela_id) params.append('tela_id', filtros.tela_id);
    if (filtros.hilo_especifico_id) params.append('hilo_especifico_id', filtros.hilo_especifico_id);
    if (filtros.prioridad && filtros.prioridad !== 'all') params.append('prioridad', filtros.prioridad);
    if (filtros.include_tienda) params.append('include_tienda', 'true');
    return params;
  };

  const fetchReporte = async () => {
    setLoading(true);
    try {
      const params = buildParams();
      const res = await axios.get(`${API}/reportes/estados-item?${params.toString()}`);
      setReporte(res.data);
      setSelectedKey('');
    } catch (e) {
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalle = async ({ estado, offset = 0 } = {}) => {
    if (!selectedRow) return;
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('item', selectedRow.item);
      params.append('hilo', selectedRow.hilo || 'Sin Hilo');
      params.append('estado', estado);
      params.append('include_tienda', filtros.include_tienda ? 'true' : 'false');
      params.append('limit', String(DETAIL_LIMIT));
      params.append('offset', String(offset));

      const res = await axios.get(`${API}/reportes/estados-item/detalle?${params.toString()}`);
      setDetailData(res.data);
    } catch (e) {
      toast.error('Error al cargar detalle');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchMaestros();
    fetchReporte();
  }, []);

  const handleLimpiar = () => {
    setFiltros({
      search: '',
      marca_id: '',
      tipo_id: '',
      entalle_id: '',
      tela_id: '',
      hilo_especifico_id: '',
      prioridad: 'all',
      include_tienda: false,
    });
    setTimeout(fetchReporte, 0);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      const response = await axios.get(`${API}/reportes/estados-item/export?${params.toString()}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reporte_estados_item_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Archivo exportado correctamente');
    } catch (e) {
      toast.error('Error al exportar Excel');
    } finally {
      setExporting(false);
    }
  };

  const selectedRow = useMemo(() => {
    if (!selectedKey || !reporte?.rows) return null;
    return reporte.rows.find((r) => `${r.item}__${r.hilo}` === selectedKey) || null;
  }, [selectedKey, reporte]);

  const estadosParaDetalle = useMemo(() => {
    if (!selectedRow) return [];
    return columns
      .map((c) => ({
        label: c.label,
        key: c.key,
        value: selectedRow[c.key] || 0,
      }))
      .filter((x) => x.value > 0);
  }, [selectedRow, columns]);

  const totals = useMemo(() => {
    const rows = reporte?.rows || [];
    const t = { total: 0 };
    columns.forEach((c) => {
      t[c.key] = 0;
    });
    rows.forEach((r) => {
      columns.forEach((c) => {
        t[c.key] += r[c.key] || 0;
      });
      t.total += r.total || 0;
    });
    return t;
  }, [reporte, columns]);

  const pdfSummary = useMemo(() => {
    return {
      'Filas': (reporte?.rows || []).length,
      'Total registros': totals.total,
      'Incluye Tienda': filtros.include_tienda ? 'Sí' : 'No',
      'Prioridad': filtros.prioridad === 'all' ? 'Todas' : filtros.prioridad === 'urgente' ? 'Urgente' : 'Normal',
    };
  }, [reporte, totals, filtros.include_tienda, filtros.prioridad]);

  const pdfData = useMemo(() => {
    return (reporte?.rows || []).map((r) => ({
      ...r,
      hilo: r.hilo || '-',
    }));
  }, [reporte]);

  return (
    <div className="space-y-6" data-testid="reporte-estados-item-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reporte: Item - Estados</h2>
          <p className="text-muted-foreground">
            Estado actual (conteo de registros por estado) agrupado por Item e Hilo
          </p>
          {reporte?.updated_at && (
            <p className="text-xs text-muted-foreground mt-1">Actualización: {reporte.updated_at}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={exporting || (reporte?.rows || []).length === 0}
            data-testid="btn-export-excel-estados-item"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
          </Button>

          <ExportPDFButton
            title="Reporte: Item - Estados"
            columns={pdfColumns}
            data={pdfData}
            filename="reporte_estados_item"
            summary={pdfSummary}
            label="Exportar PDF"
          />
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Item (buscar)</Label>
              <div className="relative">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  className="pl-9"
                  placeholder="Marca - Tipo - Entalle - Tela"
                  value={filtros.search}
                  onChange={(e) => setFiltros({ ...filtros, search: e.target.value })}
                  data-testid="filtro-item-search"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Marca</Label>
              <Select value={filtros.marca_id || 'all'} onValueChange={(v) => setFiltros({ ...filtros, marca_id: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {marcas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={filtros.tipo_id || 'all'} onValueChange={(v) => setFiltros({ ...filtros, tipo_id: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entalle</Label>
              <Select value={filtros.entalle_id || 'all'} onValueChange={(v) => setFiltros({ ...filtros, entalle_id: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {entalles.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tela</Label>
              <Select value={filtros.tela_id || 'all'} onValueChange={(v) => setFiltros({ ...filtros, tela_id: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {telas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hilo</Label>
              <Select
                value={filtros.hilo_especifico_id || 'all'}
                onValueChange={(v) => setFiltros({ ...filtros, hilo_especifico_id: v === 'all' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {hilosEspecificos.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select
                value={filtros.prioridad}
                onValueChange={(v) => setFiltros({ ...filtros, prioridad: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mostrar Tienda</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={filtros.include_tienda}
                  onCheckedChange={(checked) => setFiltros({ ...filtros, include_tienda: Boolean(checked) })}
                  data-testid="toggle-include-tienda"
                />
                <span className="text-sm text-muted-foreground">{filtros.include_tienda ? 'Sí' : 'No'}</span>
              </div>
            </div>

            <div className="space-y-2 flex items-end gap-2 md:col-span-2">
              <Button onClick={fetchReporte} className="flex-1" data-testid="btn-filtrar-estados-item">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
              <Button variant="outline" onClick={handleLimpiar}>
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando...
          </CardContent>
        </Card>
      ) : (reporte?.rows || []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No hay datos para mostrar</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">ITEM - ESTADOS</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedRow || estadosParaDetalle.length === 0}
                onClick={() => {
                  const first = estadosParaDetalle[0];
                  setDetailEstado(first?.label || '');
                  setDetailOffset(0);
                  setDetailOpen(true);
                  fetchDetalle({ estado: first?.label || '', offset: 0 });
                }}
                data-testid="btn-ver-detalle"
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver detalles
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Hilo</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.key} className="text-right whitespace-nowrap">{c.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reporte.rows.map((r) => {
                  const key = `${r.item}__${r.hilo}`;
                  const selected = key === selectedKey;
                  return (
                    <TableRow
                      key={key}
                      className={selected ? 'bg-muted/50' : ''}
                      onClick={() => setSelectedKey(selected ? '' : key)}
                      data-testid="row-estados-item"
                    >
                      <TableCell className="min-w-[420px] font-medium">{r.item}</TableCell>
                      <TableCell className="min-w-[160px]">{r.hilo || '-'}</TableCell>
                      {columns.map((c) => (
                        <TableCell key={c.key} className="text-right">{r[c.key] || 0}</TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">{r.total || 0}</TableCell>
                    </TableRow>
                  );
                })}

                <TableRow>
                  <TableCell className="font-semibold">TOTAL</TableCell>
                  <TableCell />
                  {columns.map((c) => (
                    <TableCell key={c.key} className="text-right font-semibold">{totals[c.key] || 0}</TableCell>
                  ))}
                  <TableCell className="text-right font-bold">{totals.total || 0}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      {/* Modal detalle */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Detalle por estado</DialogTitle>
            <DialogDescription>
              Selecciona el estado para ver los registros que componen el conteo de la fila seleccionada (Item + Hilo).
            </DialogDescription>
          </DialogHeader>

          {!selectedRow ? (
            <div className="text-sm text-muted-foreground">Selecciona una fila primero.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">Item</div>
                  <div className="text-sm font-medium">{selectedRow.item}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Hilo</div>
                  <div className="text-sm font-medium">{selectedRow.hilo || 'Sin Hilo'}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={detailEstado || 'none'}
                  onValueChange={(v) => {
                    const estado = v === 'none' ? '' : v;
                    setDetailEstado(estado);
                    setDetailOffset(0);
                    if (estado) fetchDetalle({ estado, offset: 0 });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    {estadosParaDetalle.length === 0 ? (
                      <SelectItem value="none">Sin estados con registros</SelectItem>
                    ) : (
                      estadosParaDetalle.map((e) => (
                        <SelectItem key={e.key} value={e.label}>
                          {e.label} ({e.value})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Registros</CardTitle>
                </CardHeader>
                <CardContent className="overflow-auto">
                  {detailLoading ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Cargando detalle...
                    </div>
                  ) : (detailData?.rows || []).length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">No hay registros</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>N° Corte</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Urgente</TableHead>
                          <TableHead>Fecha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.n_corte || '-'}</TableCell>
                            <TableCell>{r.modelo_nombre || '-'}</TableCell>
                            <TableCell>{r.estado || '-'}</TableCell>
                            <TableCell>{r.urgente ? 'Sí' : 'No'}</TableCell>
                            <TableCell>{r.fecha_creacion || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <div className="flex items-center justify-between pt-4">
                    <div className="text-xs text-muted-foreground">
                      Total: {detailData?.total ?? 0}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detailLoading || detailOffset <= 0}
                        onClick={() => {
                          const nextOffset = Math.max(0, detailOffset - DETAIL_LIMIT);
                          setDetailOffset(nextOffset);
                          fetchDetalle({ estado: detailEstado, offset: nextOffset });
                        }}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          detailLoading ||
                          !detailData?.total ||
                          detailOffset + DETAIL_LIMIT >= (detailData?.total || 0)
                        }
                        onClick={() => {
                          const nextOffset = detailOffset + DETAIL_LIMIT;
                          setDetailOffset(nextOffset);
                          fetchDetalle({ estado: detailEstado, offset: nextOffset });
                        }}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ReporteEstadosItem;
