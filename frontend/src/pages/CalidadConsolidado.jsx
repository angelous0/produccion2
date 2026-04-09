import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BarChart3, Shield, ListChecks, AlertTriangle } from 'lucide-react';
import { ReporteMermas } from './ReporteMermas';
import { CalidadMerma } from './CalidadMerma';
import { ReporteEstadosItem } from './ReporteEstadosItem';
import { ControlFallados } from './ControlFallados';

export const CalidadConsolidado = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'resumen-calidad';

  return (
    <div className="space-y-4" data-testid="calidad-consolidado">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calidad</h2>
        <p className="text-sm text-muted-foreground">Resumen, mermas, estados y control de fallados</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="resumen-calidad" className="text-xs gap-1.5" data-testid="tab-resumen-calidad">
            <BarChart3 className="h-3.5 w-3.5" /> Resumen Calidad
          </TabsTrigger>
          <TabsTrigger value="mermas" className="text-xs gap-1.5" data-testid="tab-mermas">
            <Shield className="h-3.5 w-3.5" /> Mermas
          </TabsTrigger>
          <TabsTrigger value="estados" className="text-xs gap-1.5" data-testid="tab-estados">
            <ListChecks className="h-3.5 w-3.5" /> Estados del Item
          </TabsTrigger>
          <TabsTrigger value="fallados" className="text-xs gap-1.5" data-testid="tab-fallados">
            <AlertTriangle className="h-3.5 w-3.5" /> Fallados y Arreglos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-calidad"><ReporteMermas /></TabsContent>
        <TabsContent value="mermas"><CalidadMerma /></TabsContent>
        <TabsContent value="estados"><ReporteEstadosItem /></TabsContent>
        <TabsContent value="fallados"><ControlFallados /></TabsContent>
      </Tabs>
    </div>
  );
};
