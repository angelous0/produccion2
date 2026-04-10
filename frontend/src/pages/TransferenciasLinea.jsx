import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  ArrowRightLeft,
  Plus,
  Search,
  Loader2,
  Check,
  X,
  Eye,
  ArrowRight,
  Package,
  Calculator,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { formatCurrency, formatNumber } from "../lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_BADGE = {
  BORRADOR: { variant: "outline", className: "border-yellow-500 text-yellow-600 bg-yellow-50" },
  CONFIRMADO: { variant: "outline", className: "border-green-500 text-green-600 bg-green-50" },
  CANCELADO: { variant: "outline", className: "border-red-500 text-red-600 bg-red-50" },
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

// ==================== COMPONENTE PRINCIPAL ====================

export const TransferenciasLinea = () => {
  const [transferencias, setTransferencias] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroSearch, setFiltroSearch] = useState("");
  const [lineas, setLineas] = useState([]);
  const [items, setItems] = useState([]);

  // Modales
  const [showCrear, setShowCrear] = useState(false);
  const [showDetalle, setShowDetalle] = useState(null);
  const [showConfirmar, setShowConfirmar] = useState(null);

  const limit = 20;

  const fetchLineas = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/lineas-negocio`);
      setLineas(data || []);
    } catch (e) { /* silenciar */ }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/inventario?all=true`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { /* silenciar */ }
  }, []);

  const fetchTransferencias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });
      if (filtroEstado) params.set("estado", filtroEstado);
      const { data } = await axios.get(`${API}/transferencias-linea?${params}`);
      setTransferencias(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error("Error al cargar transferencias");
    } finally {
      setLoading(false);
    }
  }, [page, filtroEstado]);

  useEffect(() => {
    fetchLineas();
    fetchItems();
  }, [fetchLineas, fetchItems]);

  useEffect(() => {
    fetchTransferencias();
  }, [fetchTransferencias]);

  const handleCrearExitoso = () => {
    setShowCrear(false);
    fetchTransferencias();
  };

  const handleConfirmar = async (id) => {
    try {
      await axios.post(`${API}/transferencias-linea/${id}/confirmar`);
      toast.success("Transferencia confirmada exitosamente");
      setShowConfirmar(null);
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al confirmar");
    }
  };

  const handleCancelar = async (id, motivo) => {
    try {
      await axios.post(`${API}/transferencias-linea/${id}/cancelar`, { motivo_cancelacion: motivo });
      toast.success("Transferencia cancelada");
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al cancelar");
    }
  };

  const totalPages = Math.ceil(total / limit);

  const filteredTransferencias = transferencias.filter((t) => {
    if (!filtroSearch) return true;
    const s = filtroSearch.toLowerCase();
    return (
      (t.codigo || "").toLowerCase().includes(s) ||
      (t.item_nombre || "").toLowerCase().includes(s) ||
      (t.item_codigo || "").toLowerCase().includes(s) ||
      (t.linea_origen_nombre || "").toLowerCase().includes(s) ||
      (t.linea_destino_nombre || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4" data-testid="transferencias-linea-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">
            Transferencias entre Lineas
          </h1>
          <p className="text-sm text-muted-foreground">
            Movimiento de stock entre lineas de negocio con trazabilidad FIFO
          </p>
        </div>
        <Button onClick={() => setShowCrear(true)} data-testid="btn-nueva-transferencia">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Transferencia
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-64">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Codigo, item, linea..."
              value={filtroSearch}
              onChange={(e) => setFiltroSearch(e.target.value)}
              className="pl-8"
              data-testid="input-search"
            />
          </div>
        </div>
        <div className="w-40">
          <Label className="text-xs">Estado</Label>
          <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v === "TODOS" ? "" : v); setPage(0); }}>
            <SelectTrigger data-testid="select-estado-filtro">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="BORRADOR">Borrador</SelectItem>
              <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-center"><ArrowRight className="h-4 w-4 mx-auto" /></TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredTransferencias.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No hay transferencias registradas
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransferencias.map((t) => {
                  const badge = ESTADO_BADGE[t.estado] || {};
                  return (
                    <TableRow key={t.id} data-testid={`row-${t.codigo}`}>
                      <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{t.item_nombre}</div>
                        <div className="text-xs text-muted-foreground">{t.item_codigo}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t.linea_origen_nombre}</div>
                        <div className="text-xs text-muted-foreground">{t.linea_origen_codigo}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <ArrowRight className="h-4 w-4 mx-auto text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{t.linea_destino_nombre}</div>
                        <div className="text-xs text-muted-foreground">{t.linea_destino_codigo}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(t.cantidad)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {t.costo_total_transferido > 0 ? formatCurrency(t.costo_total_transferido) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={badge.className} variant={badge.variant}>{t.estado}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(t.fecha_creacion)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 justify-center">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setShowDetalle(t.id)}
                            data-testid={`btn-ver-${t.codigo}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {t.estado === "BORRADOR" && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                              onClick={() => setShowConfirmar(t)}
                              data-testid={`btn-confirmar-${t.codigo}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} transferencia(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm flex items-center">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal Crear */}
      {showCrear && (
        <CrearTransferenciaModal
          open={showCrear}
          onClose={() => setShowCrear(false)}
          onSuccess={handleCrearExitoso}
          lineas={lineas}
          items={items}
        />
      )}

      {/* Modal Detalle */}
      {showDetalle && (
        <DetalleTransferenciaModal
          open={!!showDetalle}
          onClose={() => setShowDetalle(null)}
          transferenciaId={showDetalle}
          onConfirmar={(id) => { setShowDetalle(null); setShowConfirmar({ id }); }}
          onCancelar={handleCancelar}
        />
      )}

      {/* Dialog Confirmar */}
      {showConfirmar && (
        <ConfirmarDialog
          open={!!showConfirmar}
          transferencia={showConfirmar}
          onClose={() => setShowConfirmar(null)}
          onConfirmar={handleConfirmar}
        />
      )}
    </div>
  );
};

// ==================== MODAL CREAR ====================

const CrearTransferenciaModal = ({ open, onClose, onSuccess, lineas, items }) => {
  const [form, setForm] = useState({
    item_id: "",
    linea_origen_id: "",
    linea_destino_id: "",
    cantidad: "",
    motivo: "",
    observaciones: "",
    referencia_externa: "",
  });
  const [stockPorLinea, setStockPorLinea] = useState(null);
  const [estimacion, setEstimacion] = useState(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingEstimacion, setLoadingEstimacion] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cuando cambia el item, cargar stock por linea
  useEffect(() => {
    if (!form.item_id) {
      setStockPorLinea(null);
      setEstimacion(null);
      return;
    }
    const fetchStock = async () => {
      setLoadingStock(true);
      try {
        const { data } = await axios.get(`${API}/transferencias-linea/stock-por-linea/${form.item_id}`);
        setStockPorLinea(data);
      } catch (e) {
        setStockPorLinea(null);
      } finally {
        setLoadingStock(false);
      }
    };
    fetchStock();
  }, [form.item_id]);

  // Reset estimacion cuando cambian parametros clave
  useEffect(() => {
    setEstimacion(null);
  }, [form.item_id, form.linea_origen_id, form.cantidad]);

  const handleEstimar = async () => {
    if (!form.item_id || !form.linea_origen_id || !form.cantidad) return;
    setLoadingEstimacion(true);
    try {
      const params = new URLSearchParams({
        item_id: form.item_id,
        linea_origen_id: form.linea_origen_id,
        cantidad: form.cantidad,
      });
      const { data } = await axios.get(`${API}/transferencias-linea/estimar-costo?${params}`);
      setEstimacion(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al estimar costo");
    } finally {
      setLoadingEstimacion(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.item_id || !form.linea_origen_id || !form.linea_destino_id || !form.cantidad) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    if (form.linea_origen_id === form.linea_destino_id) {
      toast.error("La linea origen y destino no pueden ser la misma");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/transferencias-linea`, {
        item_id: form.item_id,
        linea_origen_id: parseInt(form.linea_origen_id),
        linea_destino_id: parseInt(form.linea_destino_id),
        cantidad: parseFloat(form.cantidad),
        motivo: form.motivo,
        observaciones: form.observaciones,
        referencia_externa: form.referencia_externa || null,
      });
      toast.success("Borrador creado exitosamente");
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al crear transferencia");
    } finally {
      setSaving(false);
    }
  };

  const stockOrigen = stockPorLinea?.lineas?.find(
    (l) => String(l.linea_negocio_id) === String(form.linea_origen_id)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="modal-crear-transferencia">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Nueva Transferencia entre Lineas
          </DialogTitle>
          <DialogDescription>
            Crea un borrador que luego podras confirmar o cancelar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item */}
          <div>
            <Label>Item a transferir *</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v, linea_origen_id: "", linea_destino_id: "" })}>
              <SelectTrigger data-testid="select-item">
                <SelectValue placeholder="Seleccionar item..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.codigo} - {i.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stock por linea del item */}
          {loadingStock && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando stock por linea...
            </div>
          )}
          {stockPorLinea && stockPorLinea.lineas?.length > 0 && (
            <Card className="bg-muted/30">
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Stock por Linea - {stockPorLinea.item_nombre} ({stockPorLinea.unidad_medida})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Linea</TableHead>
                      <TableHead className="text-xs text-right">Bruto</TableHead>
                      <TableHead className="text-xs text-right">Reservado</TableHead>
                      <TableHead className="text-xs text-right font-bold">Disponible</TableHead>
                      <TableHead className="text-xs text-right">Valorizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockPorLinea.lineas.map((l) => (
                      <TableRow key={l.linea_negocio_id || "null"}>
                        <TableCell className="text-xs">{l.linea_nombre}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatNumber(l.stock_bruto)}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-orange-600">{formatNumber(l.reservado)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold">{formatNumber(l.stock_disponible)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(l.valorizado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {stockPorLinea && stockPorLinea.lineas?.length === 0 && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Este item no tiene stock en ninguna linea
            </div>
          )}

          {/* Linea Origen y Destino */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Linea Origen *</Label>
              <Select value={form.linea_origen_id} onValueChange={(v) => setForm({ ...form, linea_origen_id: v })}>
                <SelectTrigger data-testid="select-linea-origen">
                  <SelectValue placeholder="Origen..." />
                </SelectTrigger>
                <SelectContent>
                  {lineas.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.codigo} - {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stockOrigen && (
                <p className="text-xs mt-1 text-muted-foreground">
                  Disponible: <span className="font-bold text-foreground">{formatNumber(stockOrigen.stock_disponible)}</span>
                  {stockOrigen.reservado > 0 && (
                    <span className="text-orange-600"> ({formatNumber(stockOrigen.reservado)} reservado)</span>
                  )}
                </p>
              )}
            </div>
            <div>
              <Label>Linea Destino *</Label>
              <Select value={form.linea_destino_id} onValueChange={(v) => setForm({ ...form, linea_destino_id: v })}>
                <SelectTrigger data-testid="select-linea-destino">
                  <SelectValue placeholder="Destino..." />
                </SelectTrigger>
                <SelectContent>
                  {lineas.filter((l) => String(l.id) !== form.linea_origen_id).map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.codigo} - {l.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cantidad */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cantidad *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                placeholder="0.00"
                data-testid="input-cantidad"
              />
              {stockOrigen && parseFloat(form.cantidad || 0) > stockOrigen.stock_disponible && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Excede el stock disponible ({formatNumber(stockOrigen.stock_disponible)})
                </p>
              )}
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleEstimar}
                disabled={!form.item_id || !form.linea_origen_id || !form.cantidad || loadingEstimacion}
                data-testid="btn-estimar-costo"
              >
                {loadingEstimacion ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                Estimar Costo FIFO
              </Button>
            </div>
          </div>

          {/* Estimacion FIFO */}
          {estimacion && (
            <Card className={estimacion.stock_suficiente ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Estimacion de Costo FIFO</span>
                  {estimacion.stock_suficiente ? (
                    <Badge className="bg-green-100 text-green-700 border-green-300">Stock suficiente</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700 border-red-300">Stock insuficiente</Badge>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Capa FIFO</TableHead>
                      <TableHead className="text-xs">Proveedor</TableHead>
                      <TableHead className="text-xs text-right">Disponible</TableHead>
                      <TableHead className="text-xs text-right">A consumir</TableHead>
                      <TableHead className="text-xs text-right">Costo Unit.</TableHead>
                      <TableHead className="text-xs text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estimacion.capas.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{formatDate(c.fecha_ingreso)}</TableCell>
                        <TableCell className="text-xs">{c.proveedor || "-"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatNumber(c.cantidad_disponible)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold">{formatNumber(c.cantidad_a_consumir)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(c.costo_unitario)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(c.costo_parcial)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={3} className="text-xs font-bold">TOTAL</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{formatNumber(estimacion.cantidad_cubierta)}</TableCell>
                      <TableCell />
                      <TableCell className="text-xs text-right font-mono font-bold">{formatCurrency(estimacion.costo_total_estimado)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Motivo y Observaciones */}
          <div>
            <Label>Motivo</Label>
            <Input
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Razon de la transferencia..."
              data-testid="input-motivo"
            />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Input
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              placeholder="Notas adicionales..."
            />
          </div>
          <div>
            <Label>Referencia Externa (opcional)</Label>
            <Input
              value={form.referencia_externa}
              onChange={(e) => setForm({ ...form, referencia_externa: e.target.value })}
              placeholder="Para integracion con Finanzas..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.item_id || !form.linea_origen_id || !form.linea_destino_id || !form.cantidad}
            data-testid="btn-crear-borrador"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Crear Borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ==================== MODAL DETALLE ====================

const DetalleTransferenciaModal = ({ open, onClose, transferenciaId, onConfirmar, onCancelar }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [showCancelarForm, setShowCancelarForm] = useState(false);

  useEffect(() => {
    const fetchDetalle = async () => {
      setLoading(true);
      try {
        const { data: d } = await axios.get(`${API}/transferencias-linea/${transferenciaId}`);
        setData(d);
      } catch (e) {
        toast.error("Error al cargar detalle");
        onClose();
      } finally {
        setLoading(false);
      }
    };
    if (transferenciaId) fetchDetalle();
  }, [transferenciaId, onClose]);

  if (loading || !data) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const badge = ESTADO_BADGE[data.estado] || {};

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-detalle-transferencia">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ArrowRightLeft className="h-5 w-5" />
            {data.codigo}
            <Badge className={badge.className} variant={badge.variant}>{data.estado}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info general */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoField label="Item" value={`${data.item_codigo} - ${data.item_nombre}`} />
            <InfoField label="Unidad" value={data.unidad_medida} />
            <InfoField label="Cantidad" value={formatNumber(data.cantidad)} bold />
            <InfoField label="Linea Origen" value={`${data.linea_origen_codigo} - ${data.linea_origen_nombre}`} />
            <InfoField label="Linea Destino" value={`${data.linea_destino_codigo} - ${data.linea_destino_nombre}`} />
            <InfoField label="Costo Total" value={formatCurrency(data.costo_total_transferido)} bold />
            <InfoField label="Creado por" value={data.creado_por || "-"} />
            <InfoField label="Fecha Creacion" value={formatDate(data.fecha_creacion)} />
            {data.confirmado_por && <InfoField label="Confirmado por" value={data.confirmado_por} />}
            {data.fecha_confirmacion && <InfoField label="Fecha Confirmacion" value={formatDate(data.fecha_confirmacion)} />}
            {data.cancelado_por && <InfoField label="Cancelado por" value={data.cancelado_por} />}
            {data.cancelado_at && <InfoField label="Fecha Cancelacion" value={formatDate(data.cancelado_at)} />}
            {data.motivo && <InfoField label="Motivo" value={data.motivo} className="col-span-2" />}
            {data.observaciones && <InfoField label="Observaciones" value={data.observaciones} className="col-span-2" />}
            {data.motivo_cancelacion && <InfoField label="Motivo Cancelacion" value={data.motivo_cancelacion} className="col-span-2" />}
            {data.referencia_externa && <InfoField label="Ref. Externa" value={data.referencia_externa} />}
          </div>

          {/* Detalle FIFO */}
          {data.detalles && data.detalles.length > 0 && (
            <Card>
              <CardHeader className="py-2 px-4">
                <CardTitle className="text-sm">Trazabilidad FIFO: Capas Consumidas</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ingreso Origen</TableHead>
                      <TableHead className="text-xs">Proveedor</TableHead>
                      <TableHead className="text-xs text-right">Cantidad</TableHead>
                      <TableHead className="text-xs text-right">Costo Unit.</TableHead>
                      <TableHead className="text-xs text-right">Subtotal</TableHead>
                      <TableHead className="text-xs">Ingreso Destino</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.detalles.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{(d.ingreso_origen_id || "").substring(0, 8)}...</TableCell>
                        <TableCell className="text-xs">{d.proveedor_origen || "-"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatNumber(d.cantidad)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(d.costo_unitario)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-bold">{formatCurrency(d.costo_parcial)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {d.ingreso_destino_id ? `${d.ingreso_destino_id.substring(0, 8)}...` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Acciones para BORRADOR */}
          {data.estado === "BORRADOR" && !showCancelarForm && (
            <div className="flex gap-3 justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowCancelarForm(true)}
                data-testid="btn-cancelar-borrador"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar Borrador
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => onConfirmar(data.id)}
                data-testid="btn-confirmar-desde-detalle"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar Transferencia
              </Button>
            </div>
          )}

          {/* Form cancelacion */}
          {showCancelarForm && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="py-3 px-4 space-y-3">
                <Label>Motivo de cancelacion</Label>
                <Input
                  value={motivoCancelacion}
                  onChange={(e) => setMotivoCancelacion(e.target.value)}
                  placeholder="Indique el motivo..."
                  data-testid="input-motivo-cancelacion"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowCancelarForm(false)}>Volver</Button>
                  <Button
                    variant="destructive" size="sm"
                    onClick={() => onCancelar(data.id, motivoCancelacion)}
                    data-testid="btn-confirmar-cancelacion"
                  >
                    Confirmar Cancelacion
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== DIALOG CONFIRMAR ====================

const ConfirmarDialog = ({ open, transferencia, onClose, onConfirmar }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirmar = async () => {
    setLoading(true);
    await onConfirmar(transferencia.id);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-confirmar-transferencia">
        <DialogHeader>
          <DialogTitle>Confirmar Transferencia</DialogTitle>
          <DialogDescription>
            Esta accion consumira las capas FIFO de la linea origen y creara nuevos ingresos en la linea destino.
            Esta operacion no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm">
            <strong>Codigo:</strong> {transferencia.codigo || transferencia.id?.substring(0, 8)}
          </p>
          {transferencia.item_nombre && (
            <p className="text-sm"><strong>Item:</strong> {transferencia.item_nombre}</p>
          )}
          {transferencia.cantidad && (
            <p className="text-sm"><strong>Cantidad:</strong> {formatNumber(transferencia.cantidad)}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={handleConfirmar}
            disabled={loading}
            data-testid="btn-confirmar-final"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ==================== HELPERS UI ====================

const InfoField = ({ label, value, bold, className }) => (
  <div className={className}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-sm ${bold ? "font-bold" : ""}`}>{value || "-"}</p>
  </div>
);
