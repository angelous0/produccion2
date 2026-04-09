import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus, Trash2 } from 'lucide-react';

export const ProductionMatrix = ({ 
  tallas = [], 
  colores = [], 
  matriz = [], 
  onMatrizChange,
  onAddTalla,
  onRemoveTalla,
  onAddColor,
  onRemoveColor,
  onTallaNameChange,
  onColorNameChange
}) => {
  // Obtener el valor de cantidad para una talla y color específicos
  const getCantidad = (tallaIndex, colorIndex) => {
    const talla = matriz[tallaIndex];
    if (!talla || !talla.colores) return 0;
    const colorData = talla.colores[colorIndex];
    return colorData ? colorData.cantidad : 0;
  };

  // Actualizar cantidad en la matriz
  const handleCantidadChange = (tallaIndex, colorIndex, value) => {
    const cantidad = parseInt(value) || 0;
    const newMatriz = [...matriz];
    
    if (!newMatriz[tallaIndex]) {
      newMatriz[tallaIndex] = { talla: tallas[tallaIndex], colores: [] };
    }
    
    if (!newMatriz[tallaIndex].colores) {
      newMatriz[tallaIndex].colores = [];
    }
    
    // Asegurar que hay suficientes colores
    while (newMatriz[tallaIndex].colores.length <= colorIndex) {
      newMatriz[tallaIndex].colores.push({ 
        color: colores[newMatriz[tallaIndex].colores.length] || '', 
        cantidad: 0 
      });
    }
    
    newMatriz[tallaIndex].colores[colorIndex] = {
      color: colores[colorIndex],
      cantidad: cantidad
    };
    
    onMatrizChange(newMatriz);
  };

  // Calcular total por talla (columna)
  const getTotalTalla = (tallaIndex) => {
    const talla = matriz[tallaIndex];
    if (!talla || !talla.colores) return 0;
    return talla.colores.reduce((sum, c) => sum + (c.cantidad || 0), 0);
  };

  // Calcular total por color (fila)
  const getTotalColor = (colorIndex) => {
    return matriz.reduce((sum, talla) => {
      if (!talla || !talla.colores) return sum;
      const colorData = talla.colores[colorIndex];
      return sum + (colorData ? colorData.cantidad : 0);
    }, 0);
  };

  // Calcular total general
  const getTotalGeneral = () => {
    return matriz.reduce((sum, talla) => {
      if (!talla || !talla.colores) return sum;
      return sum + talla.colores.reduce((s, c) => s + (c.cantidad || 0), 0);
    }, 0);
  };

  return (
    <div className="space-y-4" data-testid="production-matrix">
      {/* Controles para agregar tallas y colores */}
      <div className="flex gap-4 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddTalla}
          data-testid="btn-add-talla"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar Talla
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddColor}
          data-testid="btn-add-color"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar Color
        </Button>
      </div>

      {/* Matriz estilo Excel */}
      {tallas.length > 0 && colores.length > 0 ? (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-muted/50 p-2 border text-xs uppercase tracking-wider font-semibold text-muted-foreground min-w-[120px]">
                  Color / Talla
                </th>
                {tallas.map((talla, tallaIndex) => (
                  <th key={tallaIndex} className="bg-muted/50 p-1 border min-w-[80px]">
                    <div className="flex items-center gap-1">
                      <Input
                        value={talla}
                        onChange={(e) => onTallaNameChange(tallaIndex, e.target.value)}
                        className="h-8 text-center text-xs font-semibold border-0 bg-transparent"
                        placeholder="Talla"
                        data-testid={`input-talla-${tallaIndex}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => onRemoveTalla(tallaIndex)}
                        data-testid={`remove-talla-${tallaIndex}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </th>
                ))}
                <th className="bg-muted/70 p-2 border text-xs uppercase tracking-wider font-semibold min-w-[80px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {colores.map((color, colorIndex) => (
                <tr key={colorIndex}>
                  <td className="bg-muted/30 p-1 border">
                    <div className="flex items-center gap-1">
                      <Input
                        value={color}
                        onChange={(e) => onColorNameChange(colorIndex, e.target.value)}
                        className="h-8 text-sm font-medium border-0 bg-transparent"
                        placeholder="Color"
                        data-testid={`input-color-${colorIndex}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => onRemoveColor(colorIndex)}
                        data-testid={`remove-color-${colorIndex}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                  {tallas.map((_, tallaIndex) => (
                    <td key={tallaIndex} className="p-0 border matrix-cell">
                      <Input
                        type="number"
                        min="0"
                        value={getCantidad(tallaIndex, colorIndex) || ''}
                        onChange={(e) => handleCantidadChange(tallaIndex, colorIndex, e.target.value)}
                        className="h-10 text-center border-0 rounded-none font-mono"
                        placeholder="0"
                        aria-label={`Cantidad ${tallas[tallaIndex]} ${colores[colorIndex]}`}
                        data-testid={`input-cantidad-${tallaIndex}-${colorIndex}`}
                      />
                    </td>
                  ))}
                  <td className="bg-muted/50 p-2 border text-center font-mono font-semibold">
                    {getTotalColor(colorIndex)}
                  </td>
                </tr>
              ))}
              {/* Fila de totales */}
              <tr>
                <td className="bg-muted/70 p-2 border text-xs uppercase tracking-wider font-semibold">
                  Total
                </td>
                {tallas.map((_, tallaIndex) => (
                  <td key={tallaIndex} className="bg-muted/50 p-2 border text-center font-mono font-semibold">
                    {getTotalTalla(tallaIndex)}
                  </td>
                ))}
                <td className="bg-primary/10 p-2 border text-center font-mono font-bold text-primary">
                  {getTotalGeneral()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
          Agrega tallas y colores para crear la matriz de cantidades
        </div>
      )}
    </div>
  );
};
