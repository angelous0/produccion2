import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { GitBranch, Shield, BarChart3 } from 'lucide-react';
import { ReporteLotesFraccionados } from './ReporteLotesFraccionados';
import TrazabilidadReporte from './TrazabilidadReporte';
import { ReporteTrazabilidadKPIs } from './ReporteTrazabilidadKPIs';

export const LotesTrazabilidad = () => {
  return (
    <div className="space-y-4" data-testid="lotes-trazabilidad">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Lotes y Trazabilidad</h2>
        <p className="text-sm text-muted-foreground">Lotes fraccionados, trazabilidad general y KPIs de calidad</p>
      </div>

      <Tabs defaultValue="fraccionados" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="fraccionados" className="text-xs gap-1.5" data-testid="tab-fraccionados">
            <GitBranch className="h-3.5 w-3.5" /> Fraccionados
          </TabsTrigger>
          <TabsTrigger value="trazabilidad" className="text-xs gap-1.5" data-testid="tab-trazabilidad">
            <Shield className="h-3.5 w-3.5" /> Trazabilidad General
          </TabsTrigger>
          <TabsTrigger value="kpis" className="text-xs gap-1.5" data-testid="tab-kpis-trazabilidad">
            <BarChart3 className="h-3.5 w-3.5" /> KPIs Calidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fraccionados"><ReporteLotesFraccionados /></TabsContent>
        <TabsContent value="trazabilidad"><TrazabilidadReporte /></TabsContent>
        <TabsContent value="kpis"><ReporteTrazabilidadKPIs /></TabsContent>
      </Tabs>
    </div>
  );
};
