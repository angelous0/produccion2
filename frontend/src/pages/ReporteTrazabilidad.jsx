import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ArrowLeft, ExternalLink, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ReporteTrazabilidad = () => {
  const { registroId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!registroId) return;
    axios.get(`${API}/reportes-produccion/trazabilidad/${registroId}`)
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [registroId]);

  if (loading) {
    return <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando trazabilidad...</div>;
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-12">Registro no encontrado</div>;
  }

  const reg = data.registro;
  const movs = data.movimientos || [];

  return (
    <div className="space-y-4" data-testid="reporte-trazabilidad">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Trazabilidad — Corte {reg.n_corte}
          </h2>
          <p className="text-muted-foreground text-sm">
            {reg.modelo_nombre} {reg.marca_nombre ? `(${reg.marca_nombre})` : ''} — {reg.ruta_nombre || 'Sin ruta'}
          </p>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => navigate(`/registros/editar/${reg.id}`)} data-testid="go-to-registro">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir Registro
          </Button>
        </div>
      </div>

      {/* Info general */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{reg.estado}</Badge>
        <Badge variant={reg.estado_op === 'CERRADA' ? 'default' : 'secondary'}>{reg.estado_op}</Badge>
        <Badge variant="secondary">{reg.total_prendas.toLocaleString()} prendas</Badge>
        {reg.urgente && <Badge variant="destructive">URGENTE</Badge>}
        {reg.fecha_entrega_final && <Badge variant="outline">Entrega: {formatDate(reg.fecha_entrega_final)}</Badge>}
      </div>

      {/* Tallas */}
      {reg.tallas && reg.tallas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tallas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {reg.tallas.map(t => (
                <div key={t.talla_id} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                  <span className="font-medium">{t.talla_nombre}</span>
                  <span className="text-muted-foreground">×{t.cantidad}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline de movimientos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cronología de Movimientos ({data.total_movimientos})</CardTitle>
        </CardHeader>
        <CardContent>
          {movs.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">Sin movimientos registrados</div>
          ) : (
            <div className="relative">
              {/* Línea vertical */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-4">
                {movs.map((m, idx) => {
                  const isCompleted = !!m.fecha_fin;
                  const isOverdue = !isCompleted && m.fecha_esperada_movimiento && new Date(m.fecha_esperada_movimiento) < new Date();

                  return (
                    <div key={m.id} className="relative pl-12" data-testid={`mov-${idx}`}>
                      {/* Dot */}
                      <div className={`absolute left-3 w-5 h-5 rounded-full flex items-center justify-center ${
                        isCompleted ? 'bg-emerald-500' : isOverdue ? 'bg-destructive' : 'bg-amber-500'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        ) : isOverdue ? (
                          <AlertTriangle className="h-3 w-3 text-white" />
                        ) : (
                          <Clock className="h-3 w-3 text-white" />
                        )}
                      </div>

                      <div className="bg-card border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">{m.servicio_nombre}</span>
                          <div className="flex items-center gap-2">
                            {isCompleted && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Completado</Badge>}
                            {!isCompleted && isOverdue && <Badge variant="destructive">Vencido</Badge>}
                            {!isCompleted && !isOverdue && <Badge variant="secondary">En curso</Badge>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span>Persona: <strong>{m.persona_nombre}</strong></span>
                            {m.tipo_persona && <Badge variant="outline" className="text-[10px] px-1">{m.tipo_persona}</Badge>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span>Enviadas: <strong>{m.cantidad_enviada}</strong></span>
                            <span>Recibidas: <strong>{m.cantidad_recibida}</strong></span>
                            {m.diferencia > 0 && <span className="text-destructive">Diferencia: {m.diferencia}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {m.fecha_inicio && <span>Inicio: {formatDate(m.fecha_inicio)}</span>}
                            {m.fecha_fin && (
                              <>
                                <ArrowRight className="h-3 w-3" />
                                <span>Fin: {formatDate(m.fecha_fin)}</span>
                                <span className="text-muted-foreground">({m.dias_servicio} días)</span>
                              </>
                            )}
                          </div>
                          {m.fecha_esperada_movimiento && (
                            <div className={isOverdue ? 'text-destructive' : ''}>
                              Esperado: {formatDate(m.fecha_esperada_movimiento)}
                            </div>
                          )}
                          {m.costo_calculado > 0 && (
                            <div>Costo: S/ {m.costo_calculado.toFixed(2)}</div>
                          )}
                          {m.observaciones && <div className="italic mt-1">{m.observaciones}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ruta esperada */}
      {reg.ruta_etapas && reg.ruta_etapas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ruta Esperada — {reg.ruta_nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {reg.ruta_etapas.map((e, i) => {
                const hasMov = movs.some(m => m.servicio_id === e.servicio_id);
                const isComplete = movs.some(m => m.servicio_id === e.servicio_id && m.fecha_fin);
                return (
                  <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                    isComplete ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                    hasMov ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isComplete ? <CheckCircle2 className="h-3 w-3" /> : hasMov ? <Clock className="h-3 w-3" /> : null}
                    <span>{e.nombre}</span>
                    {e.obligatorio && <span className="text-[10px]">(req)</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Divisiones */}
      {data.divisiones && data.divisiones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lotes Derivados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.divisiones.map(d => (
                <Button key={d.id} variant="outline" size="sm" onClick={() => navigate(`/reportes/trazabilidad/${d.id}`)}>
                  {d.n_corte} <Badge variant="secondary" className="ml-1">{d.estado}</Badge>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
