export const DEFAULT_MOISTURE_DISPLAY_SETTINGS = {
  dryBelow: 22,
  wetAbove: 28,
  dryColor: '#ef8f3c',
  targetColor: '#5aa45f',
  wetColor: '#4387cc',
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function normalizeMoistureDisplaySettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  const dryBelow = Number.isFinite(Number(source.dryBelow))
    ? Number(source.dryBelow)
    : DEFAULT_MOISTURE_DISPLAY_SETTINGS.dryBelow
  const wetAbove = Number.isFinite(Number(source.wetAbove))
    ? Number(source.wetAbove)
    : DEFAULT_MOISTURE_DISPLAY_SETTINGS.wetAbove

  return {
    dryBelow: dryBelow < wetAbove ? dryBelow : DEFAULT_MOISTURE_DISPLAY_SETTINGS.dryBelow,
    wetAbove: dryBelow < wetAbove ? wetAbove : DEFAULT_MOISTURE_DISPLAY_SETTINGS.wetAbove,
    dryColor: COLOR_PATTERN.test(source.dryColor) ? source.dryColor.toLowerCase() : DEFAULT_MOISTURE_DISPLAY_SETTINGS.dryColor,
    targetColor: COLOR_PATTERN.test(source.targetColor) ? source.targetColor.toLowerCase() : DEFAULT_MOISTURE_DISPLAY_SETTINGS.targetColor,
    wetColor: COLOR_PATTERN.test(source.wetColor) ? source.wetColor.toLowerCase() : DEFAULT_MOISTURE_DISPLAY_SETTINGS.wetColor,
  }
}
