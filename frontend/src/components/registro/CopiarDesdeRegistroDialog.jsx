import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import { Search, Copy, Loader2, ArrowLeft, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getErrorMsg = (err, fallback = 'Error') => {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail);
};

/**
 * Dialog reutilizable para copiar movimientos o materiales desde otro registro.
 * @param {string} tipo - 'movimientos' | 'materiales'
 */
const CopiarDesdeRegistroDialog = ({
  open, onOpenChange, registroDestinoId, cantidadDestino = 0, tipo = 'movimientos', onSuccess,
}) => {
  // Step 1: buscar registro origen
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Step 2: seleccionar items
  const [registroOrigen, setRegistroOrigen] = useState(null);
  const [items, setItems] = useState([]);   // movimientos o materiales del origen
  const [selected, setSelected] = useState(new Set());
  const [loadingItems, setLoadingItems] = useState(false);
  const [copying, setCopying] = useState(false);
  const [cantidadOrigen, setCantidadOrigen] = useState(0);
  const [cantidadesEdit, setCantidadesEdit] = useState({});  // {id: string} cantidades editables por línea

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSearchResults([]);
      setRegistroOrigen(null);
      setItems([]);
      setSelected(new Set());
      setCantidadesEdit({});
    }
  }, [open]);

  const buscarRegistros = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API}/registros?search=${encodeURIComponent(search.trim())}&limit=10`);
      const results = (res.data.items || []).filter(r => r.id !== registroDestinoId);
      setSearchResults(results);
    } catch {
      toast.error('Error buscando registros');
    } finally {
      setSearching(false);
    }
  }, [search, registroDestinoId]);

  // Debounce search
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(buscarRegistros, 400);
    return () => clearTimeout(timer);
  }, [search, buscarRegistros]);

  const seleccionarOrigen = async (registro) => {
    setRegistroOrigen(registro);
    setLoadingItems(true);
    try {
      if (tipo === 'movimientos') {
        const res = await axios.get(`${API}/movimientos-produccion?registro_id=${registro.id}&all=true`);
        const movs = Array.isArray(res.data) ? res.data : res.data.items || [];
        setItems(movs);
        setSelected(new Set(movs.map(m => m.id)));
        // Calcular cantidad origen del último movimiento
        const lastMov = movs.length > 0 ? movs[movs.length - 1] : null;
        setCantidadOrigen(lastMov ? (lastMov.cantidad_recibida || lastMov.cantidad || 0) : 0);
      } else {
        const res = await axios.get(`${API}/registros/${registro.id}/materiales`);
        const lineas = res.data.lineas || [];
        setItems(lineas);
        setSelected(new Set(lineas.map(l => l.id)));
        // Cantidad origen: total prendas del registro
        const cantOrigen = registro.total_prendas || registro.cantidad || 0;
        setCantidadOrigen(cantOrigen);
        // Inicializar cantidades editables con el total de prendas del destino
        const initCants = {};
        lineas.forEach(l => {
          initCants[l.id] = parseFloat(cantidadDestino).toFixed(1);
        });
        setCantidadesEdit(initCants);
      }
    } catch {
      toast.error('Error cargando datos del registro origen');
    } finally {
      setLoadingItems(false);
    }
  };

  const toggleItem = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  };

  const confirmarCopia = async () => {
    if (selected.size === 0) return toast.error('Selecciona al menos un item');

    let idsAEnviar = [...selected];
    if (tipo === 'materiales') {
      idsAEnviar = idsAEnviar.filter(id => parseFloat(cantidadesEdit[id] ?? 0) > 0);
      if (idsAEnviar.length === 0) {
        return toast.error('Ingresa una cantidad mayor a 0 en al menos un material');
      }
    }

    setCopying(true);
    try {
      const endpoint = tipo === 'movimientos'
        ? `${API}/registros/${registroDestinoId}/copiar-movimientos`
        : `${API}/registros/${registroDestinoId}/copiar-materiales`;

      const payload = tipo === 'movimientos'
        ? { registro_origen_id: registroOrigen.id, movimiento_ids: idsAEnviar, cantidad_origen: cantidadOrigen, cantidad_destino: cantidadDestino }
        : {
            registro_origen_id: registroOrigen.id,
            linea_ids: idsAEnviar,
            cantidad_origen: cantidadOrigen,
            cantidad_destino: cantidadDestino,
            cantidades_custom: Object.fromEntries(
              idsAEnviar.map(id => [id, parseFloat(cantidadesEdit[id] ?? 0)])
            ),
          };

      const res = await axios.post(endpoint, payload);
      toast.success(`${res.data.message}. Revisa y ajusta las cantidades si es necesario.`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(getErrorMsg(err, 'Error al copiar'));
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copiar {tipo} desde otro registro
          </DialogTitle>
          <DialogDescription>
            {!registroOrigen
              ? 'Busca el registro de origen por número de corte'
              : `Selecciona los ${tipo} a copiar desde Corte #${registroOrigen.n_corte}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Buscar registro */}
        {!registroOrigen ? (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por N° de corte o modelo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                data-testid="input-buscar-registro-origen"
              />
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md" onWheel={(e) => e.stopPropagation()}>
              {searching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando...
                </div>
              )}
              {!searching && searchResults.length === 0 && search.trim().length >= 2 && (
                <p className="text-center text-sm text-muted-foreground py-8">No se encontraron registros</p>
              )}
              {!searching && searchResults.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Corte</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Prendas</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => seleccionarOrigen(r)} data-testid={`registro-origen-${r.id}`}>
                        <TableCell className="font-mono font-medium">{r.n_corte}</TableCell>
                        <TableCell className="text-sm">{r.modelo_nombre || r.modelo_manual?.nombre || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.estado}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.total_prendas || r.cantidad || '—'}</TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs">
                            Seleccionar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Seleccionar items a copiar */
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setRegistroOrigen(null); setItems([]); setSelected(new Set()); }}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Cambiar registro
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Origen: <span className="font-medium">{cantidadOrigen} prendas</span></span>
                <span>Destino: <span className="font-medium">{cantidadDestino} prendas</span></span>
              </div>
            </div>

            {loadingItems ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando {tipo}...
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Este registro no tiene {tipo}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                    <CheckSquare className="h-3 w-3 mr-1" />
                    {selected.size === items.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </Button>
                  <span className="text-xs text-muted-foreground">{selected.size} de {items.length} seleccionados</span>
                </div>
                <div className="flex-1 overflow-y-auto border rounded-md" onWheel={(e) => e.stopPropagation()}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        {tipo === 'movimientos' ? (
                          <>
                            <TableHead>Servicio</TableHead>
                            <TableHead>Persona</TableHead>
                            <TableHead className="text-right">Enviada</TableHead>
                            <TableHead className="text-right">Recibida</TableHead>
                            <TableHead className="text-right">Tarifa</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead>Item</TableHead>
                            <TableHead>Talla</TableHead>
                            <TableHead className="text-right">Original</TableHead>
                            <TableHead className="text-right">Cantidad a copiar</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => {
                        const checked = selected.has(item.id);
                        if (tipo === 'movimientos') {
                          return (
                            <TableRow key={item.id} className={checked ? '' : 'opacity-40'}
                              onClick={() => toggleItem(item.id)} data-testid={`copy-item-${item.id}`}>
                              <TableCell>
                                <Checkbox checked={checked} onCheckedChange={() => toggleItem(item.id)} />
                              </TableCell>
                              <TableCell className="text-sm">{item.servicio_nombre || '—'}</TableCell>
                              <TableCell className="text-sm">{item.persona_nombre || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{item.cantidad_enviada || 0}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{item.cantidad_recibida || 0}</TableCell>
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {item.tarifa_aplicada ? `S/${parseFloat(item.tarifa_aplicada).toFixed(2)}` : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        }
                        // materiales
                        return (
                          <TableRow key={item.id} className={checked ? '' : 'opacity-40'}
                            data-testid={`copy-item-${item.id}`}>
                            <TableCell onClick={() => toggleItem(item.id)} className="cursor-pointer">
                              <Checkbox checked={checked} onCheckedChange={() => toggleItem(item.id)} />
                            </TableCell>
                            <TableCell onClick={() => toggleItem(item.id)} className="cursor-pointer">
                              <span className="text-sm font-medium">{item.item_nombre}</span>
                              <span className="block text-xs text-muted-foreground font-mono">{item.item_codigo}</span>
                            </TableCell>
                            <TableCell onClick={() => toggleItem(item.id)} className="cursor-pointer">
                              {item.talla_nombre ? <Badge variant="outline" className="text-xs">{item.talla_nombre}</Badge> : <span className="text-xs text-muted-foreground">General</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground" onClick={() => toggleItem(item.id)}>
                              {parseFloat(item.cantidad_requerida).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                className="h-7 w-24 text-right font-mono text-sm ml-auto"
                                value={cantidadesEdit[item.id] ?? ''}
                                onChange={(e) => setCantidadesEdit(prev => ({ ...prev, [item.id]: e.target.value }))}
                                disabled={!checked}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {registroOrigen && items.length > 0 && (() => {
            const countEfectivo = tipo === 'materiales'
              ? [...selected].filter(id => parseFloat(cantidadesEdit[id] ?? 0) > 0).length
              : selected.size;
            return (
              <Button type="button" onClick={confirmarCopia} disabled={copying || countEfectivo === 0}>
                {copying && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar {countEfectivo} {tipo}
              </Button>
            );
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopiarDesdeRegistroDialog;
