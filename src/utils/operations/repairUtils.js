export function mergeRepairs(baseRepairs, repairOverrides = {}) {
  if (!repairOverrides || Object.keys(repairOverrides).length === 0) return baseRepairs
  return baseRepairs.map(r => {
    const override = repairOverrides[r.repairId]
    return override ? { ...r, ...override } : r
  })
}
