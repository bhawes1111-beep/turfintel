import { useState, useMemo, useEffect, Fragment } from 'react'
import { SCHEDULE, EMPLOYEES } from '../../../data/crew'
import styles from '../Crew.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY = '2026-05-08'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const STATUS_COLOR = {
  active:      'green',
  completed:   'green',
  scheduled:   'green',
  off:         'gray',
  'half-day':  'yellow',
  late:        'yellow',
  special:     'blue',
  absent:      'red',
  'call-out':  'red',
  unavailable: 'red',
}

const STATUS_LABEL = {
  active:      'Active',
  completed:   'Completed',
  scheduled:   'Scheduled',
  off:         'Off',
  'half-day':  'Half Day',
  late:        'Late',
  special:     'Special',
  absent:      'Absent',
  'call-out':  'Call Out',
  unavailable: 'Unavailable',
}

const AREAS = [
  'Greens', 'Tees', 'Fairways', 'Bunkers', 'Equipment',
  'Spray', 'Irrigation', 'Full Property', 'Maintenance Shop',
  'Chemical Room', 'All Areas',
]

const AVAIL_TABS  = ['all','time-off','call-out','unavailable','pending']
const AVAIL_LABEL = { all:'All', 'time-off':'Time Off', 'call-out':'Call Outs', unavailable:'Unavailable', pending:'Pending' }

const AVAIL_TYPE_LABEL   = { 'time-off':'Time Off', 'call-out':'Call Out', medical:'Medical', vacation:'Vacation', unavailable:'Unavailable' }
const AVAIL_STATUS_LABEL = { approved:'Approved', pending:'Pending', noted:'Noted', denied:'Denied' }

// ── Inline availability data ──────────────────────────────────────────────────

const AVAILABILITY = [
  {
    id:'av-001', employeeId:'EMP-005', employeeName:'James Thompson',
    department:'Grounds', type:'medical', status:'approved',
    startDate:'2026-05-08', endDate:'2026-05-15',
    reason:'Medical leave — ankle surgery recovery. Expected return May 15.',
    requestDate:'2026-05-01',
  },
  {
    id:'av-002', employeeId:'EMP-002', employeeName:'Juan Reyes',
    department:'Grounds', type:'vacation', status:'pending',
    startDate:'2026-05-20', endDate:'2026-05-22',
    reason:'Family vacation — requested 2 weeks in advance.',
    requestDate:'2026-05-06',
  },
  {
    id:'av-003', employeeId:'EMP-007', employeeName:'Brandon Willis',
    department:'Equipment', type:'call-out', status:'noted',
    startDate:'2026-05-08', endDate:'2026-05-08',
    reason:'Arrived 45 min late — personal emergency. Completed full shift.',
    requestDate:'2026-05-08',
  },
  {
    id:'av-004', employeeId:'EMP-001', employeeName:'Carlos Martinez',
    department:'Grounds', type:'time-off', status:'approved',
    startDate:'2026-05-16', endDate:'2026-05-16',
    reason:'Personal day — requested 2 weeks in advance.',
    requestDate:'2026-05-03',
  },
  {
    id:'av-005', employeeId:'EMP-008', employeeName:'Tommy Chen',
    department:'Grounds', type:'time-off', status:'pending',
    startDate:'2026-05-23', endDate:'2026-05-23',
    reason:'Doctor appointment — awaiting superintendent approval.',
    requestDate:'2026-05-07',
  },
  {
    id:'av-006', employeeId:'EMP-003', employeeName:'Miguel Santos',
    department:'Spray', type:'unavailable', status:'approved',
    startDate:'2026-05-30', endDate:'2026-05-30',
    reason:'Pesticide re-certification exam — full day off-site.',
    requestDate:'2026-05-02',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getWeekDates(ref) {
  const [y, m, d] = ref.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay()
  const mon = new Date(dt)
  mon.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(mon)
    day.setDate(mon.getDate() + i)
    return toDateStr(day)
  })
}

function fmtWeekRange(dates) {
  const [sy, sm, sd] = dates[0].split('-').map(Number)
  const [ey, em, ed] = dates[6].split('-').map(Number)
  const start = `${MONTH_NAMES[sm-1].slice(0,3)} ${sd}`
  const end   = sm === em ? `${ed}, ${ey}` : `${MONTH_NAMES[em-1].slice(0,3)} ${ed}, ${ey}`
  return `${start} – ${end}`
}

function fmtDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTH_NAMES[m-1]} ${d}`
}

function colorKey(status) {
  return STATUS_COLOR[status] || 'green'
}

function colorClass(color) {
  const map = { green:'csbShiftGreen', gray:'csbShiftGray', yellow:'csbShiftYellow', blue:'csbShiftBlue', red:'csbShiftRed' }
  return map[color] || 'csbShiftGreen'
}

function statusBadgeClass(color) {
  const map = { green:'csbSBGreen', gray:'csbSBGray', yellow:'csbSBYellow', blue:'csbSBBlue', red:'csbSBRed' }
  return map[color] || 'csbSBGreen'
}

function emptyForm(date, emp) {
  return {
    id:             null,
    employeeId:     emp?.employeeId    || EMPLOYEES[0]?.employeeId    || '',
    employeeName:   emp?.fullName      || EMPLOYEES[0]?.fullName      || '',
    department:     emp?.department    || EMPLOYEES[0]?.department    || '',
    role:           emp?.role          || EMPLOYEES[0]?.role          || '',
    date:           date,
    shiftType:      'standard',
    startTime:      '6:00 AM',
    endTime:        '2:00 PM',
    scheduledHours: 8,
    routing:        '',
    assignedArea:   'Greens',
    assignedTask:   '',
    status:         'scheduled',
    notes:          '',
  }
}

function formFromShift(shift) {
  return {
    id:             shift.id,
    employeeId:     shift.employeeId,
    employeeName:   shift.employeeName,
    department:     shift.department,
    role:           shift.role,
    date:           shift.date,
    shiftType:      shift.shiftType      || 'standard',
    startTime:      shift.startTime      || '',
    endTime:        shift.endTime        || '',
    scheduledHours: shift.scheduledHours || 8,
    routing:        shift.routing        || '',
    assignedArea:   shift.assignedArea   || 'Greens',
    assignedTask:   shift.assignedTask   || '',
    status:         shift.status,
    notes:          shift.notes          || '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrewSchedule() {
  const [view,      setView]      = useState('week')
  const [navDate,   setNavDate]   = useState(TODAY)
  const [shifts,    setShifts]    = useState(SCHEDULE)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('edit')
  const [form,      setForm]      = useState(null)
  const [availTab,  setAvailTab]  = useState('all')
  const [toast,     setToast]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const weekDates = useMemo(() => getWeekDates(navDate), [navDate])

  const scheduleMap = useMemo(() => {
    const map = {}
    shifts.forEach(s => { map[`${s.employeeId}-${s.date}`] = s })
    return map
  }, [shifts])

  const dayShifts = useMemo(() =>
    [...shifts]
      .filter(s => s.date === navDate)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [shifts, navDate]
  )

  const filteredAvail = useMemo(() => {
    if (availTab === 'all')     return AVAILABILITY
    if (availTab === 'pending') return AVAILABILITY.filter(a => a.status === 'pending')
    return AVAILABILITY.filter(a => a.type === availTab)
  }, [availTab])

  const pendingCount = AVAILABILITY.filter(a => a.status === 'pending').length

  function weeklyHours(empId) {
    return weekDates.reduce((sum, date) => {
      const s = scheduleMap[`${empId}-${date}`]
      return s && s.status !== 'off' && s.status !== 'absent' ? sum + (s.scheduledHours || 0) : sum
    }, 0)
  }

  function openShift(shift) {
    setForm(formFromShift(shift))
    setPanelMode('edit')
    setPanelOpen(true)
  }

  function openAdd(emp, date) {
    setForm(emptyForm(date || navDate, emp))
    setPanelMode('add')
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setForm(null)
  }

  function handleFormChange(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'employeeId') {
        const emp = EMPLOYEES.find(e => e.employeeId === value)
        if (emp) {
          next.employeeName = emp.fullName
          next.department   = emp.department
          next.role         = emp.role
        }
      }
      return next
    })
  }

  function handleSave() {
    if (!form) return
    if (form.id) {
      setShifts(prev => prev.map(s => s.id === form.id ? { ...s, ...form } : s))
    } else {
      setShifts(prev => [...prev, { ...form, id: `sc-${Date.now()}` }])
    }
    showToast('Shift saved.')
    closePanel()
  }

  function handleDelete() {
    if (!form?.id) return
    setShifts(prev => prev.filter(s => s.id !== form.id))
    showToast('Shift deleted.')
    closePanel()
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  function navPrev() {
    const [y, m, d] = navDate.split('-').map(Number)
    const delta = view === 'week' ? 7 : 1
    setNavDate(toDateStr(new Date(y, m - 1, d - delta)))
  }

  function navNext() {
    const [y, m, d] = navDate.split('-').map(Number)
    const delta = view === 'week' ? 7 : 1
    setNavDate(toDateStr(new Date(y, m - 1, d + delta)))
  }

  return (
    <div className={styles.csbWrap}>

      {/* ── Header ── */}
      <div className={styles.csbHeader}>
        <div className={styles.csbHeaderLeft}>
          <div className={styles.csbNavRow}>
            <button className={styles.csbNavBtn} onClick={navPrev} aria-label="Previous">&#8249;</button>
            <span className={styles.csbNavLabel}>
              {view === 'week' ? fmtWeekRange(weekDates) : fmtDate(navDate)}
            </span>
            <button className={styles.csbNavBtn} onClick={navNext} aria-label="Next">&#8250;</button>
            <button className={styles.csbTodayBtn} onClick={() => setNavDate(TODAY)}>Today</button>
          </div>
          <div className={styles.csbViewToggle}>
            {['week','day'].map(v => (
              <button
                key={v}
                className={`${styles.csbViewBtn} ${view === v ? styles.csbViewBtnActive : ''}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.csbHeaderRight}>
          <button className={styles.csbBtnSecondary} onClick={() => showToast('Auto-assign coming in a future update.')}>
            Auto Assign Crew
          </button>
          <button className={styles.csbBtnPrimary} onClick={() => openAdd()}>
            + Add Shift
          </button>
        </div>
      </div>

      {/* ── Board: grid + edit panel ── */}
      <div className={`${styles.csbBoardBody} ${panelOpen ? styles.csbBoardBodyOpen : ''}`}>

        {/* ── Main grid area ── */}
        <div className={styles.csbGridArea}>

          {/* Week view */}
          {view === 'week' && (
            <div className={styles.csbWeekOuter}>
              <div className={styles.csbWeekGrid}>

                {/* Header row */}
                <div className={styles.csbEmpColHeader}>Employee</div>
                {weekDates.map((dateStr, i) => {
                  const [,, d] = dateStr.split('-').map(Number)
                  const isToday = dateStr === TODAY
                  return (
                    <div
                      key={dateStr}
                      className={`${styles.csbDayColHeader} ${isToday ? styles.csbDayColHeaderToday : ''}`}
                    >
                      <span className={styles.csbDayName}>{DAY_LABELS[i]}</span>
                      <span className={styles.csbDayNum}>{d}</span>
                    </div>
                  )
                })}
                <div className={styles.csbTotalHeader}>Hrs</div>

                {/* Employee rows */}
                {EMPLOYEES.map(emp => (
                  <Fragment key={emp.employeeId}>

                    {/* Employee name cell */}
                    <div className={styles.csbEmpCell}>
                      <span className={styles.csbEmpName}>
                        {emp.fullName.split(' ')[0]}&nbsp;{emp.fullName.split(' ').slice(1).join(' ').charAt(0)}.
                      </span>
                      <span className={styles.csbEmpRole}>{emp.role}</span>
                    </div>

                    {/* Day cells */}
                    {weekDates.map(dateStr => {
                      const shift = scheduleMap[`${emp.employeeId}-${dateStr}`]
                      const isToday = dateStr === TODAY
                      const col = shift ? colorKey(shift.status) : null
                      return (
                        <div key={dateStr} className={`${styles.csbDayCell} ${isToday ? styles.csbDayCellToday : ''}`}>
                          {!shift ? (
                            <button
                              className={styles.csbCellAdd}
                              onClick={() => openAdd(emp, dateStr)}
                              title={`Add shift for ${emp.fullName}`}
                            >+</button>
                          ) : (
                            <button
                              className={`${styles.csbShiftCard} ${styles[colorClass(col)]}`}
                              onClick={() => openShift(shift)}
                            >
                              {shift.status === 'off' ? (
                                <span className={styles.csbShiftOffLabel}>Off</span>
                              ) : (
                                <>
                                  <span className={styles.csbShiftTime}>{shift.startTime}</span>
                                  <span className={styles.csbShiftTask}>
                                    {shift.assignedTask.split(' ').slice(0, 3).join(' ')}
                                  </span>
                                  {shift.status !== 'completed' && shift.status !== 'active' && (
                                    <span className={styles.csbShiftStatusTag}>
                                      {STATUS_LABEL[shift.status] || shift.status}
                                    </span>
                                  )}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {/* Weekly total */}
                    <div className={styles.csbTotalCell}>{weeklyHours(emp.employeeId)}h</div>

                  </Fragment>
                ))}

              </div>
            </div>
          )}

          {/* Day view */}
          {view === 'day' && (
            <div className={styles.csbDayView}>
              <div className={styles.csbDayViewMeta}>
                <span className={styles.csbDayViewDate}>
                  {fmtDate(navDate)}{navDate === TODAY ? ' · Today' : ''}
                </span>
                <span className={styles.csbDayViewCount}>
                  {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className={styles.csbDayList}>
                {dayShifts.length === 0 ? (
                  <div className={styles.csbDayEmpty}>
                    <p>No shifts scheduled for this day.</p>
                    <button className={styles.csbBtnPrimary} onClick={() => openAdd()}>+ Add Shift</button>
                  </div>
                ) : dayShifts.map(shift => {
                  const col = colorKey(shift.status)
                  return (
                    <button
                      key={shift.id}
                      className={`${styles.csbDayCard} ${styles[colorClass(col)]}`}
                      onClick={() => openShift(shift)}
                    >
                      <div className={styles.csbDayCardInner}>
                        <div className={styles.csbDayCardLeft}>
                          <div className={styles.csbDayNameRow}>
                            <span className={styles.csbDayEmpName}>{shift.employeeName}</span>
                            <span className={styles.csbDayDeptBadge}>{shift.department}</span>
                            {shift.shiftType === 'opening' && (
                              <span className={styles.csbOpeningBadge}>Opening</span>
                            )}
                          </div>
                          <div className={styles.csbDayRole}>{shift.role}</div>
                          {shift.status !== 'off' && shift.status !== 'absent' && (
                            <>
                              <div className={styles.csbDayTask}>{shift.assignedTask}</div>
                              <div className={styles.csbDayArea}>{shift.assignedArea}</div>
                            </>
                          )}
                          {shift.notes ? (
                            <div className={styles.csbDayNotes}>{shift.notes}</div>
                          ) : null}
                        </div>
                        <div className={styles.csbDayCardRight}>
                          {shift.startTime && (
                            <div className={styles.csbDayTimeBlock}>
                              <span className={styles.csbDayTimeBig}>{shift.startTime}</span>
                              {shift.endTime && <span className={styles.csbDayTimeEnd}>{shift.endTime}</span>}
                            </div>
                          )}
                          <span className={`${styles.csbStatusBadge} ${styles[statusBadgeClass(col)]}`}>
                            {STATUS_LABEL[shift.status] || shift.status}
                          </span>
                          {shift.scheduledHours > 0 && (
                            <span className={styles.csbDayHours}>{shift.scheduledHours}h</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* ── Edit / Add panel ── */}
        {panelOpen && form && (
          <div className={styles.csbEditPanel}>

            <div className={styles.csbEditPanelHead}>
              <h3 className={styles.csbEditPanelTitle}>
                {panelMode === 'add' ? 'Add Shift' : 'Edit Shift'}
              </h3>
              <button className={styles.csbEditCloseBtn} onClick={closePanel} aria-label="Close">✕</button>
            </div>

            <div className={styles.csbEditForm}>

              {/* Employee */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Employee</label>
                <select
                  className={styles.csbFormSelect}
                  value={form.employeeId}
                  onChange={e => handleFormChange('employeeId', e.target.value)}
                >
                  {EMPLOYEES.map(emp => (
                    <option key={emp.employeeId} value={emp.employeeId}>{emp.fullName}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Date</label>
                <input
                  className={styles.csbFormInput}
                  type="date"
                  value={form.date}
                  onChange={e => handleFormChange('date', e.target.value)}
                />
              </div>

              {/* Start / End */}
              <div className={styles.csbFormRow}>
                <div className={styles.csbFormGroup}>
                  <label className={styles.csbFormLabel}>Start Time</label>
                  <input
                    className={styles.csbFormInput}
                    type="text"
                    placeholder="5:30 AM"
                    value={form.startTime}
                    onChange={e => handleFormChange('startTime', e.target.value)}
                  />
                </div>
                <div className={styles.csbFormGroup}>
                  <label className={styles.csbFormLabel}>End Time</label>
                  <input
                    className={styles.csbFormInput}
                    type="text"
                    placeholder="2:00 PM"
                    value={form.endTime}
                    onChange={e => handleFormChange('endTime', e.target.value)}
                  />
                </div>
              </div>

              {/* Routing */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Routing</label>
                <div className={styles.csbRouteToggle}>
                  {['', 'Press', 'Hammer'].map(r => (
                    <button
                      key={r || 'none'}
                      type="button"
                      className={`${styles.csbRouteBtn} ${form.routing === r ? styles.csbRouteBtnActive : ''}`}
                      onClick={() => handleFormChange('routing', r)}
                    >
                      {r || 'None'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Area */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Assigned Area</label>
                <select
                  className={styles.csbFormSelect}
                  value={form.assignedArea}
                  onChange={e => handleFormChange('assignedArea', e.target.value)}
                >
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Task */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Task Assignment</label>
                <input
                  className={styles.csbFormInput}
                  type="text"
                  placeholder="e.g. Greens Mowing"
                  value={form.assignedTask}
                  onChange={e => handleFormChange('assignedTask', e.target.value)}
                />
              </div>

              {/* Shift type */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Shift Type</label>
                <select
                  className={styles.csbFormSelect}
                  value={form.shiftType}
                  onChange={e => handleFormChange('shiftType', e.target.value)}
                >
                  <option value="opening">Opening</option>
                  <option value="standard">Standard</option>
                </select>
              </div>

              {/* Status */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Status</label>
                <select
                  className={styles.csbFormSelect}
                  value={form.status}
                  onChange={e => handleFormChange('status', e.target.value)}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="half-day">Half Day</option>
                  <option value="special">Special Assignment</option>
                  <option value="off">Off</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="call-out">Call Out</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>

              {/* Notes */}
              <div className={styles.csbFormGroup}>
                <label className={styles.csbFormLabel}>Notes</label>
                <textarea
                  className={styles.csbFormTextarea}
                  rows={3}
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => handleFormChange('notes', e.target.value)}
                />
              </div>

              {/* Action buttons */}
              <div className={styles.csbFormBtnRow}>
                <button className={styles.csbBtnSave} onClick={handleSave}>Save Shift</button>
                {panelMode === 'edit' && form.id && (
                  <button className={styles.csbBtnDelete} onClick={handleDelete}>Delete</button>
                )}
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ── Crew Availability section ── */}
      <div className={styles.csbAvailSection}>
        <div className={styles.csbAvailSectionHead}>
          <h3 className={styles.csbAvailSectionTitle}>Crew Availability</h3>
          <div className={styles.csbAvailTabRow}>
            {AVAIL_TABS.map(t => (
              <button
                key={t}
                className={`${styles.csbAvailTab} ${availTab === t ? styles.csbAvailTabActive : ''}`}
                onClick={() => setAvailTab(t)}
              >
                {AVAIL_LABEL[t]}
                {t === 'pending' && pendingCount > 0 && (
                  <span className={styles.csbPendingPill}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.csbAvailList}>
          {filteredAvail.length === 0 ? (
            <p className={styles.csbAvailEmpty}>No records in this category.</p>
          ) : filteredAvail.map(avail => (
            <div key={avail.id} className={styles.csbAvailCard}>
              <div className={styles.csbAvailCardLeft}>
                <div className={styles.csbAvailNameRow}>
                  <span className={styles.csbAvailEmpName}>{avail.employeeName}</span>
                  <span className={styles.csbAvailDeptBadge}>{avail.department}</span>
                  <span className={`${styles.csbAvailTypeBadge} ${styles[`csbAvailT_${avail.type.replace(/-/g,'_')}`]}`}>
                    {AVAIL_TYPE_LABEL[avail.type] || avail.type}
                  </span>
                </div>
                <div className={styles.csbAvailReason}>{avail.reason}</div>
                <div className={styles.csbAvailMeta}>
                  {avail.startDate === avail.endDate
                    ? avail.startDate
                    : `${avail.startDate} – ${avail.endDate}`
                  }
                  <span className={styles.csbAvailReqDate}>&nbsp;· Requested {avail.requestDate}</span>
                </div>
              </div>
              <div className={styles.csbAvailCardRight}>
                <span className={`${styles.csbAvailStatusBadge} ${styles[`csbAvailS_${avail.status}`]}`}>
                  {AVAIL_STATUS_LABEL[avail.status] || avail.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div className={styles.csbToast}>{toast}</div>
      )}

    </div>
  )
}
