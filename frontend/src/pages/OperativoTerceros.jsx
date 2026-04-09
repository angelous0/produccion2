import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ClipboardList, Timer, PauseCircle, Users } from 'lucide-react';
import { ReporteCostura } from './ReporteCostura';
import { ReporteTiemposMuertos } from './ReporteTiemposMuertos';
import { ReporteParalizados } from './ReporteParalizados';
import { ReporteBalanceTerceros } from './ReporteBalanceTerceros';

export const OperativoTerceros = () => {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'operativo';

  return (
    <div className="space-y-4" data-testid="operativo-terceros">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Operativo y Terceros</h2>
        <p className="text-sm text-muted-foreground">Reporte operativo, tiempos muertos, paralizaciones y balance de terceros</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="operativo" className="text-xs gap-1.5" data-testid="tab-operativo">
            <ClipboardList className="h-3.5 w-3.5" /> Rep. Operativo
          </TabsTrigger>
          <TabsTrigger value="tiempos" className="text-xs gap-1.5" data-testid="tab-tiempos">
            <Timer className="h-3.5 w-3.5" /> Tiempos Muertos
          </TabsTrigger>
          <TabsTrigger value="paralizados" className="text-xs gap-1.5" data-testid="tab-paralizados">
            <PauseCircle className="h-3.5 w-3.5" /> Paralizados
          </TabsTrigger>
          <TabsTrigger value="balance" className="text-xs gap-1.5" data-testid="tab-balance">
            <Users className="h-3.5 w-3.5" /> Balance Terceros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operativo"><ReporteCostura /></TabsContent>
        <TabsContent value="tiempos"><ReporteTiemposMuertos /></TabsContent>
        <TabsContent value="paralizados"><ReporteParalizados /></TabsContent>
        <TabsContent value="balance"><ReporteBalanceTerceros /></TabsContent>
      </Tabs>
    </div>
  );
};
