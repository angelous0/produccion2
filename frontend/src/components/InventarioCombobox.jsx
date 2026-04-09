import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Combobox buscable para Inventario (prod_inventario).
 * Busca por nombre y código.
 *
 * Props:
 * - options: [{id, nombre, codigo}]
 * - value: inventario_id
 * - onChange(id)
 */
export const InventarioCombobox = ({ options = [], value = '', onChange, placeholder = 'Seleccionar item...' }) => {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.id === value);

  const label = selected
    ? `${selected.codigo ? `${selected.codigo} - ` : ''}${selected.nombre}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid="inventario-combobox-trigger"
        >
          <span className={cn(!selected && 'text-muted-foreground')}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command filter={(value, search) => {
          const s = search.toLowerCase();
          return value.toLowerCase().includes(s) ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar por nombre o código..." />
          <CommandList>
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const v = `${o.codigo || ''} ${o.nombre || ''}`.trim();
                return (
                  <CommandItem
                    key={o.id}
                    value={v}
                    onSelect={() => {
                      onChange?.(o.id);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="font-mono text-xs text-muted-foreground mr-2">{o.codigo || ''}</span>
                    <span>{o.nombre}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default InventarioCombobox;
