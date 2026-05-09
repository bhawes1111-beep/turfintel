import { COMMANDS } from './commandRegistry'

// Score-ranked fuzzy filter. Higher score = better match.
export function filterCommands(query) {
  const q = query.trim().toLowerCase()
  if (!q) return COMMANDS

  return COMMANDS
    .map(cmd => {
      const label = cmd.label.toLowerCase()
      const desc  = cmd.description.toLowerCase()
      let score = 0

      if (label === q)                                          score = 20
      else if (label.startsWith(q))                            score = 15
      else if (label.includes(q))                              score = 10
      else if (desc.includes(q))                               score = 6
      else if (cmd.keywords.some(k => k.startsWith(q)))        score = 5
      else if (cmd.keywords.some(k => k.includes(q)))          score = 3
      else if (cmd.keywords.some(k => q.includes(k) && k.length >= 3)) score = 1

      return score > 0 ? { ...cmd, score } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
}

// Group a flat command list by their group property.
// Returns [{ label, items }].
export function groupCommands(commands) {
  const map = new Map()
  for (const cmd of commands) {
    if (!map.has(cmd.group)) map.set(cmd.group, [])
    map.get(cmd.group).push(cmd)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
}
