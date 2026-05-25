import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

export const MobilePlaceholder = ({ titulo = 'En construcción', volverA = -1 }) => {
  const navigate = useNavigate();
  return (
    <div>
      <div className="m-header">
        <button className="m-h-icon" onClick={() => navigate(volverA)} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{titulo}</div>
        </div>
      </div>

      <div style={{
        padding: 32, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, color: '#64748b',
        marginTop: 40,
      }}>
        <Construction size={56} style={{ color: 'var(--m-brand)', opacity: 0.5 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--m-ink)' }}>{titulo}</h2>
        <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
          Esta pantalla está mockeada y se implementará en próximos sprints.
        </p>
      </div>
    </div>
  );
};

export default MobilePlaceholder;
