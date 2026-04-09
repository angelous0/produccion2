import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Combobox buscable para seleccionar Color General y (opcional) crearlo inline.
 *
 * Props:
 * - options: [{id, nombre, orden?}]
 * - value: id seleccionado (string)
 * - onChange: (id:string) => void
 * - onCreate: async (nombre:string) => {id, nombre} | void
 */
export const ColorGeneralCombobox = ({
  options = [],
  value = '',
  onChange,
  onCreate,
  placeholder = 'Seleccionar color general',
}) => {
  const [open, setOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newNombre, setNewNombre] = React.useState('');
  const selected = options.find((o) => o.id === value);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newNombre.trim()) return;
    if (!onCreate) return;

    const created = await onCreate(newNombre.trim());
    setCreateOpen(false);
    setNewNombre('');

    if (created?.id) {
      onChange?.(created.id);
      setOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="color-general-combobox-trigger"
          >
            <span className={cn(!selected && 'text-muted-foreground')}>
              {selected ? selected.nombre : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar color general..." />
            <CommandList>
              <CommandEmpty>No se encontraron resultados.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.nombre}
                    onSelect={() => {
                      onChange?.(o.id);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === o.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {o.nombre}
                  </CommandItem>
                ))}

                {!!onCreate && (
                  <CommandItem
                    value="__create__"
                    onSelect={() => {
                      setCreateOpen(true);
                    }}
                    className="cursor-pointer text-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Crear color general
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Color General</DialogTitle>
            <DialogDescription>
              Crea una categoría general (ej. Celeste, Azul, Rojo) para agrupar tonalidades.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-2 py-2">
              <Label htmlFor="nuevo_color_general">Nombre</Label>
              <Input
                id="nuevo_color_general"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="Ej: Celeste"
                autoFocus
                data-testid="input-nuevo-color-general-inline"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" data-testid="btn-crear-color-general-inline">
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ColorGeneralCombobox;
