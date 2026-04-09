import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch, ExternalLink } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteLotesFraccionados = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/reportes-produccion/lotes-fraccionados`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4" data-testid="reporte-lotes-fraccionados">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/reportes/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lotes Fraccionados</h2>
          <p className="text-muted-foreground text-sm">Familias de lotes padre e hijos con cantidades</p>
        </div>
      </div>

      {data && <Badge variant="secondary">{data.total} familias fraccionadas</Badge>}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando...</div>
      ) : (data?.familias || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay lotes fraccionados
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(data?.familias || []).map(f => (
            <Card key={f.padre_id} data-testid={`familia-${f.padre_corte}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-primary" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{f.padre_corte}</span>
                        <Badge variant="outline">{f.padre_estado}</Badge>
                        <Badge variant={f.padre_estado_op === 'CERRADA' ? 'default' : 'secondary'}>{f.padre_estado_op}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{f.modelo_nombre}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{f.total_familia_prendas.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">prendas total familia</div>
                  </div>
                </div>

                {/* Padre */}
                <div className="mb-3 p-2 rounded-md bg-muted/50 border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-[10px]">PADRE</Badge>
                    <span className="font-mono text-sm">{f.padre_corte}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono">{f.padre_prendas.toLocaleString()} prendas</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/reportes/trazabilidad/${f.padre_id}`)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Hijos */}
                <div className="space-y-1">
                  {(f.hijos || []).map(h => (
                    <div key={h.id} className="p-2 rounded-md border flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">HIJO #{h.division_numero}</Badge>
                        <span className="font-mono text-sm">{h.n_corte}</span>
                        <Badge variant="outline" className="text-[10px]">{h.estado}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono">{(h.prendas || 0).toLocaleString()} prendas</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/reportes/trazabilidad/${h.id}`)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
