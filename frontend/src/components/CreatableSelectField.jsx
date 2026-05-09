import { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

/**
 * Select tipo combobox que permite crear nuevas opciones inline.
 *
 * Si la búsqueda no coincide con ninguna opción existente, ofrece un botón
 * "+ Crear «...»" que llama a `onCreate(nombre)`. Esa función debe persistir
 * la nueva opción y devolver el objeto creado (con `id` y `nombre`).
 *
 * @param {string} label
 * @param {boolean} requerido
 * @param {string} hint - Hint en azul (ej. valor de Odoo)
 * @param {string} value - id seleccionado
 * @param {(id: string) => void} onChange
 * @param {Array<{id, nombre}>} options
 * @param {boolean} disabled
 * @param {string} placeholder
 * @param {(nombre: string) => Promise<{id, nombre}>} onCreate - función que crea la opción nueva
 * @param {string} disabledHint - mensaje cuando está deshabilitado para indicar qué falta
 */
const CreatableSelectField = ({
  label,
  requerido,
  hint,
  value,
  onChange,
  options = [],
  disabled,
  placeholder = 'Seleccionar',
  onCreate,
  disabledHint,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = options.find(o => o.id === value);

  const norm = s => (s || '').trim().toLowerCase();
  const searchTrim = search.trim();
  const yaExiste = options.some(o => norm(o.nombre) === norm(searchTrim));
  const mostrarBotonCrear = onCreate && !disabled && searchTrim.length >= 2 && !yaExiste;

  const handleCreate = async () => {
    if (creating || !onCreate || !searchTrim) return;
    setCreating(true);
    try {
      const nuevo = await onCreate(searchTrim);
      if (nuevo?.id) {
        onChange(nuevo.id);
        setOpen(false);
        setSearch('');
        toast.success(`«${nuevo.nombre}» creado y seleccionado`);
      }
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Error al crear';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">
          {label} {requerido && <span className="text-destructive">*</span>}
        </Label>
        {hint && (
          <span
            className="text-[10px] text-muted-foreground italic truncate max-w-[60%]"
            title={`Dato de Odoo: ${hint}`}
          >
            Odoo: <span className="font-medium text-blue-600 dark:text-blue-400">{hint}</span>
          </span>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-9 w-full justify-between font-normal text-sm"
            title={disabled && disabledHint ? disabledHint : ''}
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.nombre || (disabled && disabledHint ? disabledHint : placeholder)}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={true}>
            <CommandInput
              placeholder={`Buscar o escribir nuevo ${label.toLowerCase()}...`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[260px]" onWheel={e => e.stopPropagation()}>
              <CommandEmpty>
                {mostrarBotonCrear ? (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="w-full flex items-center justify-center gap-2 px-2 py-2 text-sm text-primary hover:bg-accent rounded-sm"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Crear «{searchTrim}»
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Sin resultados</span>
                )}
              </CommandEmpty>
              {value && (
                <CommandGroup heading="Acciones">
                  <CommandItem
                    onSelect={() => { onChange(''); setOpen(false); }}
                    value="__limpiar__"
                    className="text-muted-foreground italic"
                  >
                    — Sin asignar —
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {options.map(o => (
                  <CommandItem
                    key={o.id}
                    value={`${o.nombre} ${o.id}`}
                    onSelect={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{o.nombre}</span>
                  </CommandItem>
                ))}
                {mostrarBotonCrear && options.length > 0 && (
                  <CommandItem
                    value={`__crear_${searchTrim}`}
                    onSelect={handleCreate}
                    className="text-primary border-t mt-1 pt-2"
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Crear «{searchTrim}»
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CreatableSelectField;
