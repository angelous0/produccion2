import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Activity, Layers, AlertTriangle, TrendingUp, PauseCircle } from 'lucide-react';
import { ReporteEnProceso } from './ReporteEnProceso';
import { ReporteWIPEtapa } from './ReporteWIPEtapa';
import { ReporteAtrasados } from './ReporteAtrasados';
import { ReporteCumplimientoRuta } from './ReporteCumplimientoRuta';
import { ReporteParalizados } from './ReporteParalizados';

export const SeguimientoProduccion = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'en-proceso';

  return (
    <div className="space-y-4" data-testid="seguimiento-produccion">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Seguimiento de Producción</h2>
        <p className="text-sm text-muted-foreground">Monitoreo de lotes, etapas y cumplimiento</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="en-proceso" className="text-xs gap-1.5" data-testid="tab-en-proceso">
            <Activity className="h-3.5 w-3.5" /> En Proceso
          </TabsTrigger>
          <TabsTrigger value="wip-etapa" className="text-xs gap-1.5" data-testid="tab-wip-etapa">
            <Layers className="h-3.5 w-3.5" /> WIP por Etapa
          </TabsTrigger>
          <TabsTrigger value="atrasados" className="text-xs gap-1.5" data-testid="tab-atrasados">
            <AlertTriangle className="h-3.5 w-3.5" /> Atrasados
          </TabsTrigger>
          <TabsTrigger value="cumplimiento" className="text-xs gap-1.5" data-testid="tab-cumplimiento">
            <TrendingUp className="h-3.5 w-3.5" /> Cumplimiento Ruta
          </TabsTrigger>
          <TabsTrigger value="paralizados" className="text-xs gap-1.5" data-testid="tab-paralizados">
            <PauseCircle className="h-3.5 w-3.5" /> Paralizados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="en-proceso"><ReporteEnProceso /></TabsContent>
        <TabsContent value="wip-etapa"><ReporteWIPEtapa /></TabsContent>
        <TabsContent value="atrasados"><ReporteAtrasados /></TabsContent>
        <TabsContent value="cumplimiento"><ReporteCumplimientoRuta /></TabsContent>
        <TabsContent value="paralizados"><ReporteParalizados /></TabsContent>
      </Tabs>
    </div>
  );
};
