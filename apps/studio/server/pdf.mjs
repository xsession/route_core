// Minimal dependency-free PDF writer for the formboard export.
// One page per formboard panel: header, the panel grid with each wire drawn
// in the panel whose cell it occupies, a per-panel wire schedule, and totals.
// No external packages: the app must stay self-contained and loopback-only.

const PDF_MM_TO_POINT = 72 / 25.4;

function escapePdfText(text) {
  return String(text)
    .replace(/[^\x20-\xFF]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function buildPdfPage(options = {}) {
  const widthPt = (options.widthMm || 210) * PDF_MM_TO_POINT;
  const heightPt = (options.heightMm || 297) * PDF_MM_TO_POINT;
  const text = [];
  const show = (x, y, string, size = 8, bold = false) => {
    text.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(string)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, width = 0.5, dash = null) => {
    if (dash) text.push(`[${dash.join(' ')}]`);
    text.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l ${width} w S`);
  };
  const polyline = (points, width = 0.75, dash = null) => {
    if (dash) text.push(`[${dash.join(' ')}]`);
    if (!points.length) return;
    text.push(`${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} m`);
    for (let index = 1; index < points.length; index += 1) text.push(`${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)} l`);
    text.push(`${width} w S`);
  };
  return { widthPt, heightPt, show, line, polyline, content: () => text.join('\n') };
}

function buildPdfDocument(pages) {
  // Object layout: 1 Catalog, 2 Pages, then per page i (1-based):
  // page object 3+(i-1)*2, content object 4+(i-1)*2; fonts after all pages.
  const fontObject = 3 + pages.length * 2;
  const boldFontObject = fontObject + 1;
  const bodies = [];
  const pushBody = (number, body) => {
    bodies[number] = `${number} 0 obj\n${body}\nendobj\n`;
  };
  const pageNumbers = pages.map((_, index) => 3 + index * 2);
  pushBody(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  pushBody(2, `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageObject = pageNumbers[index];
    const contentObject = pageObject + 1;
    pushBody(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt.toFixed(2)} ${page.heightPt.toFixed(2)}] /Resources << /Font << /F1 ${fontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    const stream = page.content();
    pushBody(contentObject, `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
  });
  pushBody(fontObject, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  pushBody(boldFontObject, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  const header = '%PDF-1.4\n';
  const objectCount = boldFontObject;
  // Compute xref offsets against the final byte sequence (header + objects).
  const offsets = new Array(objectCount + 1).fill(0);
  let cursor = header.length;
  for (let number = 1; number <= objectCount; number += 1) {
    offsets[number] = cursor;
    cursor += Buffer.byteLength(bodies[number], 'utf8');
  }
  const xrefStart = cursor;
  const xref = [`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`];
  for (let number = 1; number <= objectCount; number += 1) xref.push(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return header + bodies.slice(1).join('') + xref.join('') + trailer;
}

export function buildFormboardPdf(board, meta = {}) {
  const config = board.config;
  const panelW = board.panel.widthMm;
  const panelH = board.panel.heightMm;
  const rows = Math.max(1, board.panel.rows);
  const cols = Math.max(1, board.panel.columns);
  const totalPanels = rows * cols;
  const rowH = panelH / rows;
  const colW = panelW / cols;

  // Assign each wire to the panel whose cell contains its geometric midpoint;
  // unrouted wires (no points) fill panels in order.
  const assigned = Array.from({ length: totalPanels }, () => []);
  let fallback = 0;
  board.wires.forEach((wire) => {
    const points = wire.points || [];
    const inside = points.filter((point) => point.x >= 0 && point.x <= panelW && point.y >= 0 && point.y <= panelH);
    let panelIndex = null;
    if (inside.length >= 2) {
      const midX = inside.reduce((sum, p) => sum + p.x, 0) / inside.length;
      const midY = inside.reduce((sum, p) => sum + p.y, 0) / inside.length;
      const column = Math.min(cols - 1, Math.max(0, Math.floor(midX / colW)));
      const rowFromBottom = Math.min(rows - 1, Math.max(0, Math.floor(midY / rowH)));
      panelIndex = (rows - 1 - rowFromBottom) * cols + column;
    }
    if (panelIndex === null) panelIndex = fallback++ % totalPanels;
    assigned[panelIndex].push(wire);
  });

  const MM = PDF_MM_TO_POINT;
  const margin = 15; // mm
  const headerH = 22; // mm
  const rowHeightMm = 2.6;
  const pages = [];
  for (let panelIndex = 0; panelIndex < totalPanels; panelIndex += 1) {
    const wires = assigned[panelIndex];
    const tableBlockH = 8 + (wires.length ? 3 + wires.length * rowHeightMm + 8 : 0); // mm
    const pageW = panelW + 2 * margin;
    const pageH = margin + headerH + 4 + panelH + 4 + tableBlockH + margin;
    const page = buildPdfPage({ widthMm: pageW, heightMm: pageH });
    const originX = margin * MM;
    const panelTopY = page.heightPt - (margin + headerH + 4) * MM;
    const toX = (mm) => originX + mm * MM;
    const toY = (mm) => panelTopY - (panelH - mm) * MM;
    // Header
    page.show(originX, page.heightPt - 10 * MM, `FORMBOARD PANEL ${panelIndex + 1} / ${totalPanels}`, 12, true);
    page.show(originX, page.heightPt - 18 * MM, `${meta.project || 'RouteCore'} - ${meta.modelName || board.modelId || ''} - ${meta.exportedAt || ''}`, 8);
    // Panel border
    page.line(originX, toY(0), toX(panelW), toY(0), 1);
    page.line(toX(panelW), toY(0), toX(panelW), toY(panelH), 1);
    page.line(toX(panelW), toY(panelH), originX, toY(panelH), 1);
    page.line(originX, toY(panelH), originX, toY(0), 1);
    // Grid
    for (let row = 1; row < rows; row += 1) page.line(originX, toY(row * rowH), toX(panelW), toY(row * rowH), 0.4, [2, 2]);
    for (let col = 1; col < cols; col += 1) page.line(toX(col * colW), toY(0), toX(col * colW), toY(panelH), 0.4, [2, 2]);
    // Wires that occupy this panel
    for (const wire of wires) {
      const points = (wire.points || [])
        .filter((point) => point.x >= 0 && point.x <= panelW && point.y >= 0 && point.y <= panelH)
        .map((point) => ({ x: toX(point.x), y: toY(point.y) }));
      if (points.length >= 2) {
        page.polyline(points, 0.6, wire.status === 'not-to-scale' ? [2, 2] : null);
        const last = points[points.length - 1];
        page.show(last.x + 2, last.y + 2, wire.label || wire.wireId, 6);
      }
    }
    // Per-panel schedule below the panel
    const tableTopY = toY(0) - 8 * MM;
    const tableWidth = page.widthPt - 2 * margin * MM;
    const columns = [
      ['WIRE', 0.12], ['SIGNAL', 0.16], ['FROM', 0.16], ['TO', 0.16], ['ROUTED MM', 0.12], ['SET MM', 0.1], ['BENDS', 0.08], ['STATE', 0.1],
    ];
    let cursorX = margin * MM;
    columns.forEach(([label, fraction]) => {
      page.show(cursorX, tableTopY, label, 7, true);
      cursorX += tableWidth * fraction;
    });
    page.line(margin * MM, tableTopY - 3, page.widthPt - margin * MM, tableTopY - 3, 0.5);
    wires.forEach((wire, index) => {
      const y = tableTopY - 3 - (index + 1) * rowHeightMm * MM * 0.8;
      const cells = [wire.label || wire.wireId, wire.signal || '', wire.from || '', wire.to || '', String(wire.routedLengthMm), String(wire.setLengthMm), String(wire.bendCount), wire.status || ''];
      let x = margin * MM;
      cells.forEach((cell, cellIndex) => {
        page.show(x, y, String(cell).slice(0, 30), 6.5);
        x += tableWidth * columns[cellIndex][1];
      });
    });
    // Totals footer
    const totalsY = tableTopY - 3 - (wires.length + 1) * rowHeightMm * MM * 0.8 - 6;
    if (totalsY > 5) {
      page.show(margin * MM, totalsY, `TOTALS: ${board.totals.wireCount} wires - routed ${board.totals.routedLengthMm} mm - set ${board.totals.setLengthMm} mm - bends ${board.totals.bendCount} - to-scale ${board.totals.toScale}`, 8, true);
      page.show(margin * MM, totalsY - 10, `Panel ${panelW} x ${panelH} mm - grid ${rows}x${cols} - bend radius ${config.bendRadiusMm} mm - set step ${config.setLengthStepMm} mm - tolerance +/-${(config.tolerancePpm / 10000).toFixed(0)}%`, 7);
    }
    pages.push(page);
  }
  return buildPdfDocument(pages);
}
