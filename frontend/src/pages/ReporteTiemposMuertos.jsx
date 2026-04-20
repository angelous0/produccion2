import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import {
  Clock, AlertTriangle, PauseCircle, ExternalLink, RefreshCw,
  Search, ChevronDown, ChevronRight, Timer, Download, MessageSquareWarning,
  Plus, Check, Trash2, X,
} from 'lucide-react';

import { formatDate } from '../lib/dateUtils';

const API = process.env.REACT_APP_BACKEND_URL;

const NIVEL_CONFIG = {
  critico:  { label: 'Crítico',   color: 'bg-red-100 text-red-800 border-red-200', rowClass: 'bg-red-50/50' },
  atencion: { label: 'Atención',  color: 'bg-amber-100 text-amber-800 border-amber-200', rowClass: 'bg-amber-50/50' },
  espera:   { label: 'En espera', color: 'bg-blue-100 text-blue-800 border-blue-200', rowClass: '' },
  ok:       { label: 'OK',        color: 'bg-transparent text-muted-foreground border-transparent', rowClass: '' },
};

const KpiCard = ({ label, value, icon: Icon, danger }) => (
  <Card className={danger && value > 0 ? 'border-red-200 bg-red-50/30' : ''}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${danger && value > 0 ? 'bg-red-100' : 'bg-muted'}`}>
        <Icon className={`h-4 w-4 ${danger && value > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={`text-xl font-bold ${danger && value > 0 ? 'text-red-700' : ''}`}>{value}</p>
      </div>
    </CardContent>
  </Card>
);


export const ReporteTiemposMuertos = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('en_curso');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('__all');
  const [sortDesc, setSortDesc] = useState(true);

  // Incidencia panel
  const [panelItem, setPanelItem] = useState(null); // item del reporte seleccionado
  const [incidencias, setIncidencias] = useState([]);
  const [loadingInc, setLoadingInc] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [showResueltas, setShowResueltas] = useState(false);
  // Nueva incidencia form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newMotivoId, setNewMotivoId] = useState('');
  const [newComentario, setNewComentario] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = filtro === 'todos' ? '?incluir_resueltos=true' : '';
      const res = await axios.get(`${API}/api/reportes-produccion/tiempos-muertos${params}`);
      setData(res.data);
    } catch {
      toast.error('Error al cargar reporte');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filtro]);

  // Cargar motivos una vez
  useEffect(() => {
    axios.get(`${API}/api/motivos-incidencia`).then(r => setMotivos(r.data)).catch(() => {});
  }, []);

  const openPanel = useCallback(async (item) => {
    setPanelItem(item);
    setShowResueltas(false);
    setShowNewForm(false);
    setLoadingInc(true);
    try {
      const res = await axios.get(`${API}/api/incidencias/${item.registro_id}`);
      setIncidencias(res.data);
    } catch {
      toast.error('Error al cargar incidencias');
    }
    setLoadingInc(false);
  }, []);

  const handleCrearIncidencia = async () => {
    if (!newMotivoId) { toast.error('Selecciona un motivo'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/api/incidencias`, {
        registro_id: panelItem.registro_id,
        motivo_id: newMotivoId,
        comentario: newComentario.trim() || null,
      });
      toast.success('Incidencia registrada');
      setShowNewForm(false);
      setNewMotivoId('');
      setNewComentario('');
      // Refresh incidencias + reporte
      openPanel(panelItem);
      fetchData();
    } catch {
      toast.error('Error al crear incidencia');
    }
    setSaving(false);
  };

  const handleResolver = async (incId) => {
    try {
      await axios.put(`${API}/api/incidencias/${incId}`, { estado: 'RESUELTA' });
      toast.success('Incidencia resuelta');
      openPanel(panelItem);
      fetchData();
    } catch {
      toast.error('Error al resolver');
    }
  };

  const handleEliminar = async (incId) => {
    if (!window.confirm('¿Eliminar esta incidencia?')) return;
    try {
      await axios.delete(`${API}/api/incidencias/${incId}`);
      toast.success('Incidencia eliminada');
      openPanel(panelItem);
      fetchData();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // Estados únicos que aparecen en la data actual (para poblar el filtro)
  const estadosDisponibles = useMemo(() => {
    if (!data?.items) return [];
    const set = new Set(data.items.map(it => it.estado_actual).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      items = items.filter(b =>
        (b.n_corte || '').toLowerCase().includes(q) ||
        (b.modelo || '').toLowerCase().includes(q) ||
        (b.marca || '').toLowerCase().includes(q) ||
        (b.tipo || '').toLowerCase().includes(q) ||
        (b.entalle || '').toLowerCase().includes(q) ||
        (b.tela || '').toLowerCase().includes(q) ||
        (b.hilo_especifico || '').toLowerCase().includes(q) ||
        (b.ultimo_servicio || '').toLowerCase().includes(q) ||
        (b.ultima_persona || '').toLowerCase().includes(q) ||
        (b.estado_actual || '').toLowerCase().includes(q)
      );
    }
    if (filtroEstado && filtroEstado !== '__all') {
      items = items.filter(b => b.estado_actual === filtroEstado);
    }
    items = [...items].sort((a, b) => sortDesc ? b.dias_parado - a.dias_parado : a.dias_parado - b.dias_parado);
    return items;
  }, [data, busqueda, filtroEstado, sortDesc]);

  const resumen = data?.resumen || {};

  const handleExportExcel = async () => {
    if (!filtered.length) return;
    const XLSX = (await import('xlsx')).default || await import('xlsx');
    const wsData = [
      ['Corte', 'Modelo', 'Marca', 'Tipo', 'Entalle', 'Tela', 'Hilo Esp.', 'Último Servicio', 'Persona', 'Terminó', 'Estado Actual', 'Motivo', 'Días Parado', 'Inc. Abiertas', 'Nivel'],
      ...filtered.map(r => [
        r.n_corte + (r.urgente ? ' (URG)' : ''),
        r.modelo || '',
        r.marca || '',
        r.tipo || '',
        r.entalle || '',
        r.tela || '',
        r.hilo_especifico || '',
        r.ultimo_servicio,
        r.ultima_persona || '',
        formatDate(r.fecha_termino),
        r.estado_actual,
        r.motivo || 'Sin motivo',
        r.dias_parado,
        r.inc_abiertas || 0,
        (NIVEL_CONFIG[r.nivel] || NIVEL_CONFIG.ok).label,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:12},{wch:20},{wch:14},{wch:14},{wch:14},{wch:14},{wch:16},{wch:18},{wch:18},{wch:14},{wch:16},{wch:18},{wch:12},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tiempos Muertos');
    XLSX.writeFile(wb, `tiempos_muertos_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Excel exportado');
  };

  const handleExportPDF = async () => {
    if (!filtered.length) return;
    const jsPDFMod = await import('jspdf');
    const jsPDF = jsPDFMod.default || jsPDFMod.jsPDF;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Tiempos Muertos — Lotes Parados', 14, 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}  |  Lotes: ${filtered.length}  |  Días acumulados: ${resumen.dias_perdidos || 0}`, 14, 20);
    doc.setTextColor(0);

    // KPI bar
    const kpiY = 24;
    const kpiItems = [
      { label: 'Lotes Parados', val: resumen.total || 0 },
      { label: 'En Espera', val: resumen.en_espera || 0, danger: true },
      { label: 'Críticos (7+d)', val: resumen.criticos || 0, danger: true },
      { label: 'Sin Motivo', val: resumen.sin_motivo || 0, danger: true },
      { label: 'Días Acumulados', val: resumen.dias_perdidos || 0, danger: true },
    ];
    const kpiW = (pageW - 28) / kpiItems.length;
    kpiItems.forEach((k, i) => {
      const x = 14 + i * kpiW;
      doc.setFillColor(k.danger && k.val > 0 ? 254 : 245, k.danger && k.val > 0 ? 242 : 245, k.danger && k.val > 0 ? 242 : 245);
      doc.roundedRect(x, kpiY, kpiW - 2, 10, 1.5, 1.5, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(k.label.toUpperCase(), x + 2, kpiY + 3.5);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(k.danger && k.val > 0 ? 180 : 30, k.danger && k.val > 0 ? 30 : 30, k.danger && k.val > 0 ? 30 : 30);
      doc.text(String(k.val), x + 2, kpiY + 8.5);
    });
    doc.setTextColor(0);

    const nivelColors = { critico: [254,226,226], atencion: [254,243,199], espera: [219,234,254] };
    const nivelTextColors = { critico: [153,27,27], atencion: [146,64,14], espera: [30,64,175] };

    const headers = [['Corte', 'Modelo', 'Marca', 'Tipo', 'Entalle', 'Tela', 'Hilo Esp.', 'Últ. Servicio', 'Persona', 'Terminó', 'Estado', 'Motivo', 'Días', 'Inc.', 'Nivel']];
    const body = filtered.map(r => [
      r.n_corte,
      r.modelo || '',
      r.marca || '',
      r.tipo || '',
      r.entalle || '',
      r.tela || '',
      r.hilo_especifico || '',
      r.ultimo_servicio,
      r.ultima_persona || '',
      formatDate(r.fecha_termino),
      r.estado_actual,
      r.motivo || '-',
      String(r.dias_parado),
      r.inc_abiertas > 0 ? String(r.inc_abiertas) : '-',
      (NIVEL_CONFIG[r.nivel] || NIVEL_CONFIG.ok).label,
    ]);

    autoTable(doc, {
      startY: 36,
      head: headers,
      body: body,
      theme: 'grid',
      styles: { fontSize: 5.5, cellPadding: 1.2, lineColor: [220,220,220], lineWidth: 0.2, overflow: 'ellipsize' },
      headStyles: { fillColor: [30,41,59], textColor: 255, fontSize: 5, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 22 },
        2: { cellWidth: 16 },
        3: { cellWidth: 18 },
        4: { cellWidth: 16 },
        5: { cellWidth: 16 },
        6: { cellWidth: 16 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 },
        9: { cellWidth: 16, halign: 'center' },
        10: { cellWidth: 18, halign: 'center' },
        11: { cellWidth: 20 },
        12: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
        13: { cellWidth: 9, halign: 'center' },
        14: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const row = filtered[data.row.index];
        if (!row) return;

        // Urgente: corte red
        if (data.column.index === 0 && row.urgente) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [153, 27, 27];
        }

        // Motivo: amber if present, gray italic if not
        if (data.column.index === 11 && !row.motivo) {
          data.cell.styles.textColor = [150, 150, 150];
          data.cell.styles.fontStyle = 'italic';
        }

        // Días parado: color by severity
        if (data.column.index === 12) {
          if (row.dias_parado >= 7) {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
          } else if (row.dias_parado >= 3) {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [146, 64, 14];
          }
        }

        // Inc. abiertas: red if > 0
        if (data.column.index === 13 && row.inc_abiertas > 0) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [153, 27, 27];
          data.cell.styles.fontStyle = 'bold';
        }

        // Nivel: color badge
        if (data.column.index === 14 && row.nivel !== 'ok') {
          const bg = nivelColors[row.nivel];
          const tc = nivelTextColors[row.nivel];
          if (bg) {
            data.cell.styles.fillColor = bg;
            data.cell.styles.textColor = tc;
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
      doc.text('Producción Textil — Tiempos Muertos', 14, doc.internal.pageSize.getHeight() - 5);
    }

    doc.save(`tiempos_muertos_${new Date().toISOString().slice(0,10)}.pdf`);
    toast.success('PDF exportado');
  };

  return (
    <div className="space-y-4" data-testid="reporte-tiempos-muertos">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tiempos Muertos</h2>
          <p className="text-sm text-muted-foreground">Lotes parados sin avanzar al siguiente servicio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border text-sm overflow-hidden">
            <button type="button" onClick={() => setFiltro('en_curso')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${filtro === 'en_curso' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>En espera</button>
            <button type="button" onClick={() => setFiltro('todos')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${filtro === 'todos' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Todos</button>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!filtered.length} data-testid="btn-exportar-excel-tm">
            <Download className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length} data-testid="btn-exportar-pdf-tm">
            <Download className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} data-testid="btn-refresh-tm">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Lotes parados" value={resumen.total || 0} icon={Timer} />
        <KpiCard label="En espera" value={resumen.en_espera || 0} icon={PauseCircle} danger />
        <KpiCard label="Críticos (7+ días)" value={resumen.criticos || 0} icon={AlertTriangle} danger />
        <KpiCard label="Sin motivo" value={resumen.sin_motivo || 0} icon={MessageSquareWarning} danger />
        <KpiCard label="Días acumulados" value={resumen.dias_perdidos || 0} icon={Clock} danger />
      </div>

      {/* Búsqueda + filtro por estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar corte, modelo, servicio, estado..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="h-8 pl-8 text-xs"
            data-testid="busqueda-tm"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="h-8 w-[200px] text-xs" data-testid="filtro-estado-tm">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los estados</SelectItem>
            {estadosDisponibles.map(e => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtroEstado !== '__all' && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFiltroEstado('__all')}>
            Limpiar
          </Button>
        )}
        <div className="text-xs text-muted-foreground ml-auto">
          {filtered.length} de {data?.items?.length || 0}
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {filtro === 'en_curso'
              ? 'Sin lotes parados entre servicios'
              : 'No se encontraron registros'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Corte</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Modelo</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Marca</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Entalle</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Tela</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Hilo Esp.</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Último Servicio</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Persona</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Terminó</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Estado Actual</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Motivo</th>
                  <th
                    className="text-center p-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground group"
                    onClick={() => setSortDesc(p => !p)}
                  >
                    Días parado {sortDesc ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3 rotate-[-90deg]" />}
                  </th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Inc.</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Nivel</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const cfg = NIVEL_CONFIG[item.nivel] || NIVEL_CONFIG.ok;
                  return (
                    <tr key={`${item.registro_id}-${idx}`} className={`border-t hover:bg-muted/30 transition-colors ${cfg.rowClass}`} data-testid={`tm-row-${item.n_corte}`}>
                      <td className="p-2.5 font-mono font-semibold whitespace-nowrap">
                        {item.n_corte}
                        {item.urgente && <span className="ml-1 text-[9px] text-red-600 font-bold">URG</span>}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">{item.modelo || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.marca || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.tipo || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.entalle || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.tela || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.hilo_especifico || '-'}</td>
                      <td className="p-2.5 whitespace-nowrap font-medium">{item.ultimo_servicio}</td>
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{item.ultima_persona || '-'}</td>
                      <td className="p-2.5 text-center whitespace-nowrap">{formatDate(item.fecha_termino)}</td>
                      <td className="p-2.5 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px]">{item.estado_actual}</Badge>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {item.motivo ? (
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200">{item.motivo}</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Sin motivo</span>
                        )}
                      </td>
                      <td className={`p-2.5 text-center font-mono font-bold whitespace-nowrap ${
                        item.dias_parado >= 7 ? 'bg-red-100 text-red-700' :
                        item.dias_parado >= 3 ? 'bg-amber-100 text-amber-700' : ''
                      }`}>
                        {item.dias_parado}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        {item.inc_abiertas > 0 ? (
                          <Badge className="text-[10px] bg-red-100 text-red-700 border border-red-200">{item.inc_abiertas}</Badge>
                        ) : item.inc_total > 0 ? (
                          <span className="text-[10px] text-muted-foreground">{item.inc_total}</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {item.nivel === 'ok' ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <Badge className={`${cfg.color} text-[10px] border`}>{cfg.label}</Badge>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            type="button" variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => openPanel(item)}
                            title="Gestionar incidencias"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => navigate(`/registros/editar/${item.registro_id}`)}
                            title="Abrir registro"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Panel de incidencias */}
      <Dialog open={!!panelItem} onOpenChange={(open) => { if (!open) setPanelItem(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Incidencias — {panelItem?.n_corte}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {panelItem?.modelo} · {panelItem?.ultimo_servicio} · {panelItem?.dias_parado}d parado
            </p>
          </DialogHeader>

          {loadingInc ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
          ) : (
            <div className="space-y-3">
              {/* Botón nueva incidencia */}
              {!showNewForm && (
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setShowNewForm(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nueva incidencia
                </Button>
              )}

              {/* Form nueva incidencia */}
              {showNewForm && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Nueva incidencia</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewForm(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Select value={newMotivoId} onValueChange={setNewMotivoId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar motivo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {motivos.map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Comentario (opcional)"
                    value={newComentario}
                    onChange={e => setNewComentario(e.target.value)}
                    className="text-xs min-h-[60px]"
                  />
                  <Button type="button" size="sm" className="w-full" onClick={handleCrearIncidencia} disabled={saving}>
                    {saving ? 'Guardando...' : 'Registrar incidencia'}
                  </Button>
                </div>
              )}

              {/* Incidencias abiertas */}
              {incidencias.filter(i => i.estado === 'ABIERTA').length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Abiertas</p>
                  {incidencias.filter(i => i.estado === 'ABIERTA').map(inc => (
                    <div key={inc.id} className="flex items-start gap-2 p-3 rounded-lg border bg-amber-50/80 border-amber-200">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="destructive" className="text-[10px]">ABIERTA</Badge>
                          <span className="font-semibold text-xs">{inc.motivo_nombre || inc.tipo}</span>
                          {inc.paraliza && <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">Paraliza</Badge>}
                        </div>
                        {inc.comentario && <p className="text-xs text-muted-foreground mt-1">{inc.comentario}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                        </p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResolver(inc.id)} title="Resolver">
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEliminar(inc.id)} title="Eliminar">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Incidencias resueltas */}
              {incidencias.filter(i => i.estado === 'RESUELTA').length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowResueltas(p => !p)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-2"
                  >
                    {showResueltas ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="font-medium">Historial resueltas ({incidencias.filter(i => i.estado === 'RESUELTA').length})</span>
                    <div className="flex-1 h-px bg-border" />
                  </button>
                  {showResueltas && (
                    <div className="space-y-2 mt-1">
                      {incidencias.filter(i => i.estado === 'RESUELTA').map(inc => (
                        <div key={inc.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/20 border-border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px]">RESUELTA</Badge>
                              <span className="font-medium text-xs text-muted-foreground">{inc.motivo_nombre || inc.tipo}</span>
                            </div>
                            {inc.comentario && <p className="text-xs text-muted-foreground mt-1">{inc.comentario}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                              {inc.updated_at && (
                                <span className="text-green-600 ml-1">· Resuelta: {new Date(inc.updated_at).toLocaleString('es-PE', { timeZone: 'America/Lima', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                              )}
                            </p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleEliminar(inc.id)} title="Eliminar">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {incidencias.length === 0 && !showNewForm && (
                <div className="text-center py-6 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin incidencias registradas</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReporteTiemposMuertos;
