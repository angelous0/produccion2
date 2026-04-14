import { useState } from 'react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Combobox buscable reutilizable.
 * @param {string} value - ID del item seleccionado
 * @param {function} onValueChange - Callback con el nuevo ID
 * @param {Array} options - [{id, nombre, ...}]
 * @param {string} placeholder - Texto placeholder
 * @param {string} searchPlaceholder - Texto del buscador
 * @param {string} emptyMessage - Texto cuando no hay resultados
 * @param {function} renderOption - Render custom para cada opción (opcional)
 * @param {function} renderSelected - Render custom para el item seleccionado (opcional)
 * @param {string} className - Clase CSS adicional
 * @param {string} testId - data-testid
 * @param {boolean} disabled
 */
export const SearchableSelect = ({
  value,
  onValueChange,
  options = [],
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Sin resultados',
  renderOption,
  renderSelected,
  className,
  testId,
  disabled = false,
  popoverWidth = 'w-[320px]',
}) => {
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn('w-full justify-between font-normal', className)}
          disabled={disabled}
          data-testid={testId}
        >
          <span className="truncate">
            {selected
              ? (renderSelected ? renderSelected(selected) : selected.nombre)
              : <span className="text-muted-foreground">{placeholder}</span>
            }
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(popoverWidth, 'p-0')} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={opt.nombre}
                  onSelect={() => {
                    onValueChange(opt.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                  {renderOption ? renderOption(opt) : <span className="truncate">{opt.nombre}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
