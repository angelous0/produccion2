import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
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
import { Badge } from '../components/ui/badge';
import { FileText, Filter, Trash2, RefreshCw, Eye, Printer, Download } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const GuiasRemision = () => {
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [personas, setPersonas] = useState([]);

  // Filtros
  const [filtroRegistro, setFiltroRegistro] = useState('');
  const [filtroPersona, setFiltroPersona] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  // Modal de vista
  const [selectedGuia, setSelectedGuia] = useState(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const printRef = useRef(null);

  const fetchData = async () => {
    try {
      const [guiasRes, registrosRes, personasRes] = await Promise.all([
        axios.get(`${API}/guias-remision`),
        axios.get(`${API}/registros?all=true`),
        axios.get(`${API}/personas-produccion`),
      ]);
      setGuias(guiasRes.data);
      // Handle both paginated response {items: []} and plain array
      const registrosData = registrosRes.data;
      setRegistros(Array.isArray(registrosData) ? registrosData : (registrosData.items || []));
      setPersonas(personasRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta guía de remisión?')) return;
    try {
      await axios.delete(`${API}/guias-remision/${id}`);
      toast.success('Guía eliminada');
      fetchData();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const handleView = async (guiaId) => {
    try {
      const response = await axios.get(`${API}/guias-remision/${guiaId}`);
      setSelectedGuia(response.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error('Error al cargar guía');
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Guía de Remisión ${selectedGuia?.numero_guia}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .header p { margin: 5px 0; color: #666; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-box { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
            .info-box h3 { margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; }
            .info-box p { margin: 5px 0; }
            .cantidad-box { text-align: center; padding: 20px; background: #f5f5f5; border-radius: 5px; margin-bottom: 20px; }
            .cantidad-box .numero { font-size: 48px; font-weight: bold; }
            .cantidad-box .label { color: #666; }
            .observaciones { border: 1px solid #ddd; padding: 15px; border-radius: 5px; min-height: 60px; }
            .firma { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 20px; }
            .firma-box { text-align: center; }
            .firma-linea { border-top: 1px solid #000; padding-top: 5px; margin-top: 60px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const limpiarFiltros = () => {
    setFiltroRegistro('');
    setFiltroPersona('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
  };

  // Filtrar guías
  const guiasFiltradas = guias.filter(g => {
    if (filtroRegistro && g.registro_id !== filtroRegistro) return false;
    if (filtroPersona && g.persona_id !== filtroPersona) return false;
    if (filtroFechaDesde && g.fecha < filtroFechaDesde) return false;
    if (filtroFechaHasta && g.fecha > filtroFechaHasta) return false;
    return true;
  });

  // Calcular totales
  const totalCantidad = guiasFiltradas.reduce((sum, g) => sum + (g.cantidad || 0), 0);

  if (loading) {
    return <div className="flex justify-center p-8">Cargando...</div>;
  }

  return (
    <div className="space-y-6" data-testid="guias-remision-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-500" />
            Guías de Remisión
          </h1>
          <p className="text-muted-foreground">
            Documentos de envío de prendas a producción
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Guías
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{guiasFiltradas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Prendas Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalCantidad}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Destinatarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(guiasFiltradas.map(g => g.persona_id)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Registro</Label>
              <Select value={filtroRegistro} onValueChange={setFiltroRegistro}>
                <SelectTrigger data-testid="filtro-registro">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {registros.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.modelo_nombre} - {r.n_corte}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destinatario</Label>
              <Select value={filtroPersona} onValueChange={setFiltroPersona}>
                <SelectTrigger data-testid="filtro-persona">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {personas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha Desde</Label>
              <Input
                type="date"
                value={filtroFechaDesde}
                onChange={(e) => setFiltroFechaDesde(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha Hasta</Label>
              <Input
                type="date"
                value={filtroFechaHasta}
                onChange={(e) => setFiltroFechaHasta(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={limpiarFiltros} className="w-full">
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de guías */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>N° Guía</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="w-[120px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guiasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {guias.length === 0 
                      ? 'No hay guías de remisión. Se crean desde la sección de Movimientos de cada registro.'
                      : 'No hay resultados con los filtros aplicados'
                    }
                  </TableCell>
                </TableRow>
              ) : (
                guiasFiltradas.map((guia) => (
                  <TableRow key={guia.id} data-testid={`guia-row-${guia.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {guia.numero_guia || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {guia.fecha ? formatDate(guia.fecha) : '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{guia.modelo_nombre}</span>
                        <span className="text-muted-foreground ml-1">- {guia.registro_n_corte}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{guia.servicio_nombre || '-'}</Badge>
                    </TableCell>
                    <TableCell>{guia.persona_nombre || '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {guia.cantidad}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(guia.id)}
                          data-testid={`view-guia-${guia.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(guia.id)}
                          data-testid={`delete-guia-${guia.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de vista/impresión */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Guía de Remisión
            </DialogTitle>
            <DialogDescription>
              Vista previa del documento
            </DialogDescription>
          </DialogHeader>

          {selectedGuia && (
            <>
              {/* Contenido imprimible */}
              <div ref={printRef} className="border rounded-lg p-6 bg-white text-black" style={{ colorScheme: 'light' }}>
                <div className="header text-center border-b-2 border-black pb-4 mb-6">
                  <h1 className="text-2xl font-bold text-black">GUÍA DE REMISIÓN</h1>
                  <p className="text-xl font-mono mt-2 text-black">{selectedGuia.numero_guia}</p>
                  <p className="text-gray-500">Fecha: {selectedGuia.fecha ? formatDate(selectedGuia.fecha) : '-'}</p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="border border-gray-300 rounded-lg p-4">
                    <h3 className="text-xs text-gray-500 uppercase mb-2">Registro de Producción</h3>
                    <p className="font-semibold text-black">{selectedGuia.modelo_nombre}</p>
                    <p className="text-black">N° Corte: {selectedGuia.registro_n_corte}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Servicio: {selectedGuia.servicio_nombre}
                    </p>
                  </div>
                  <div className="border border-gray-300 rounded-lg p-4">
                    <h3 className="text-xs text-gray-500 uppercase mb-2">Destinatario</h3>
                    <p className="font-semibold text-black">{selectedGuia.persona_nombre}</p>
                    {selectedGuia.persona_telefono && (
                      <p className="text-black">Tel: {selectedGuia.persona_telefono}</p>
                    )}
                    {selectedGuia.persona_direccion && (
                      <p className="text-sm text-black">{selectedGuia.persona_direccion}</p>
                    )}
                  </div>
                </div>

                <div className="text-center py-6 bg-gray-100 rounded-lg mb-6">
                  <div className="text-5xl font-bold text-black">{selectedGuia.cantidad}</div>
                  <div className="text-gray-500">PRENDAS</div>
                </div>

                {selectedGuia.observaciones && (
                  <div className="border border-gray-300 rounded-lg p-4 mb-6">
                    <h3 className="text-xs text-gray-500 uppercase mb-2">Observaciones</h3>
                    <p className="text-black">{selectedGuia.observaciones}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-12 mt-12 pt-6">
                  <div className="text-center">
                    <div className="border-t border-black pt-2 mt-16 text-black">
                      Firma Remitente
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-black pt-2 mt-16 text-black">
                      Firma Destinatario
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
