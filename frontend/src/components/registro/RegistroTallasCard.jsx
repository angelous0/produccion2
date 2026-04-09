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
import { Separator } from '../ui/separator';
import { NumericInput } from '../ui/numeric-input';
import { Trash2, Palette } from 'lucide-react';

export const RegistroTallasCard = ({
  tallasSeleccionadas, tallasDisponibles,
  onAddTalla, onCantidadChange, onRemoveTalla,
  tieneColores, onOpenColoresDialog, distribucionColores,
}) => {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tallas y Cantidades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select onValueChange={onAddTalla}>
            <SelectTrigger className="w-[200px]" data-testid="select-agregar-talla">
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
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Talla</TableHead>
                  <TableHead className="font-semibold w-[150px]">Cantidad</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tallasSeleccionadas.map((t) => (
                  <TableRow key={t.talla_id}>
                    <TableCell className="font-medium">{t.talla_nombre}</TableCell>
                    <TableCell>
                      <NumericInput
                        min="0"
                        value={t.cantidad}
                        onChange={(e) => onCantidadChange(t.talla_id, e.target.value)}
                        className="w-full font-mono text-center"
                        placeholder="0"
                        data-testid={`input-cantidad-talla-${t.talla_id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveTalla(t.talla_id)}
                        data-testid={`remove-talla-${t.talla_id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="font-mono font-bold text-center text-lg">
                    {tallasSeleccionadas.reduce((sum, t) => sum + (t.cantidad || 0), 0)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
            Selecciona tallas del catálogo para agregar cantidades
          </div>
        )}

        {/* Botón Agregar Colores */}
        {tallasSeleccionadas.length > 0 && (
          <div className="pt-4">
            <Separator className="mb-4" />
            <Button
              type="button"
              variant={tieneColores ? "default" : "outline"}
              onClick={onOpenColoresDialog}
              className="w-full"
              data-testid="btn-agregar-colores"
            >
              <Palette className="h-4 w-4 mr-2" />
              {tieneColores ? 'Editar Colores' : 'Agregar Colores'}
              {tieneColores && (
                <Badge variant="secondary" className="ml-2">
                  {distribucionColores.reduce((sum, t) => sum + (t.colores?.length || 0), 0)} colores
                </Badge>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
