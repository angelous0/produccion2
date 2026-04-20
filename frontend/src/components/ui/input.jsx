import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, onWheel, ...props }, ref) => {
  // En inputs numéricos, evitar que la rueda del mouse / scroll del trackpad
  // cambie el valor (comportamiento nativo muy molesto al hacer scroll en
  // formularios largos). Blurea el input para que el scroll pase al contenedor.
  // Si el usuario quiere seguir editando, vuelve a hacer click en el campo.
  const handleWheel = React.useCallback((e) => {
    if (type === 'number' && e.target === document.activeElement) {
      e.target.blur();
    }
    if (onWheel) onWheel(e);
  }, [type, onWheel]);

  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      onWheel={handleWheel}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
