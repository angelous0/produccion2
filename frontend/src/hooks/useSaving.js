import { useState, useRef, useCallback } from 'react';

/**
 * Hook para prevenir envíos duplicados por doble-click.
 * Uso:
 *   const { saving, guard } = useSaving();
 *   const handleSave = guard(async () => { await axios.post(...); });
 *   <Button disabled={saving} onClick={handleSave}>Guardar</Button>
 */
export function useSaving() {
  const [saving, setSaving] = useState(false);
  const ref = useRef(false);

  const guard = useCallback((fn) => async (...args) => {
    if (ref.current) return;
    ref.current = true;
    setSaving(true);
    try {
      return await fn(...args);
    } finally {
      ref.current = false;
      setSaving(false);
    }
  }, []);

  return { saving, guard };
}
