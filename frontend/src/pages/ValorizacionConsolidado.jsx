import { useState, useEffect } from 'react';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Package, Layers, Box, Filter } from 'lucide-react';
import { ReporteMPValorizado, ReporteWIP, ReportePTValorizado } from './ReportesValorizacion';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export const ValorizacionConsolidado = () => {
  const [categorias, setCategorias] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroLinea, setFiltroLinea] = useState('todos');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    Promise.allSettled([
      axios.get(`${API}/inventario-filtros`, { headers }),
      axios.get(`${API}/lineas-negocio`, { headers }),
    ]).then(([catRes, linRes]) => {
      if (catRes.status === 'fulfilled') setCategorias(catRes.value.data.categorias || []);
      if (linRes.status === 'fulfilled') setLineasNegocio(linRes.value.data || []);
    });
  }, []);

  return (
    <div className="space-y-4" data-testid="valorizacion-consolidado">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Valorización</h2>
          <p className="text-sm text-muted-foreground">Valorización de materiales, WIP y producto terminado</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filtroLinea} onValueChange={setFiltroLinea}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Línea de negocio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las líneas</SelectItem>
              <SelectItem value="global">Global (sin línea)</SelectItem>
              {lineasNegocio.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>{l.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas categorías</SelectItem>
              {categorias.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="mp" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="mp" className="text-xs gap-1.5" data-testid="tab-mp">
            <Package className="h-3.5 w-3.5" /> MP Valorizado
          </TabsTrigger>
          <TabsTrigger value="wip" className="text-xs gap-1.5" data-testid="tab-wip">
            <Layers className="h-3.5 w-3.5" /> WIP (En Proceso)
          </TabsTrigger>
          <TabsTrigger value="pt" className="text-xs gap-1.5" data-testid="tab-pt">
            <Box className="h-3.5 w-3.5" /> PT Valorizado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mp">
          <ReporteMPValorizado categoria={filtroCategoria} lineaNegocioId={filtroLinea} />
        </TabsContent>
        <TabsContent value="wip">
          <ReporteWIP lineaNegocioId={filtroLinea} />
        </TabsContent>
        <TabsContent value="pt">
          <ReportePTValorizado categoria={filtroCategoria} lineaNegocioId={filtroLinea} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
