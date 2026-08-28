import CatalogChip from './CatalogChip'
import { SignalBadge, ReiBadge, PhiBadge, GroupBadge } from '../../../components/shared/LabelBadges'
import { formatContainerSize, formatMoney } from '../../../utils/inventory/containerSize'
import { formatNutrientSourceSummary } from '../../../utils/inventory/nutrientForms'
import { formatDiseaseTargetSummary } from '../../../utils/inventory/diseaseTargets'
import { formatNematodeTargetSummary } from '../../../utils/inventory/nematodeTargets'
import { formatWeedTargetSummary } from '../../../utils/inventory/weedTargets'
import styles from './ChemicalDetailModal.module.css'

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function DetailField({ label, value }) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <strong>{valueOrDash(value)}</strong>
    </div>
  )
}

function stockStatus(item) {
  const quantity = Number(item.quantity) || 0
  const reorder = Number(item.reorderLevel) || 0
  if (quantity <= 0) return { label: 'Out of Stock', tone: 'critical' }
  if (quantity <= reorder) return { label: 'Low Stock', tone: 'low' }
  return { label: 'In Stock', tone: 'ok' }
}

export default function ChemicalDetailModal({ item, label, canEdit, onEdit, onClose, onOpenCatalog }) {
  if (!item) return null
  const status = stockStatus(item)
  const packageSize = formatContainerSize(item)
  const nutrientSummary = formatNutrientSourceSummary(item.nutrientSources)
  const diseaseSummary = formatDiseaseTargetSummary(item.diseaseTargets)
  const nematodeSummary = formatNematodeTargetSummary(item.nematodeTargets)
  const weedSummary = formatWeedTargetSummary(item.weedTargets)
  const stockValue = item.costPerUnit != null
    ? (Number(item.quantity) || 0) * Number(item.costPerUnit)
    : null

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={`${item.name} chemical details`}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <h2>{item.name}</h2>
              <span className={styles.status} data-tone={status.tone}>{status.label}</span>
            </div>
            <p>{item.category || 'Chemical'}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close chemical details">X</button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <h3>Stock</h3>
              <CatalogChip productCatalogId={item.productCatalogId} onOpen={onOpenCatalog} />
            </div>
            <div className={styles.grid}>
              <DetailField label="Amount on hand" value={`${valueOrDash(item.quantity)} ${item.unit || ''}`.trim()} />
              <DetailField label="Reorder level" value={item.reorderLevel == null ? '-' : `${item.reorderLevel} ${item.unit || ''}`.trim()} />
              <DetailField label="Package" value={packageSize} />
              <DetailField label="Containers" value={item.containerCount} />
              <DetailField label="Location" value={item.location} />
              <DetailField label="Vendor" value={item.vendor} />
            </div>
          </section>

          <section className={styles.section}>
            <h3>Chemical information</h3>
            <div className={styles.grid}>
              <DetailField label="Manufacturer" value={item.manufacturer} />
              <DetailField label="EPA number" value={item.epaNumber} />
              <DetailField label="Expiration date" value={item.expiryDate} />
              <DetailField label="Analysis" value={item.analysis} />
            </div>
          </section>

          {(nutrientSummary || diseaseSummary || nematodeSummary || weedSummary) && (
            <section className={styles.section}>
              <h3>Agronomic information</h3>
              <div className={styles.detailList}>
                {nutrientSummary && <DetailField label="Nutrients" value={nutrientSummary} />}
                {diseaseSummary && <DetailField label="Diseases controlled" value={diseaseSummary} />}
                {weedSummary && <DetailField label="Weeds controlled" value={weedSummary} />}
                {nematodeSummary && <DetailField label="Nematodes controlled" value={nematodeSummary} />}
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h3>Cost</h3>
            <div className={styles.grid}>
              <DetailField label="Container price" value={item.containerPrice == null ? '-' : formatMoney(item.containerPrice)} />
              <DetailField label={`Cost per ${item.costUnit || item.unit || 'unit'}`} value={item.costPerUnit == null ? '-' : formatMoney(item.costPerUnit)} />
              <DetailField label="Current stock value" value={stockValue == null ? '-' : formatMoney(stockValue)} />
              <DetailField label="Cost source" value={item.costSource} />
            </div>
            {item.costNotes && <p className={styles.notes}>{item.costNotes}</p>}
          </section>

          {label && (
            <section className={styles.section}>
              <h3>Product label</h3>
              <div className={styles.badges}>
                <SignalBadge word={label.signalWord} />
                <ReiBadge text={label.reiHours} />
                <PhiBadge text={label.phi} />
                {label.fracGroup?.split(',').map(code => <GroupBadge key={`F-${code}`} type="FRAC" code={code.trim()} />)}
                {label.hracGroup?.split(',').map(code => <GroupBadge key={`H-${code}`} type="HRAC" code={code.trim()} />)}
                {label.iracGroup?.split(',').map(code => <GroupBadge key={`I-${code}`} type="IRAC" code={code.trim()} />)}
              </div>
              {label.pdfUrl && <a className={styles.pdfLink} href={label.pdfUrl} target="_blank" rel="noopener noreferrer">Open label PDF</a>}
            </section>
          )}

          {item.notes && (
            <section className={styles.section}>
              <h3>Notes</h3>
              <p className={styles.notes}>{item.notes}</p>
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          {canEdit && <button type="button" className={styles.editButton} onClick={onEdit}>Edit item</button>}
          <button type="button" className={styles.doneButton} onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}
