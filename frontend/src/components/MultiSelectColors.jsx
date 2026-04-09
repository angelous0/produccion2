import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export const MultiSelectColors = ({
  options = [],
  selected = [],
  onChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "No se encontraron resultados.",
}) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (option) => {
    const isSelected = selected.find((s) => s.id === option.id);
    if (isSelected) {
      onChange(selected.filter((s) => s.id !== option.id));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleRemove = (e, optionId) => {
    e.stopPropagation();
    onChange(selected.filter((s) => s.id !== optionId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
          data-testid="multiselect-colors-trigger"
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((option) => (
                <Badge
                  key={option.id}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <div
                    className="w-3 h-3 rounded-sm border"
                    style={{ backgroundColor: option.codigo_hex || "#ccc" }}
                  />
                  <span className="text-xs">{option.nombre}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemove(e, option.id)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.find((s) => s.id === option.id);
                return (
                  <CommandItem
                    key={option.id}
                    value={option.nombre}
                    onSelect={() => handleSelect(option)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "opacity-50"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div
                      className="w-5 h-5 rounded border mr-2"
                      style={{ backgroundColor: option.codigo_hex || "#ccc" }}
                    />
                    <span>{option.nombre}</span>
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
