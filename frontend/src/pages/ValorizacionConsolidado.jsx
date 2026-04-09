import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Package, Layers, Box } from 'lucide-react';
import { ReporteMPValorizado, ReporteWIP, ReportePTValorizado } from './ReportesValorizacion';

export const ValorizacionConsolidado = () => {
  return (
    <div className="space-y-4" data-testid="valorizacion-consolidado">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Valorización</h2>
        <p className="text-sm text-muted-foreground">Valorización de materiales, WIP y producto terminado</p>
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

        <TabsContent value="mp"><ReporteMPValorizado /></TabsContent>
        <TabsContent value="wip"><ReporteWIP /></TabsContent>
        <TabsContent value="pt"><ReportePTValorizado /></TabsContent>
      </Tabs>
    </div>
  );
};
