import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, ListChecks, AlertTriangle } from 'lucide-react';
import { CalidadMerma } from './CalidadMerma';
import { ReporteEstadosItem } from './ReporteEstadosItem';
import { ControlFallados } from './ControlFallados';

export const CalidadConsolidado = () => {
  const [searchParams] = useSearchParams();
  // El tab "Análisis de Mermas" (key resumen-calidad) fue eliminado.
  // Aceptamos el query param por retro-compatibilidad pero redirigimos al
  // primer tab disponible.
  const requested = searchParams.get('tab');
  const defaultTab = (!requested || requested === 'resumen-calidad') ? 'mermas' : requested;

  return (
    <div className="space-y-4" data-testid="calidad-consolidado">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calidad</h2>
        <p className="text-sm text-muted-foreground">Diferencias con servicio externo, estados y fallados</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="mermas" className="text-xs gap-1.5" data-testid="tab-mermas">
            <Shield className="h-3.5 w-3.5" /> Diferencias Servicio Externo
          </TabsTrigger>
          <TabsTrigger value="estados" className="text-xs gap-1.5" data-testid="tab-estados">
            <ListChecks className="h-3.5 w-3.5" /> Estados del Item
          </TabsTrigger>
          <TabsTrigger value="fallados" className="text-xs gap-1.5" data-testid="tab-fallados">
            <AlertTriangle className="h-3.5 w-3.5" /> Fallados y Arreglos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mermas"><CalidadMerma /></TabsContent>
        <TabsContent value="estados"><ReporteEstadosItem /></TabsContent>
        <TabsContent value="fallados"><ControlFallados /></TabsContent>
      </Tabs>
    </div>
  );
};
