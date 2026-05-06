import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './ChemicalModal.module.css'

function Section({ label, children }) {
  if (!children) return null
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>{label}</p>
      <p className={styles.sectionBody}>{children}</p>
    </div>
  )
}

function ListSection({ label, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>{label}</p>
      <ul className={styles.list}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  )
}

export default function ChemicalModal({ chemical, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!chemical) return null

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${chemical.name}`}
    >
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.headerName}>{chemical.name}</span>
            <span className={styles.headerMfr}>{chemical.manufacturer}</span>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body}>
          <Section label="Active Ingredients">{chemical.activeIngredients}</Section>
          <Section label="EPA Registration #">{chemical.epaNumber}</Section>
          <Section label="Use Rate">{chemical.useRate}</Section>
          <Section label="Application Interval">{chemical.applicationInterval}</Section>
          <Section label="Re-Entry Interval (REI)">{chemical.rei}</Section>
          <Section label="Signal Word">{chemical.signalWord}</Section>
          <ListSection label="Registered Turf Types" items={chemical.turfTypes} />
          <Section label="Tank Mix Notes">{chemical.tankMixNotes}</Section>
          <Section label="PPE Requirements">{chemical.ppeRequirements}</Section>
          <Section label="Storage Instructions">{chemical.storageInstructions}</Section>
          <Section label="Environmental Warnings">{chemical.environmentalWarnings}</Section>
          <Section label="Resistance Management">{chemical.resistanceManagement}</Section>
          {chemical.internalNotes && (
            <Section label="Internal Notes">{chemical.internalNotes}</Section>
          )}
          {chemical.courseNotes && (
            <Section label="Course Notes">{chemical.courseNotes}</Section>
          )}
        </div>

        {/* Fixed footer */}
        <div className={styles.footer}>
          <a
            href={chemical.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.labelLink}
          >
            Open Official Label ↗
          </a>
          <button className={styles.footerClose} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
