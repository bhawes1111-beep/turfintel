import { useState } from 'react'
import styles from '../Spray.module.css'

const AREAS = ['Greens', 'Tees', 'Fairways', 'Roughs', 'Greens + Tees', 'All Areas', 'Other']
const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const EMPTY_PRODUCT_ROW = () => ({ id: Date.now(), product: '', targetPest: '', rate: '', area: '' })

export default function BuildSpraySheet() {
  const [date, setDate]           = useState('')
  const [applicator, setApplicator] = useState('')
  const [temp, setTemp]           = useState('')
  const [wind, setWind]           = useState('')
  const [windDir, setWindDir]     = useState('')
  const [humidity, setHumidity]   = useState('')
  const [products, setProducts]   = useState([EMPTY_PRODUCT_ROW()])
  const [notes, setNotes]         = useState('')

  function addRow() {
    setProducts(p => [...p, EMPTY_PRODUCT_ROW()])
  }

  function removeRow(id) {
    setProducts(p => p.length > 1 ? p.filter(r => r.id !== id) : p)
  }

  function updateRow(id, field, value) {
    setProducts(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function handleClear() {
    setDate(''); setApplicator(''); setTemp(''); setWind('');
    setWindDir(''); setHumidity(''); setNotes('')
    setProducts([EMPTY_PRODUCT_ROW()])
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sheetForm}>

        {/* Header */}
        <div className={styles.sheetSection}>
          <p className={styles.sheetSectionTitle}>Spray Header</p>
          <div className={styles.sheetRow}>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Date</label>
              <input type="date" className={styles.sheetInput} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Applicator</label>
              <input type="text" className={styles.sheetInput} placeholder="Name" value={applicator} onChange={e => setApplicator(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Weather */}
        <div className={styles.sheetSection}>
          <p className={styles.sheetSectionTitle}>Weather Conditions</p>
          <div className={styles.sheetRow}>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Temperature (°F)</label>
              <input type="number" className={styles.sheetInput} placeholder="72" value={temp} onChange={e => setTemp(e.target.value)} />
            </div>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Wind Speed (mph)</label>
              <input type="number" className={styles.sheetInput} placeholder="5" value={wind} onChange={e => setWind(e.target.value)} />
            </div>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Wind Direction</label>
              <select className={styles.sheetSelect} value={windDir} onChange={e => setWindDir(e.target.value)}>
                <option value="">Select…</option>
                {WIND_DIRS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className={styles.sheetField}>
              <label className={styles.sheetLabel}>Humidity (%)</label>
              <input type="number" className={styles.sheetInput} placeholder="65" value={humidity} onChange={e => setHumidity(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Products */}
        <div className={styles.sheetSection}>
          <p className={styles.sheetSectionTitle}>Products &amp; Rates</p>
          <div className={styles.productRows}>
            {products.map((row, i) => (
              <div key={row.id} className={styles.productRow}>
                <div className={styles.sheetField}>
                  {i === 0 && <label className={styles.sheetLabel}>Product</label>}
                  <input type="text" className={styles.sheetInput} placeholder="Product name" value={row.product} onChange={e => updateRow(row.id, 'product', e.target.value)} />
                </div>
                <div className={styles.sheetField}>
                  {i === 0 && <label className={styles.sheetLabel}>Target Pest / Use</label>}
                  <input type="text" className={styles.sheetInput} placeholder="Dollar spot, PGR…" value={row.targetPest} onChange={e => updateRow(row.id, 'targetPest', e.target.value)} />
                </div>
                <div className={styles.sheetField}>
                  {i === 0 && <label className={styles.sheetLabel}>Rate</label>}
                  <input type="text" className={styles.sheetInput} placeholder="oz/1000 sq ft" value={row.rate} onChange={e => updateRow(row.id, 'rate', e.target.value)} />
                </div>
                <div className={styles.sheetField}>
                  {i === 0 && <label className={styles.sheetLabel}>Area</label>}
                  <select className={styles.sheetSelect} value={row.area} onChange={e => updateRow(row.id, 'area', e.target.value)}>
                    <option value="">Area…</option>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <button
                  className={styles.removeRowBtn}
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove product row"
                  style={{ marginTop: i === 0 ? '18px' : '0' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className={styles.addRowBtn} onClick={addRow}>+ Add Product</button>
        </div>

        {/* Notes */}
        <div className={styles.sheetSection}>
          <p className={styles.sheetSectionTitle}>Notes</p>
          <textarea
            className={styles.sheetTextarea}
            placeholder="Field observations, turf conditions, special instructions…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className={styles.sheetActions}>
          <button className={styles.clearBtn} onClick={handleClear}>Clear</button>
          <button className={styles.saveBtn} onClick={() => {/* save logic — coming soon */}}>
            Save Spray Sheet
          </button>
        </div>

      </div>
    </div>
  )
}
