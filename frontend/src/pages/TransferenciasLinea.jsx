import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Separator } from "../components/ui/separator";
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
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
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
  Search,
  Loader2,
  Check,
  X,
  Eye,
  ArrowRight,
  ArrowLeftRight,
  Package,
  Calculator,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Send,
  Trash2,
  ChevronsUpDown,
} from "lucide-react";

import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { formatDate } from "../lib/dateUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ESTADO_BADGE = {
  BORRADOR: { variant: "outline", className: "border-yellow-500 text-yellow-600 bg-yellow-50" },
  CONFIRMADO: { variant: "outline", className: "border-green-500 text-green-600 bg-green-50" },
  CANCELADO: { variant: "outline", className: "border-red-500 text-red-600 bg-red-50" },
  REVERSADO: { variant: "outline", className: "border-orange-500 text-orange-600 bg-orange-50" },
};

// ==================== COMPONENTE PRINCIPAL ====================

export const TransferenciasLinea = () => {
  // --- Data ---
  const [lineas, setLineas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroSearch, setFiltroSearch] = useState("");

  // --- Form state (inline, no modal) ---
  const [lineaOrigenId, setLineaOrigenId] = useState("");
  const [lineaDestinoId, setLineaDestinoId] = useState("");
  const [itemsOrigen, setItemsOrigen] = useState([]);
  const [itemsDestino, setItemsDestino] = useState([]);          // items "compatibles" en línea destino
  const [selectedItemId, setSelectedItemId] = useState("");      // item origen
  const [selectedItemDestinoId, setSelectedItemDestinoId] = useState(""); // item destino
  const [openItemOrigenPicker, setOpenItemOrigenPicker] = useState(false);
  const [openItemDestinoPicker, setOpenItemDestinoPicker] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // --- Loading states ---
  const [loadingItemsOrigen, setLoadingItemsOrigen] = useState(false);
  const [loadingItemsDestino, setLoadingItemsDestino] = useState(false);
  const [loadingEstimacion, setLoadingEstimacion] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Derived data ---
  const [estimacion, setEstimacion] = useState(null);

  // --- Modals ---
  const [showDetalle, setShowDetalle] = useState(null);
  const [showConfirmar, setShowConfirmar] = useState(null);

  const limit = 20;

  // ---- Fetch lineas ----
  const fetchLineas = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/lineas-negocio`);
      setLineas(data || []);
    } catch (e) { /* silenciar */ }
  }, []);

  // ---- Fetch transferencias (historial) ----
  const fetchTransferencias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
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

  useEffect(() => { fetchLineas(); }, [fetchLineas]);
  useEffect(() => { fetchTransferencias(); }, [fetchTransferencias]);

  // ---- Fetch items con stock en linea origen ----
  useEffect(() => {
    if (!lineaOrigenId) {
      setItemsOrigen([]);
      setSelectedItemId("");
      setEstimacion(null);
      return;
    }
    const fetchItems = async () => {
      setLoadingItemsOrigen(true);
      setSelectedItemId("");
      setEstimacion(null);
      try {
        const { data } = await axios.get(`${API}/transferencias-linea/items-con-stock?linea_negocio_id=${lineaOrigenId}`);
        setItemsOrigen(data || []);
      } catch (e) {
        setItemsOrigen([]);
      } finally {
        setLoadingItemsOrigen(false);
      }
    };
    fetchItems();
  }, [lineaOrigenId]);

  const selectedItem = itemsOrigen.find(i => i.id === selectedItemId);

  // ---- Cargar items compatibles en línea destino cuando cambia (línea destino o item origen) ----
  // El backend filtra por unidad_medida + categoria del item origen para mostrar
  // solo los compatibles. Si la lista viene vacía, mostramos un banner para que
  // el usuario cree el item en /inventario.
  useEffect(() => {
    if (!lineaDestinoId || !selectedItem) {
      setItemsDestino([]);
      setSelectedItemDestinoId("");
      return;
    }
    const fetchDestino = async () => {
      setLoadingItemsDestino(true);
      setSelectedItemDestinoId("");
      try {
        const params = new URLSearchParams({ linea_negocio_id: lineaDestinoId });
        if (selectedItem.unidad_medida) params.set("unidad_medida", selectedItem.unidad_medida);
        if (selectedItem.categoria) params.set("categoria", selectedItem.categoria);
        const { data } = await axios.get(`${API}/transferencias-linea/items-en-linea?${params}`);
        // Excluir el mismo item origen por si aparece (no debería, pero defensivo)
        const items = (data || []).filter(i => i.id !== selectedItem.id);
        setItemsDestino(items);
      } catch (e) {
        setItemsDestino([]);
      } finally {
        setLoadingItemsDestino(false);
      }
    };
    fetchDestino();
    // Listamos las props específicas usadas para evitar re-fetches cuando solo
    // cambia la referencia del objeto. ESLint sugiere incluir `selectedItem`
    // entero pero eso causaría loops innecesarios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineaDestinoId, selectedItem?.id, selectedItem?.unidad_medida, selectedItem?.categoria]);

  // ---- Reset estimacion on key changes ----
  useEffect(() => { setEstimacion(null); }, [selectedItemId, lineaOrigenId, cantidad]);

  const selectedItemDestino = itemsDestino.find(i => i.id === selectedItemDestinoId);

  // ---- Estimar costo FIFO ----
  const handleEstimar = async () => {
    if (!selectedItemId || !lineaOrigenId || !cantidad) return;
    setLoadingEstimacion(true);
    try {
      const params = new URLSearchParams({
        item_id: selectedItemId,
        linea_origen_id: lineaOrigenId,
        cantidad,
      });
      const { data } = await axios.get(`${API}/transferencias-linea/estimar-costo?${params}`);
      setEstimacion(data);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al estimar costo");
    } finally {
      setLoadingEstimacion(false);
    }
  };

  // ---- Crear transferencia ----
  const handleCrear = async () => {
    if (!selectedItemId || !selectedItemDestinoId || !lineaOrigenId || !lineaDestinoId || !cantidad) {
      toast.error("Completa todos los campos obligatorios (incluido el item destino)");
      return;
    }
    if (lineaOrigenId === lineaDestinoId) {
      toast.error("La linea origen y destino no pueden ser la misma");
      return;
    }
    const cantidadNum = parseFloat(cantidad);
    if (selectedItem && cantidadNum > selectedItem.stock_disponible) {
      toast.error(`Stock insuficiente. Disponible: ${formatNumber(selectedItem.stock_disponible)}`);
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/transferencias-linea`, {
        item_origen_id: selectedItemId,
        item_destino_id: selectedItemDestinoId,
        linea_origen_id: parseInt(lineaOrigenId),
        linea_destino_id: parseInt(lineaDestinoId),
        cantidad: cantidadNum,
        motivo,
        observaciones,
      });
      toast.success("Borrador creado exitosamente");
      resetForm();
      fetchTransferencias();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al crear transferencia");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setLineaOrigenId("");
    setLineaDestinoId("");
    setSelectedItemId("");
    setSelectedItemDestinoId("");
    setCantidad("");
    setMotivo("");
    setObservaciones("");
    setEstimacion(null);
    setItemsOrigen([]);
    setItemsDestino([]);
  };

  const handleConfirmar = async (id) => {
    try {
      await axios.post(`${API}/transferencias-linea/${id}/confirmar`);
      toast.success("Transferencia confirmada exitosamente");
      setShowConfirmar(null);
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al confirmar");
    }
  };

  const handleCancelar = async (id, motivoCancelacion) => {
    try {
      await axios.post(`${API}/transferencias-linea/${id}/cancelar`, { motivo_cancelacion: motivoCancelacion });
      toast.success("Transferencia cancelada");
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al cancelar");
    }
  };

  const handleReversar = async (id, codigo) => {
    const motivo = window.prompt(
      `Reversar transferencia ${codigo}?\n\nEsto devolverá el stock a la línea origen.\n\nMotivo del reverso:`
    );
    if (motivo === null) return; // canceló el prompt
    try {
      const { data } = await axios.post(`${API}/transferencias-linea/${id}/reversar`, {
        motivo_reverso: motivo || "",
      });
      toast.success(data.message || "Transferencia reversada");
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al reversar");
    }
  };

  const handleEliminar = async (id, codigo, estado) => {
    if (!window.confirm(
      `¿Eliminar definitivamente la transferencia ${codigo}?\n\n` +
      `Estado actual: ${estado}\n\n` +
      `Esta acción borra todos los registros relacionados (detalles, ingresos, salidas, contabilidad). ` +
      `No se puede deshacer.`
    )) return;
    try {
      const { data } = await axios.delete(`${API}/transferencias-linea/${id}`);
      toast.success(data.message || "Transferencia eliminada");
      setShowDetalle(null);
      fetchTransferencias();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : "Error al eliminar");
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

  const cantidadExcede = selectedItem && parseFloat(cantidad || 0) > selectedItem.stock_disponible;
  const canSubmit = selectedItemId && selectedItemDestinoId && lineaOrigenId && lineaDestinoId
    && cantidad && parseFloat(cantidad) > 0 && lineaOrigenId !== lineaDestinoId && !cantidadExcede;
  const cantidadNum = parseFloat(cantidad || 0) || 0;
  const valorizadoTransferencia = selectedItem ? cantidadNum * (selectedItem.costo_promedio || 0) : 0;

  return (
    <div className="space-y-6" data-testid="transferencias-linea-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
          <ArrowRightLeft className="h-6 w-6" />
          Transferencias entre Lineas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Movimiento de stock entre lineas de negocio con trazabilidad FIFO
        </p>
      </div>

      {/* ==================== FORMULARIO DOS COLUMNAS ==================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5" />
            Nueva Transferencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-6">
            {/* ====== COLUMNA ORIGEN ====== */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">O</div>
                <h3 className="font-semibold text-base">ORIGEN</h3>
              </div>

              {/* Linea Origen */}
              <div>
                <Label className="text-xs font-medium">Linea de Negocio *</Label>
                <Select value={lineaOrigenId} onValueChange={(v) => { setLineaOrigenId(v); setLineaDestinoId(""); }}>
                  <SelectTrigger data-testid="select-linea-origen">
                    <SelectValue placeholder="Seleccionar linea..." />
                  </SelectTrigger>
                  <SelectContent>
                    {lineas.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.codigo} - {l.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Item selector */}
              <div>
                <Label className="text-xs font-medium">Item a transferir *</Label>
                {loadingItemsOrigen ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando items...
                  </div>
                ) : !lineaOrigenId ? (
                  <p className="text-xs text-muted-foreground py-2">Selecciona una linea de origen primero</p>
                ) : itemsOrigen.length === 0 ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    No hay items con stock en esta linea
                  </div>
                ) : (
                  <Popover open={openItemOrigenPicker} onOpenChange={setOpenItemOrigenPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openItemOrigenPicker}
                        className="w-full justify-between font-normal"
                        data-testid="select-item"
                      >
                        {selectedItem ? (
                          <span className="flex items-center gap-2 truncate">
                            <span className="font-mono text-xs text-muted-foreground">{selectedItem.codigo}</span>
                            <span className="truncate">{selectedItem.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Seleccionar item...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[380px]"
                      align="start"
                      sideOffset={4}
                    >
                      <Command shouldFilter={true}>
                        <CommandInput placeholder="Buscar por código o nombre..." className="h-10" />
                        <CommandList className="max-h-[340px]">
                          <CommandEmpty>No se encontraron items.</CommandEmpty>
                          <CommandGroup>
                            {itemsOrigen.map((i) => (
                              <CommandItem
                                key={i.id}
                                value={`${i.codigo} ${i.nombre}`}
                                onSelect={() => {
                                  setSelectedItemId(i.id);
                                  setOpenItemOrigenPicker(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check className={cn('mr-2 h-4 w-4', selectedItemId === i.id ? 'opacity-100' : 'opacity-0')} />
                                <span className="font-mono text-xs text-muted-foreground mr-2 min-w-[60px]">{i.codigo}</span>
                                <span className="flex-1 truncate">{i.nombre}</span>
                                <span className="ml-2 text-xs text-muted-foreground shrink-0">Stock: {formatNumber(i.stock_disponible)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Stock info del item en linea origen */}
              {selectedItem && (
                <Card className="bg-blue-50/50 border-blue-200">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Stock en Origen</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Bruto</span>
                        <p className="font-mono font-medium">{formatNumber(selectedItem.stock_en_linea)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reservado</span>
                        <p className="font-mono font-medium text-orange-600">{formatNumber(selectedItem.reservado)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Disponible</span>
                        <p className="font-mono font-bold text-blue-700">{formatNumber(selectedItem.stock_disponible)}</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Costo prom.</span>
                        <p className="font-mono font-medium">{formatCurrency(selectedItem.costo_promedio || 0)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valorizado disp.</span>
                        <p className="font-mono font-medium text-blue-700">{formatCurrency(selectedItem.valorizado_disponible || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <span>Unidad: <strong>{selectedItem.unidad_medida}</strong></span>
                      <span>Tipo: <strong>{selectedItem.control_por_rollos ? "Rollo" : "Normal"}</strong></span>
                      <span>Cat: <strong>{selectedItem.categoria}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Cantidad */}
              {selectedItem && (
                <div>
                  <Label className="text-xs font-medium">Cantidad a transferir *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={selectedItem.stock_disponible}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    placeholder={`Max: ${formatNumber(selectedItem.stock_disponible)} ${selectedItem.unidad_medida}`}
                    data-testid="input-cantidad"
                  />
                  {cantidadExcede && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Excede stock disponible ({formatNumber(selectedItem.stock_disponible)})
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ====== FLECHA CENTRAL ====== */}
            <div className="hidden lg:flex flex-col items-center justify-center">
              <div className="w-px h-16 bg-border" />
              <div className="my-3 h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <ArrowRight className="h-6 w-6" />
              </div>
              <div className="w-px h-16 bg-border" />
            </div>
            <div className="lg:hidden flex items-center justify-center py-2">
              <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
            </div>

            {/* ====== COLUMNA DESTINO ====== */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">D</div>
                <h3 className="font-semibold text-base">DESTINO</h3>
              </div>

              {/* Linea Destino */}
              <div>
                <Label className="text-xs font-medium">Linea de Negocio *</Label>
                {!lineaOrigenId ? (
                  <p className="text-xs text-muted-foreground py-2">Selecciona la linea de origen primero</p>
                ) : (
                  <Select value={lineaDestinoId} onValueChange={setLineaDestinoId}>
                    <SelectTrigger data-testid="select-linea-destino">
                      <SelectValue placeholder="Seleccionar linea destino..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lineas.filter(l => String(l.id) !== lineaOrigenId).map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          {l.codigo} - {l.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Item destino selector — sólo si origen + destino están elegidos */}
              {lineaDestinoId && selectedItem && (
                <div>
                  <Label className="text-xs font-medium">
                    Item destino * <span className="text-muted-foreground font-normal">(en línea destino, misma unidad y categoría)</span>
                  </Label>
                  {loadingItemsDestino ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Buscando items compatibles...
                    </div>
                  ) : itemsDestino.length === 0 ? (
                    <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-xs space-y-1.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-800">No existe ningún item compatible en esta línea</p>
                          <p className="text-yellow-700 mt-0.5">
                            Necesita ser un item con misma <strong>unidad ({selectedItem.unidad_medida})</strong> y misma{" "}
                            <strong>categoría ({selectedItem.categoria})</strong>. Crea el item en{" "}
                            <a href="/inventario" className="underline font-medium hover:text-yellow-900" data-testid="link-crear-item-destino">
                              Inventario
                            </a>{" "}
                            asignándolo a esta línea destino antes de transferir.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Popover open={openItemDestinoPicker} onOpenChange={setOpenItemDestinoPicker}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openItemDestinoPicker}
                          className="w-full justify-between font-normal"
                          data-testid="select-item-destino"
                        >
                          {(() => {
                            const dest = itemsDestino.find(x => x.id === selectedItemDestinoId);
                            return dest ? (
                              <span className="flex items-center gap-2 truncate">
                                <span className="font-mono text-xs text-muted-foreground">{dest.codigo}</span>
                                <span className="truncate">{dest.nombre}</span>
                                <span className="text-xs text-muted-foreground shrink-0">(stock: {formatNumber(dest.stock_en_linea)})</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Seleccionar item destino...</span>
                            );
                          })()}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[380px]"
                        align="start"
                        sideOffset={4}
                      >
                        <Command shouldFilter={true}>
                          <CommandInput placeholder="Buscar por código o nombre..." className="h-10" />
                          <CommandList className="max-h-[340px]">
                            <CommandEmpty>No se encontraron items.</CommandEmpty>
                            <CommandGroup>
                              {itemsDestino.map((i) => (
                                <CommandItem
                                  key={i.id}
                                  value={`${i.codigo} ${i.nombre}`}
                                  onSelect={() => {
                                    setSelectedItemDestinoId(i.id);
                                    setOpenItemDestinoPicker(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check className={cn('mr-2 h-4 w-4', selectedItemDestinoId === i.id ? 'opacity-100' : 'opacity-0')} />
                                  <span className="font-mono text-xs text-muted-foreground mr-2 min-w-[60px]">{i.codigo}</span>
                                  <span className="flex-1 truncate">{i.nombre}</span>
                                  <span className="ml-2 text-xs text-muted-foreground shrink-0">stock: {formatNumber(i.stock_en_linea)}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              {/* Preview de stock + valorizado en destino */}
              {selectedItemDestino && (
                <Card className="bg-green-50/50 border-green-200">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">Preview en Destino</span>
                    </div>
                    <p className="text-xs font-mono mb-2">
                      <span className="font-semibold">{selectedItemDestino.codigo}</span>{" "}
                      <span className="text-muted-foreground">— {selectedItemDestino.nombre}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Stock actual</span>
                        <p className="font-mono font-medium">{formatNumber(selectedItemDestino.stock_en_linea)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Después de transferir</span>
                        <p className="font-mono font-bold text-green-700">
                          {formatNumber((selectedItemDestino.stock_en_linea || 0) + cantidadNum)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Costo prom. actual</span>
                        <p className="font-mono font-medium">{formatCurrency(selectedItemDestino.costo_promedio || 0)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valorizado a transferir</span>
                        <p className="font-mono font-bold text-green-700">{formatCurrency(valorizadoTransferencia)}</p>
                      </div>
                    </div>
                    {selectedItemDestino.nombre !== selectedItem.nombre && (
                      <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>
                          <strong>Equivalente manual:</strong> origen y destino tienen nombres distintos
                          (<em>{selectedItem.nombre}</em> → <em>{selectedItemDestino.nombre}</em>).
                          El stock se moverá igualmente al ser de misma categoría y unidad.
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Motivo y Observaciones */}
              {selectedItem && (
                <>
                  <div>
                    <Label className="text-xs font-medium">Motivo</Label>
                    <Input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Razon de la transferencia..."
                      data-testid="input-motivo"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Observaciones</Label>
                    <Textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Notas adicionales..."
                      rows={2}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ====== ESTIMACION FIFO ====== */}
          {selectedItem && lineaOrigenId && cantidad && parseFloat(cantidad) > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Estimacion de Costo FIFO
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEstimar}
                    disabled={loadingEstimacion}
                    data-testid="btn-estimar-costo"
                  >
                    {loadingEstimacion ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                    Calcular
                  </Button>
                </div>

                {estimacion && (
                  <Card className={estimacion.stock_suficiente ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Capas FIFO a consumir</span>
                        {estimacion.stock_suficiente ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300">Stock suficiente</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-300">Stock insuficiente</Badge>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Fecha Ingreso</TableHead>
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
              </div>
            </>
          )}

          {/* ====== BOTONES DE ACCION ====== */}
          <Separator className="my-4" />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              Limpiar
            </Button>
            <Button
              onClick={handleCrear}
              disabled={!canSubmit || saving}
              data-testid="btn-crear-borrador"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
              Crear Borrador
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ==================== HISTORIAL ==================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Historial de Transferencias</h2>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end mb-3">
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
                          <div className="flex flex-col gap-0.5 items-start">
                            <Badge className={badge.className} variant={badge.variant}>{t.estado}</Badge>
                            {t.estado === "CONFIRMADO" && (
                              t.verificada ? (
                                <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5">
                                  <Check className="h-2.5 w-2.5" /> Verificada
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 inline-flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Pendiente verif.
                                </span>
                              )
                            )}
                          </div>
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
                            {t.estado === "CONFIRMADO" && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-orange-600"
                                onClick={() => handleReversar(t.id, t.codigo)}
                                title="Reversar (devolver stock al origen)"
                                data-testid={`btn-reversar-${t.codigo}`}
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                            )}
                            {(t.estado === "CANCELADO" || t.estado === "REVERSADO") && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                                onClick={() => handleEliminar(t.id, t.codigo, t.estado)}
                                title="Eliminar definitivamente (cascada)"
                                data-testid={`btn-eliminar-${t.codigo}`}
                              >
                                <Trash2 className="h-4 w-4" />
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
          <div className="flex items-center justify-between mt-3">
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
      </div>

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
