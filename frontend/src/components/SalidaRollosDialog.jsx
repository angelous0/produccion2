import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Layers, Search, Package, ArrowUpCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SalidaRollosDialog = ({ 
  open, 
  onOpenChange, 
  registroId = null,
  onSuccess 
}) => {
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [rollos, setRollos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Filtros
  const [filtroAncho, setFiltroAncho] = useState('all');
  const [filtroTono, setFiltroTono] = useState('all');
  
  // Selección de rollos
  const [rollosSeleccionados, setRollosSeleccionados] = useState({});
  // { rolloId: { selected: true, usoParcial: false, metraje: 0 } }
  
  // Vista colapsada/expandida
  const [detalleExpandido, setDetalleExpandido] = useState(false);

  // Obtener valores únicos para filtros
  const anchosUnicos = [...new Set(rollos.map(r => r.ancho))].filter(a => a > 0).sort((a, b) => a - b);
  const tonosUnicos = [...new Set(rollos.map(r => r.tono))].filter(t => t);

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/inventario`);
      // Solo items con control por rollos
      setItems(response.data.filter(i => i.control_por_rollos));
    } catch (error) {
      toast.error('Error al cargar items');
    }
  };

  const fetchRollos = async (itemId) => {
    if (!itemId) {
      setRollos([]);
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get(`${API}/inventario-rollos?item_id=${itemId}&activo=true`);
      setRollos(response.data.filter(r => r.metraje_disponible > 0));
    } catch (error) {
      toast.error('Error al cargar rollos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchItems();
      setSelectedItemId('');
      setSelectedItem(null);
      setRollos([]);
      setRollosSeleccionados({});
      setFiltroAncho('all');
      setFiltroTono('all');
      setDetalleExpandido(false);
    }
  }, [open]);

  const handleItemChange = (itemId) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItemId(itemId);
    setSelectedItem(item);
    setRollosSeleccionados({});
    setFiltroAncho('all');
    setFiltroTono('all');
    setDetalleExpandido(false);
    fetchRollos(itemId);
  };

  // Filtrar rollos
  const rollosFiltrados = rollos.filter(r => {
    if (filtroAncho !== 'all' && r.ancho !== parseFloat(filtroAncho)) return false;
    if (filtroTono !== 'all' && r.tono !== filtroTono) return false;
    return true;
  });

  const toggleRolloSeleccion = (rolloId, rollo) => {
    setRollosSeleccionados(prev => {
      if (prev[rolloId]?.selected) {
        const { [rolloId]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [rolloId]: {
          selected: true,
          usoParcial: false,
          metraje: rollo.metraje_disponible,
          rolloData: rollo
        }
      };
    });
  };

  const toggleUsoParcial = (rolloId) => {
    setRollosSeleccionados(prev => ({
      ...prev,
      [rolloId]: {
        ...prev[rolloId],
        usoParcial: !prev[rolloId].usoParcial,
        metraje: !prev[rolloId].usoParcial ? 0 : prev[rolloId].rolloData.metraje_disponible
      }
    }));
  };

  const updateMetrajeParcial = (rolloId, metraje) => {
    setRollosSeleccionados(prev => ({
      ...prev,
      [rolloId]: {
        ...prev[rolloId],
        metraje: parseFloat(metraje) || 0
      }
    }));
  };

  const seleccionarTodos = () => {
    const nuevaSeleccion = {};
    rollosFiltrados.forEach(rollo => {
      nuevaSeleccion[rollo.id] = {
        selected: true,
        usoParcial: false,
        metraje: rollo.metraje_disponible,
        rolloData: rollo
      };
    });
    setRollosSeleccionados(nuevaSeleccion);
  };

  const deseleccionarTodos = () => {
    setRollosSeleccionados({});
  };

  const getRollosParaProcesar = () => {
    return Object.entries(rollosSeleccionados)
      .filter(([_, data]) => data.selected && data.metraje > 0)
      .map(([rolloId, data]) => ({
        rolloId,
        metraje: data.metraje,
        rolloData: data.rolloData
      }));
  };

  const getTotalMetraje = () => {
    return getRollosParaProcesar().reduce((sum, r) => sum + r.metraje, 0);
  };

  const handleProcesarSalidas = async () => {
    const rollosAProcesar = getRollosParaProcesar();
    if (rollosAProcesar.length === 0) {
      toast.error('Selecciona al menos un rollo');
      return;
    }

    setProcessing(true);
    let exitosos = 0;
    let errores = 0;

    for (const rollo of rollosAProcesar) {
      try {
        await axios.post(`${API}/inventario-salidas`, {
          item_id: selectedItemId,
          cantidad: rollo.metraje,
          rollo_id: rollo.rolloId,
          registro_id: registroId || null,
          observaciones: `Salida de rollo ${rollo.rolloData.numero_rollo}${rollo.rolloData.tono ? ` - Tono: ${rollo.rolloData.tono}` : ''}`
        });
        exitosos++;
      } catch (error) {
        console.error(`Error procesando rollo ${rollo.rolloData.numero_rollo}:`, error);
        const msg = error?.response?.data?.detail || 'Error desconocido';
        toast.error(`Rollo ${rollo.rolloData.numero_rollo}: ${msg}`);
        errores++;
      }
    }

    setProcessing(false);

    if (exitosos > 0) {
      toast.success(`${exitosos} salida${exitosos > 1 ? 's' : ''} procesada${exitosos > 1 ? 's' : ''} correctamente`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    }
    if (errores > 0) {
      toast.error(`${errores} salida${errores > 1 ? 's' : ''} con error`);
    }
  };

  const cantidadSeleccionados = getRollosParaProcesar().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Salida de Rollos
          </DialogTitle>
          <DialogDescription>
            Selecciona los rollos a descargar. Por defecto se usa el rollo completo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4" onWheel={(e) => e.stopPropagation()}>
          {/* Selector de Item */}
          <div className="space-y-2">
            <Label>Tela *</Label>
            <Select value={selectedItemId} onValueChange={handleItemChange}>
              <SelectTrigger data-testid="select-item-rollos">
                <SelectValue placeholder="Seleccionar tela..." />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="font-mono mr-2">{item.codigo}</span>
                    {item.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedItemId && (
            <>
              {/* Filtros */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Filtrar Rollos
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Ancho (cm)</Label>
                      <Select value={filtroAncho} onValueChange={setFiltroAncho}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los anchos</SelectItem>
                          {anchosUnicos.map(ancho => (
                            <SelectItem key={ancho} value={ancho.toString()}>
                              {ancho} cm
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tono</Label>
                      <Select value={filtroTono} onValueChange={setFiltroTono}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los tonos</SelectItem>
                          {tonosUnicos.map(tono => (
                            <SelectItem key={tono} value={tono}>
                              {tono}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resumen + Lista de Rollos colapsable */}
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Cargando rollos...
                  </div>
                ) : rollosFiltrados.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay rollos disponibles</p>
                  </div>
                ) : (
                  <>
                    {/* Resumen (siempre visible) */}
                    <div
                      className="border rounded-lg p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setDetalleExpandido(prev => !prev)}
                      data-testid="resumen-rollos-toggle"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div>
                            <span className="text-sm text-muted-foreground">Rollos disponibles</span>
                            <p className="text-xl font-bold">{rollosFiltrados.length}</p>
                          </div>
                          <div>
                            <span className="text-sm text-muted-foreground">Total metraje</span>
                            <p className="text-xl font-bold font-mono text-green-600">
                              {rollosFiltrados.reduce((sum, r) => sum + (r.metraje_disponible || 0), 0).toFixed(2)}m
                            </p>
                          </div>
                          {tonosUnicos.length > 1 && (
                            <div>
                              <span className="text-sm text-muted-foreground">Tonos</span>
                              <div className="flex gap-1 mt-0.5">
                                {tonosUnicos.map(t => (
                                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {detalleExpandido ? 'Ocultar detalle' : 'Ver detalle'}
                          </span>
                          {detalleExpandido
                            ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            : <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          }
                        </div>
                      </div>
                    </div>

                    {/* Detalle expandible */}
                    {detalleExpandido && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Seleccionar rollos</Label>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm"
                              onClick={seleccionarTodos} disabled={rollosFiltrados.length === 0}>
                              Seleccionar Todos
                            </Button>
                            <Button type="button" variant="ghost" size="sm"
                              onClick={deseleccionarTodos} disabled={cantidadSeleccionados === 0}>
                              Limpiar
                            </Button>
                          </div>
                        </div>

                        <div className="border rounded-lg divide-y max-h-[250px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                          {rollosFiltrados.map((rollo) => {
                            const seleccion = rollosSeleccionados[rollo.id];
                            const isSelected = seleccion?.selected;
                            
                            return (
                              <div 
                                key={rollo.id} 
                                className={`p-3 transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleRolloSeleccion(rollo.id, rollo)}
                                    data-testid={`checkbox-rollo-${rollo.id}`}
                                  />
                                  <div className="flex-1 grid grid-cols-4 gap-2 items-center">
                                    <div>
                                      <span className="font-mono font-semibold">{rollo.numero_rollo}</span>
                                    </div>
                                    <div>
                                      {rollo.tono ? (
                                        <Badge variant="outline">{rollo.tono}</Badge>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">Sin tono</span>
                                      )}
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">Ancho:</span>
                                      <span className="font-mono ml-1">{rollo.ancho}cm</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-mono font-semibold text-green-600">
                                        {rollo.metraje_disponible?.toFixed(2)}m
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {isSelected && (
                                  <div className="mt-3 ml-7 p-2 bg-muted/30 rounded-lg">
                                    <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id={`parcial-${rollo.id}`}
                                          checked={seleccion.usoParcial}
                                          onCheckedChange={() => toggleUsoParcial(rollo.id)}
                                        />
                                        <Label htmlFor={`parcial-${rollo.id}`} className="text-sm cursor-pointer">
                                          Uso parcial
                                        </Label>
                                      </div>
                                      
                                      {seleccion.usoParcial ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            max={rollo.metraje_disponible}
                                            value={seleccion.metraje || ''}
                                            onChange={(e) => updateMetrajeParcial(rollo.id, e.target.value)}
                                            className="w-24 font-mono"
                                            placeholder="0.00"
                                          />
                                          <span className="text-sm text-muted-foreground">
                                            de {rollo.metraje_disponible?.toFixed(2)}m
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 text-sm">
                                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                                          <span>Rollo completo: {rollo.metraje_disponible?.toFixed(2)}m</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer con resumen */}
        <div className="border-t pt-4 space-y-3">
          {cantidadSeleccionados > 0 && (
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Rollos seleccionados:</span>
                  <span className="font-semibold ml-2">{cantidadSeleccionados}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Total metraje:</span>
                  <span className="font-mono font-bold text-primary ml-2">{getTotalMetraje().toFixed(2)}m</span>
                </div>
              </div>
              {registroId && (
                <Badge variant="outline">
                  Vinculado a registro
                </Badge>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleProcesarSalidas}
              disabled={cantidadSeleccionados === 0 || processing}
              data-testid="btn-procesar-salidas"
            >
              {processing ? (
                'Procesando...'
              ) : (
                <>
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Procesar {cantidadSeleccionados} Salida{cantidadSeleccionados !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
