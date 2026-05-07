import { useState, useRef, useId } from 'react'
import styles from './Upload.module.css'

const DEFAULT_ICON = '⬆'

/**
 * Props:
 *   accept     — string  MIME types or extensions for the native input, e.g. ".pdf,.xlsx"
 *   multiple   — bool    allow selecting multiple files (default false)
 *   onFiles    — (FileList | File[]) => void   called when files are chosen or dropped
 *   icon       — string  emoji/text shown above the label (default ⬆)
 *   label      — string  primary text (default "Upload files")
 *   sublabel   — string  secondary text below label
 *   formats    — string[]  format tags shown below sublabel, e.g. ['PDF', 'XLSX']
 *   disabled   — bool
 *   className  — string  additional class(es) on the root element
 */
export default function UploadDropzone({
  accept,
  multiple = false,
  onFiles,
  icon = DEFAULT_ICON,
  label = 'Upload files',
  sublabel,
  formats,
  disabled = false,
  className = '',
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const labelId  = useId()

  function handleDragOver(e) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDragLeave(e) {
    // only clear if leaving the dropzone itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (disabled || !onFiles) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(multiple ? files : [files[0]])
  }

  function handleChange(e) {
    if (!onFiles || !e.target.files?.length) return
    onFiles(Array.from(e.target.files))
    // reset so the same file can be re-selected
    e.target.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  const rootCls = [
    styles.dropzone,
    dragging  ? styles.dragging  : '',
    disabled  ? styles.disabled  : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={rootCls}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-labelledby={labelId}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className={styles.dropzoneIcon}>{icon}</div>

      <div id={labelId} className={styles.dropzoneTitle}>
        {dragging ? 'Drop to upload' : label}
      </div>

      {sublabel && !dragging && (
        <div className={styles.dropzoneSub}>{sublabel}</div>
      )}

      {formats?.length > 0 && !dragging && (
        <div className={styles.dropzoneFormats}>
          {formats.map(f => (
            <span key={f} className={styles.formatTag}>{f}</span>
          ))}
        </div>
      )}
    </div>
  )
}
