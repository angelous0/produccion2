import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { GripVertical } from 'lucide-react';
import { TableRow, TableCell } from './ui/table';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Fila sorteable individual
export const SortableRow = ({ id, children, disabled = false }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`data-table-row ${isDragging ? 'bg-muted' : ''}`}
      data-testid={`sortable-row-${id}`}
    >
      <TableCell className="w-[40px] cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </TableCell>
      {children}
    </TableRow>
  );
};

// Hook para manejar el ordenamiento
export const useSortableTable = (items, setItems, endpoint, getItemId) => {
  const [isSaving, setIsSaving] = useState(false);
  
  // Función para obtener el ID de un item
  const getId = getItemId || ((i) => i.id || i.__tempId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => getId(item) === active.id);
    const newIndex = items.findIndex((item) => getId(item) === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const newItems = arrayMove(items, oldIndex, newIndex);
    
    // Actualizar orden localmente
    const itemsWithNewOrder = newItems.map((item, index) => ({
      ...item,
      orden: index + 1,
    }));
    
    setItems(itemsWithNewOrder);
    
    // Solo guardar en backend si hay items con id real (no drafts)
    const persistedItems = itemsWithNewOrder.filter((item) => item.id);
    if (persistedItems.length === 0) return;
    
    // Guardar en backend
    setIsSaving(true);
    try {
      const url = endpoint.includes('/') ? `${API}/${endpoint}` : `${API}/reorder/${endpoint}`;

      await axios.put(url, {
        items: persistedItems.map((item, index) => ({
          id: item.id,
          orden: index + 1,
        })),
      });
      toast.success('Orden guardado');
    } catch (error) {
      toast.error('Error al guardar orden');
      // Revertir cambio si falla
      setItems(items);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    sensors,
    handleDragEnd,
    isSaving,
    modifiers: [restrictToVerticalAxis],
  };
};

// Componente wrapper para el contexto DnD
export const SortableTableWrapper = ({ children, items, sensors, handleDragEnd, modifiers, getItemId }) => {
  // Función para obtener el ID de un item (por defecto usa i.id, pero se puede personalizar)
  const getId = getItemId || ((i) => i.id || i.__tempId);
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={modifiers}
    >
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
};
