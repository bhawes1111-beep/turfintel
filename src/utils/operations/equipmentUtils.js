export function mergeServiceLogs(baseLogs, equipmentOverrides = {}) {
  if (!equipmentOverrides || Object.keys(equipmentOverrides).length === 0) return baseLogs
  return baseLogs.map(l => {
    const override = equipmentOverrides[l.id]
    return override ? { ...l, ...override } : l
  })
}
