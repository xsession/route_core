import React, { useState } from 'react';
import { BomGenerator, type BomSummary } from '@route-core/core';
import { useHarnessStore } from '../../store/harness-store';

const bomGen = new BomGenerator();

export function BomView() {
  const { harness } = useHarnessStore();
  const [bom, setBom] = useState<BomSummary | null>(null);

  const generate = () => {
    setBom(bomGen.generate(harness));
  };

  const downloadCsv = () => {
    if (!bom) return;
    const csv = bomGen.toCSV(bom);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${harness.name}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bom-view">
      <div className="bom-header">
        <h3>Bill of Materials</h3>
        <button onClick={generate}>Generate BOM</button>
      </div>

      {bom && (
        <>
          <div className="bom-summary">
            <span>Total parts: {bom.totalParts}</span>
            <span>Unique P/Ns: {bom.totalUniquePartNumbers}</span>
            {bom.estimatedCost != null && (
              <span>Est. cost: ${bom.estimatedCost.toFixed(2)}</span>
            )}
            <button onClick={downloadCsv}>Download CSV</button>
          </div>

          <table className="bom-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Part Number</th>
                <th>Manufacturer</th>
                <th>Description</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {bom.entries.map((entry, i) => (
                <tr key={i}>
                  <td>{entry.refDesignator}</td>
                  <td>{entry.partNumber || '-'}</td>
                  <td>{entry.manufacturer || '-'}</td>
                  <td>{entry.description}</td>
                  <td>{entry.category}</td>
                  <td>{entry.quantity}</td>
                  <td>{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!bom && (
        <p className="empty">Click "Generate BOM" to create the bill of materials from your design.</p>
      )}
    </div>
  );
}
