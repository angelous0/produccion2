import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Shield, AlertTriangle } from 'lucide-react';
import { CalidadMerma } from './CalidadMerma';
import { ControlFallados } from './ControlFallados';

export const CalidadConsolidado = () => {
  const [searchParams] = useSearchParams();
  // Tabs eliminados (mantenemos retro-compatibilidad de query param):
  //   - resumen-calidad ("Análisis de Mermas")
  //   - estados ("Estados del Item")
  // Si llega cualquiera de esos, redirigimos al primer tab vigente.
  const requested = searchParams.get('tab');
  const obsoletos = new Set(['resumen-calidad', 'estados']);
  const defaultTab = (!requested || obsoletos.has(requested)) ? 'mermas' : requested;

  return (
    <div className="space-y-4" data-testid="calidad-consolidado">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calidad</h2>
        <p className="text-sm text-muted-foreground">Diferencias con servicio externo y fallados</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="mermas" className="text-xs gap-1.5" data-testid="tab-mermas">
            <Shield className="h-3.5 w-3.5" /> Diferencias Servicio Externo
          </TabsTrigger>
          <TabsTrigger value="fallados" className="text-xs gap-1.5" data-testid="tab-fallados">
            <AlertTriangle className="h-3.5 w-3.5" /> Fallados y Arreglos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mermas"><CalidadMerma /></TabsContent>
        <TabsContent value="fallados"><ControlFallados /></TabsContent>
      </Tabs>
    </div>
  );
};
