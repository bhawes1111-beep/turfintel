import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { filterCommands, groupCommands } from '../../utils/command/commandHelpers'
import styles from './command.module.css'

export default function CommandPalette({ query, onQuery, onSelect, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const results = useMemo(() => filterCommands(query), [query])
  const isFiltering = query.trim().length > 0

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0) }, [query])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll active item into view
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[activeIndex]) onSelect(results[activeIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // Build display list — group headers + command items
  const displayItems = useMemo(() => {
    if (isFiltering) {
      return results.map((cmd, i) => ({ type: 'command', cmd, flatIndex: i }))
    }
    const items = []
    let lastGroup = null
    results.forEach((cmd, i) => {
      if (cmd.group !== lastGroup) {
        items.push({ type: 'header', label: cmd.group })
        lastGroup = cmd.group
      }
      items.push({ type: 'command', cmd, flatIndex: i })
    })
    return items
  }, [results, isFiltering])

  return (
    <div
      className={styles.cpPalette}
      onClick={e => e.stopPropagation()}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* ── Search input ── */}
      <div className={styles.cpInputRow}>
        <span className={styles.cpSearchIcon}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          className={styles.cpInput}
          type="text"
          placeholder="Search commands, modules, workflows…"
          value={query}
          onChange={e => onQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
          aria-label="Search commands"
        />
        <kbd className={styles.cpEscHint}>ESC</kbd>
      </div>

      {/* ── Results ── */}
      {results.length === 0 ? (
        <p className={styles.cpEmpty}>No commands match "{query}"</p>
      ) : (
        <div className={styles.cpResults} ref={listRef} role="listbox">
          {displayItems.map((item, di) => {
            if (item.type === 'header') {
              return (
                <div key={`h-${item.label}`} className={styles.cpGroupHeader}>
                  {item.label}
                </div>
              )
            }
            const { cmd, flatIndex } = item
            const isActive = flatIndex === activeIndex
            return (
              <button
                key={cmd.id}
                className={`${styles.cpItem} ${isActive ? styles.cpItemActive : ''}`}
                data-active={isActive}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setActiveIndex(flatIndex)}
                role="option"
                aria-selected={isActive}
              >
                <span className={styles.cpItemIcon}>{cmd.icon}</span>
                <span className={styles.cpItemBody}>
                  <span className={styles.cpItemLabel}>{cmd.label}</span>
                  <span className={styles.cpItemDesc}>{cmd.description}</span>
                </span>
                {isFiltering && (
                  <span className={styles.cpItemGroup}>{cmd.group}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div className={styles.cpFooter}>
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>ESC</kbd> close</span>
      </div>
    </div>
  )
}
