import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { GitBranch, Shield } from 'lucide-react';
import { ReporteLotesFraccionados } from './ReporteLotesFraccionados';
import TrazabilidadReporte from './TrazabilidadReporte';

export const LotesTrazabilidad = () => {
  return (
    <div className="space-y-4" data-testid="lotes-trazabilidad">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Lotes y Trazabilidad</h2>
        <p className="text-sm text-muted-foreground">Lotes fraccionados, trazabilidad general</p>
      </div>

      <Tabs defaultValue="fraccionados" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="fraccionados" className="text-xs gap-1.5" data-testid="tab-fraccionados">
            <GitBranch className="h-3.5 w-3.5" /> Fraccionados
          </TabsTrigger>
          <TabsTrigger value="trazabilidad" className="text-xs gap-1.5" data-testid="tab-trazabilidad">
            <Shield className="h-3.5 w-3.5" /> Trazabilidad General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fraccionados"><ReporteLotesFraccionados /></TabsContent>
        <TabsContent value="trazabilidad"><TrazabilidadReporte /></TabsContent>
      </Tabs>
    </div>
  );
};
