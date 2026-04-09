import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { NumericInput } from '../ui/numeric-input';
import { Trash2, Palette } from 'lucide-react';

export const RegistroTallasCard = ({
  tallasSeleccionadas, tallasDisponibles,
  onAddTalla, onCantidadChange, onRemoveTalla,
  tieneColores, onOpenColoresDialog, distribucionColores,
}) => {
  const totalPrendas = tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0);
  const totalColores = tieneColores
    ? distribucionColores.reduce((sum, t) => sum + (t.colores?.length || 0), 0)
    : 0;

  return (
    <div className="registro-tallas-card">
      <div className="registro-tallas-header">
        <span className="registro-panel-section-label">Tallas y Cantidades</span>
        <span className="registro-tallas-total">{totalPrendas}</span>
      </div>

      <div className="registro-tallas-body">
        <div className="flex gap-2">
          <Select onValueChange={onAddTalla}>
            <SelectTrigger className="w-[220px]" data-testid="select-agregar-talla">
              <SelectValue placeholder="Agregar talla..." />
            </SelectTrigger>
            <SelectContent>
              {tallasDisponibles.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tallasSeleccionadas.length > 0 ? (
          <div className="registro-mov-table-wrap">
            <Table>
              <TableHeader>
                <TableRow className="registro-mov-thead">
                  <TableHead className="registro-mov-th">Talla</TableHead>
                  <TableHead className="registro-mov-th w-[150px]">Cantidad</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tallasSeleccionadas.map((t) => (
                  <TableRow key={t.talla_id} className="registro-mov-row">
                    <TableCell className="font-medium text-sm">{t.talla_nombre}</TableCell>
                    <TableCell>
                      <NumericInput
                        min="0"
                        value={t.cantidad}
                        onChange={(e) => onCantidadChange(t.talla_id, e.target.value)}
                        className="w-full font-mono text-center text-sm"
                        placeholder="0"
                        data-testid={`input-cantidad-talla-${t.talla_id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onRemoveTalla(t.talla_id)}
                        data-testid={`remove-talla-${t.talla_id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="registro-mov-footer-row">
                  <TableCell className="registro-mov-footer-label">Total</TableCell>
                  <TableCell className="registro-mov-footer-value text-center">
                    {totalPrendas}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="registro-mov-empty" style={{ padding: '32px 16px' }}>
            <p className="font-medium text-sm">Selecciona tallas del catálogo</p>
            <p className="text-xs mt-1 opacity-70">Agrega cantidades para cada talla</p>
          </div>
        )}

        {/* Botón Colores */}
        {tallasSeleccionadas.length > 0 && (
          <Button
            type="button"
            variant={tieneColores ? "default" : "outline"}
            onClick={onOpenColoresDialog}
            className="w-full h-10"
            data-testid="btn-agregar-colores"
          >
            <Palette className="h-4 w-4 mr-2" />
            {tieneColores ? 'Editar Colores' : 'Agregar Colores'}
            {tieneColores && totalColores > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {totalColores} colores
              </Badge>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
