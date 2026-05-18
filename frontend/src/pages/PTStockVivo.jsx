import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  Package, Store, ShoppingCart, TrendingUp, AlertTriangle, MapPin,
  ArrowLeft, RefreshCw, Layers, Info, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
};

const TIPOS_LABEL = {
  normal: 'Normal',
  liquidacion_leve: 'LQ Leve',
  liquidacion_grave: 'LQ Grave',
};

const PTStockVivo = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diasVentas, setDiasVentas] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!refreshing) setLoading(true);
    try {
      const res = await axios.get(`${API}/inventario-pt/${id}/stock-vivo?dias_ventas=${diasVentas}`, { headers: hdrs() });
      setData(res.data);
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response?.data?.detail : 'No se pudo cargar el stock vivo');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, diasVentas, refreshing]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [id, diasVentas]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-12">PT no encontrado o sin datos</div>;
  }

  const pt = data.pt || {};
  const tieneVinculo = data.vinculado_a_odoo;
  const producido = data.producido_total || 0;
  const vivo = data.stock_vivo_total || 0;
  const vendidoHist = data.vendido_total_historico || 0;
  const vendidoPer = data.vendido_total_periodo || 0;
  const salidaClientes = data.salida_a_clientes_historica || 0;
  const diferencia = data.diferencia_inferida || 0;
  const costo = data.costo_unitario_promedio || 0;
  const valorStock = data.valor_stock_vivo || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <nav className="text-xs text-muted-foreground">
            <Link to="/inventario/kardex-pt" className="hover:underline">Kardex PT</Link>
            {' / '}
            <span>Stock vivo</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            {pt.codigo} <span className="text-muted-foreground font-normal">·</span> <span className="font-normal">{pt.nombre}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inventario/kardex-pt">
            <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Volver</Button>
          </Link>
          <Button onClick={() => { setRefreshing(true); fetchData(); }} variant="outline" size="sm" className="gap-1" disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refrescar
          </Button>
        </div>
      </div>

      {!tieneVinculo && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-900 dark:text-amber-200">PT sin vínculo a templates de Odoo</p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                Para ver stock vivo, ventas y movimientos reales, este PT debe estar vinculado a uno o más templates de Odoo.
                El vínculo se crea automáticamente cuando un corte con este PT declara distribución en el tab "PT Odoo".
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Producido" value={formatNumber(producido)} sub="suma de cierres" color="blue" />
        <Kpi label="Stock vivo en Odoo" value={formatNumber(vivo)} sub={`${data.stock_por_location?.length || 0} ubicaciones`} color="emerald" />
        <Kpi label={`Vendido (${diasVentas}d)`} value={formatNumber(vendidoPer)} sub={`Histórico: ${formatNumber(vendidoHist)}`} color="violet" />
        <Kpi label="Valor stock" value={formatCurrency(valorStock)} sub={`@ ${formatCurrency(costo)}/pz`} color="amber" />
      </div>

      {/* Templates vinculados */}
      {tieneVinculo && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" /> Templates de Odoo vinculados
              <Badge variant="outline" className="text-[10px]">{data.templates_vinculados.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.templates_vinculados.map(t => (
                <div key={t.odoo_template_id} className="rounded-md border bg-card/60 px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name || `#${t.odoo_template_id}`}</span>
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                        {TIPOS_LABEL[t.tipo_salida] || t.tipo_salida}
                      </Badge>
                      {t.auto_vinculado && (
                        <Badge variant="outline" className="text-[9px] bg-zinc-100 text-zinc-700 border-zinc-200">auto</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      #{t.odoo_template_id} {t.marca && <> · {t.marca}</>}{t.entalle && <> · {t.entalle}</>}{t.tela && <> · {t.tela}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock por location */}
      {tieneVinculo && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Stock vivo por ubicación (Odoo)
              <Badge variant="outline" className="text-[10px]">{formatNumber(vivo)} pzs</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            {data.stock_por_location.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin stock vivo en ninguna ubicación interna</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                    <th className="text-left py-1.5">Ubicación</th>
                    <th className="text-right py-1.5">Cantidad</th>
                    <th className="text-right py-1.5">% del total</th>
                    <th className="text-right py-1.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock_por_location.map(l => {
                    const pct = vivo > 0 ? (l.qty / vivo) * 100 : 0;
                    return (
                      <tr key={l.location_id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="py-1.5">
                          <div className="font-medium">{l.location_name || `#${l.location_id}`}</div>
                          <div className="text-[10px] text-muted-foreground">{l.location_complete_name}</div>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatNumber(l.qty)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(l.qty * costo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Conciliación */}
      {tieneVinculo && producido > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Conciliación producido vs vivo vs vendido
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4 space-y-3">
            <div className="text-xs space-y-1.5">
              <Row label="(+) Producido (histórico)" value={producido} bold />
              <Row label="(−) Stock vivo en Odoo (todas las ubicaciones internas)" value={-vivo} />
              <Row label="(−) Salidas a clientes (stock_move done internal→customer)" value={-salidaClientes} />
              <div className="border-t pt-1.5">
                <Row label="(=) Diferencia inferida (merma / regalos / transferencias no documentadas)" value={diferencia} bold highlight={Math.abs(diferencia) > 1} />
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-md px-3 py-2 flex gap-2 items-start">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                "Vendido POS" (último período) cuenta las ventas confirmadas en el punto de venta de Odoo.
                "Salidas a clientes" es más amplio: incluye cualquier transferencia <code>internal→customer</code>.
                Si <strong>diferencia</strong> es alta, hay mermas, regalos o ajustes negativos sin registrar.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ingresos de cierre */}
      {data.ingresos_cierre && data.ingresos_cierre.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Ingresos por cierre de producción
              <Badge variant="outline" className="text-[10px]">{data.ingresos_cierre.length} cortes</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                  <th className="text-left py-1.5">Fecha</th>
                  <th className="text-left py-1.5">Origen</th>
                  <th className="text-right py-1.5">Cantidad</th>
                  <th className="text-right py-1.5">Disponible</th>
                  <th className="text-right py-1.5">Costo unit</th>
                  <th className="text-right py-1.5">Valor lote</th>
                </tr>
              </thead>
              <tbody>
                {data.ingresos_cierre.map(ing => (
                  <tr key={ing.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="py-1.5 tabular-nums">{fmtDate(ing.fecha)}</td>
                    <td className="py-1.5">
                      <div className="font-mono text-[11px]">{ing.fin_numero_doc || '—'}</div>
                      <div className="text-[10px] text-muted-foreground">{ing.fin_origen_tipo}</div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{formatNumber(ing.cantidad)}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatNumber(ing.cantidad_disponible)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(ing.costo_unitario)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{formatCurrency(ing.cantidad * ing.costo_unitario)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold text-xs">
                  <td colSpan={2} className="py-1.5">Total</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(producido)}</td>
                  <td className="py-1.5"></td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(costo)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(producido * costo)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Kpi = ({ label, value, sub, color }) => {
  const colorMap = {
    blue: 'text-blue-700 dark:text-blue-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
    violet: 'text-violet-700 dark:text-violet-400',
    amber: 'text-amber-700 dark:text-amber-400',
  };
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{label}</p>
      <p className={`text-2xl mt-1 tabular-nums leading-none ${colorMap[color] || ''}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
};

const Row = ({ label, value, bold, highlight }) => (
  <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''} ${highlight ? 'text-amber-700 dark:text-amber-400' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums">{formatNumber(value)}</span>
  </div>
);

export default PTStockVivo;
