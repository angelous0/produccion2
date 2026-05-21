// Componentes visuales para el diagnóstico de balance de conciliación.
// Se usan en /reportes/conciliacion-pendiente y /reportes/cortes.
//
// El balance descompone el "pendiente Odoo" de un corte en sus causas reales:
//   - fallados_sin_enviar:      detectados como fallados pero no mandados a arreglo aún
//   - en_arreglo_proceso:       enviados a arreglo y aún no han vuelto
//   - recuperadas_sin_ingresar: ya volvieron OK pero falta hacer el ajuste Odoo
//   - a_merma_o_tela:           informativo, ya descontadas del flujo
//   - inexplicable:             residual sospechoso → recuento físico
//
// Fórmula validada en corte 043 (DORIAN, 12 pendientes):
//   producido (619) - ingresado (607) = 12
//   = fallados_sin_enviar (33-27=6) + en_arreglo (0) + recuperadas_sin_ingresar (6)
import { Button } from './ui/button';
import {
  Wrench, ClipboardCheck, Trash2, HelpCircle, ShoppingCart, ClipboardList, Link2,
} from 'lucide-react';

export const CAUSAS_CONCILIACION = {
  fallados_sin_enviar: {
    label: 'Fallados sin enviar a arreglo',
    short: 'Sin enviar',
    Icon:  ClipboardList,
    cls:   'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
    accion: 'Enviar las prendas a arreglo (Calidad → Fallados)',
  },
  en_arreglo_proceso: {
    label: 'En proceso de arreglo',
    short: 'En arreglo',
    Icon:  Wrench,
    cls:   'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
    accion: 'Esperar retorno del servicio externo',
  },
  recuperadas_sin_ingresar: {
    label: 'Recuperadas, falta ajuste Odoo',
    short: 'Falta Odoo',
    Icon:  ShoppingCart,
    cls:   'border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900',
    accion: 'Hacer el ajuste de inventario en Odoo y vincular al corte',
  },
  a_merma_o_tela: {
    label: 'A merma / pasa a tela',
    short: 'Merma/tela',
    Icon:  Trash2,
    cls:   'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-800',
    accion: 'Informativo — ya descontadas del flujo',
  },
  inexplicable: {
    label: 'Diferencia inexplicable',
    short: 'Inexplicable',
    Icon:  HelpCircle,
    cls:   'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900',
    accion: 'Hacer recuento físico — posible extravío o ajuste mal hecho',
  },
};

// Chip compacto que cabe en una fila de tabla. Muestra solo las causas > 0.
export const BalanceChip = ({ balance, pendiente }) => {
  if (!balance) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const items = Object.entries(CAUSAS_CONCILIACION)
    .map(([key, cfg]) => ({ key, cfg, count: balance[key] || 0 }))
    .filter(i => i.count > 0);

  if (items.length === 0) {
    if (pendiente > 0) {
      return <span className="text-[10px] text-muted-foreground italic">Sin desglose</span>;
    }
    return <span className="text-[10px] text-emerald-700">✓</span>;
  }

  const tooltip = items.map(i => `${i.cfg.label}: ${i.count}`).join('\n');
  return (
    <div className="inline-flex items-center gap-1 flex-wrap" title={tooltip}>
      {items.map(({ key, cfg, count }) => {
        const I = cfg.Icon;
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] border ${cfg.cls}`}
          >
            <I className="h-2.5 w-2.5" />
            <span className="font-mono font-semibold">{count}</span>
          </span>
        );
      })}
    </div>
  );
};

// Panel completo de balance para el drill-down. Muestra todas las causas
// (incluso las en 0) + totales informativos + botones de acción contextuales.
export const BalancePanel = ({ balance, pendiente, onVerCorte, onAjustarOdoo }) => {
  if (!balance) return null;
  const items = Object.entries(CAUSAS_CONCILIACION).map(([key, cfg]) => ({
    key, cfg, count: balance[key] || 0,
  }));
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3 flex-wrap">
          <span><strong className="text-foreground">{balance.producido}</strong> producidas</span>
          <span>·</span>
          <span><strong className="text-foreground">{balance.fallados_detectados}</strong> fallados detectados</span>
          <span>·</span>
          <span><strong className="text-foreground">{balance.arreglos_recuperadas}</strong> recuperadas de arreglo</span>
          {balance.mermas_directas > 0 && (
            <>
              <span>·</span>
              <span><strong className="text-foreground">{balance.mermas_directas}</strong> mermas</span>
            </>
          )}
          {balance.dias_en_estado != null && (
            <>
              <span>·</span>
              <span><strong className="text-foreground">{balance.dias_en_estado}</strong>d en estado</span>
            </>
          )}
        </div>
      </div>
      <div className="border-t pt-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          Descomposición del pendiente ({pendiente})
        </div>
        <div className="space-y-1">
          {items.map(({ key, cfg, count }) => {
            const I = cfg.Icon;
            const active = count > 0;
            return (
              <div
                key={key}
                className={`flex items-center gap-2 text-xs ${active ? '' : 'opacity-40'}`}
              >
                <span className={`inline-flex items-center justify-center h-6 w-6 rounded ${cfg.cls}`}>
                  <I className="h-3 w-3" />
                </span>
                <span className="flex-1">
                  <span className="font-medium">{cfg.label}</span>
                  <span className="text-muted-foreground ml-2 text-[11px]">— {cfg.accion}</span>
                </span>
                <span className={`font-mono font-bold text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {(onVerCorte || onAjustarOdoo) && (
        <div className="border-t pt-2 flex items-center gap-2 flex-wrap">
          {balance.fallados_sin_enviar > 0 && onVerCorte && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onVerCorte}>
              <ClipboardCheck className="h-3 w-3" />
              Abrir corte para gestionar fallados
            </Button>
          )}
          {balance.recuperadas_sin_ingresar > 0 && onAjustarOdoo && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onAjustarOdoo}>
              <Link2 className="h-3 w-3" />
              Editar Distribución / hacer ajuste Odoo
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
