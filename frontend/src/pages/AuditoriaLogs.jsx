import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
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
  ShieldCheck,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  User,
  FileText,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ACCION_COLORS = {
  CREATE: "bg-green-100 text-green-700 border-green-300",
  UPDATE: "bg-blue-100 text-blue-700 border-blue-300",
  DELETE: "bg-red-100 text-red-700 border-red-300",
  CONFIRM: "bg-emerald-100 text-emerald-700 border-emerald-300",
  REOPEN: "bg-amber-100 text-amber-700 border-amber-300",
  CANCEL: "bg-gray-100 text-gray-700 border-gray-300",
};

const MODULO_COLORS = {
  produccion: "bg-purple-100 text-purple-700 border-purple-300",
  inventario: "bg-cyan-100 text-cyan-700 border-cyan-300",
  finanzas: "bg-orange-100 text-orange-700 border-orange-300",
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

export const AuditoriaLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [filtros, setFiltros] = useState({
    usuario: "", modulo: "", accion: "", fecha_desde: "", fecha_hasta: "", linea_negocio_id: "",
  });
  const [filtrosDisponibles, setFiltrosDisponibles] = useState({
    modulos: [], acciones: [], usuarios: [], lineas: [],
  });

  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
      const { data } = await axios.get(`${API}/auditoria?${params}`);
      setLogs(data.items || []);
      setTotal(data.total || 0);
      if (data.filtros_disponibles) setFiltrosDisponibles(data.filtros_disponibles);
    } catch (e) {
      if (e.response?.status === 403) {
        toast.error("Acceso restringido a administradores");
      } else {
        toast.error("Error al cargar logs de auditoria");
      }
    } finally {
      setLoading(false);
    }
  }, [page, filtros]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  const handleFiltro = (key, value) => {
    setFiltros((f) => ({ ...f, [key]: value === "TODOS" ? "" : value }));
    setPage(0);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-4" data-testid="auditoria-page">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
          <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="hidden sm:inline">Auditoria del Sistema</span>
          <span className="sm:hidden">Auditoria</span>
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Registro de cambios criticos en produccion e inventario
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-full sm:w-44">
          <Label className="text-xs">Usuario</Label>
          <Select value={filtros.usuario || "TODOS"} onValueChange={(v) => handleFiltro("usuario", v)}>
            <SelectTrigger data-testid="filtro-usuario">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {filtrosDisponibles.usuarios.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <Label className="text-xs">Modulo</Label>
          <Select value={filtros.modulo || "TODOS"} onValueChange={(v) => handleFiltro("modulo", v)}>
            <SelectTrigger data-testid="filtro-modulo">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {filtrosDisponibles.modulos.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[calc(50%-4px)] sm:w-40">
          <Label className="text-xs">Accion</Label>
          <Select value={filtros.accion || "TODOS"} onValueChange={(v) => handleFiltro("accion", v)}>
            <SelectTrigger data-testid="filtro-accion">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas</SelectItem>
              {filtrosDisponibles.acciones.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={filtros.fecha_desde} onChange={(e) => handleFiltro("fecha_desde", e.target.value)} data-testid="filtro-fecha-desde" />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-36">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={filtros.fecha_hasta} onChange={(e) => handleFiltro("fecha_hasta", e.target.value)} data-testid="filtro-fecha-hasta" />
        </div>
        {filtrosDisponibles.lineas.length > 0 && (
          <div className="w-full sm:w-44">
            <Label className="text-xs">Linea</Label>
            <Select value={filtros.linea_negocio_id || "TODOS"} onValueChange={(v) => handleFiltro("linea_negocio_id", v)}>
              <SelectTrigger data-testid="filtro-linea">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todas las lineas</SelectItem>
                {filtrosDisponibles.lineas.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Fecha</TableHead>
                <TableHead className="hidden sm:table-cell">Usuario</TableHead>
                <TableHead>Accion</TableHead>
                <TableHead className="hidden sm:table-cell">Modulo</TableHead>
                <TableHead className="hidden md:table-cell">Tabla</TableHead>
                <TableHead className="hidden lg:table-cell">Observacion</TableHead>
                <TableHead className="hidden md:table-cell">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay logs de auditoria
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const accionClass = ACCION_COLORS[log.accion] || "bg-gray-100 text-gray-700";
                  const moduloClass = MODULO_COLORS[log.modulo] || "bg-gray-100 text-gray-700";
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(log.id)}
                        data-testid={`log-row-${log.id}`}
                      >
                        <TableCell className="w-8 pr-0">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground hidden sm:block" />
                            <span className="hidden sm:inline">{formatDate(log.fecha_hora)}</span>
                            <span className="sm:hidden">{formatDate(log.fecha_hora).split(',')[0]}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm hidden sm:table-cell">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {log.usuario}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] sm:text-xs ${accionClass}`}>{log.accion}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] sm:text-xs ${moduloClass}`}>{log.modulo}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono hidden md:table-cell">{(log.tabla || "").replace("prod_", "")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                          {log.observacion || log.referencia || "-"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className={`text-[10px] ${log.resultado === "OK" ? "bg-green-50 text-green-600 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                            {log.resultado}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/20 p-4">
                            <DetalleAudit log={log} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
          <span className="text-sm text-muted-foreground">{total} registro(s) de auditoria</span>
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
  );
};

// ==================== DETALLE EXPANDIBLE ====================

const DetalleAudit = ({ log }) => {
  const hasBefore = log.datos_antes && Object.keys(log.datos_antes).length > 0;
  const hasAfter = log.datos_despues && Object.keys(log.datos_despues).length > 0;

  return (
    <div className="space-y-3">
      {/* Metadata */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div><span className="text-muted-foreground">ID Registro: </span><span className="font-mono">{log.registro_id || "-"}</span></div>
        {log.referencia && <div><span className="text-muted-foreground">Referencia: </span><span className="font-mono">{log.referencia}</span></div>}
        {log.linea_negocio_id && <div><span className="text-muted-foreground">Linea Negocio: </span><span>{log.linea_negocio_id}</span></div>}
        {log.ip && <div><span className="text-muted-foreground">IP: </span><span className="font-mono">{log.ip}</span></div>}
      </div>

      {/* Antes / Despues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hasBefore && (
          <div className="border rounded-lg p-3 bg-red-50/30">
            <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
              <FileText className="h-3 w-3" /> ANTES
            </h4>
            <JsonView data={log.datos_antes} />
          </div>
        )}
        {hasAfter && (
          <div className="border rounded-lg p-3 bg-green-50/30">
            <h4 className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1">
              <FileText className="h-3 w-3" /> DESPUES
            </h4>
            <JsonView data={log.datos_despues} />
          </div>
        )}
        {!hasBefore && !hasAfter && (
          <div className="text-xs text-muted-foreground">Sin datos de cambio registrados</div>
        )}
      </div>
    </div>
  );
};

const JsonView = ({ data }) => {
  if (!data || typeof data !== "object") return <span className="text-xs font-mono">{String(data)}</span>;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs">
          <span className="text-muted-foreground min-w-[120px]">{key}:</span>
          <span className="font-mono font-medium break-all">
            {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "-")}
          </span>
        </div>
      ))}
    </div>
  );
};
