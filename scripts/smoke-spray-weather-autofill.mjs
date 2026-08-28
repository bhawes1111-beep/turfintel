import { readFileSync } from 'node:fs'

const SRC = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const CSS = readFileSync('src/pages/Spray/Spray.module.css', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`not ok - ${message}`)
    process.exitCode = 1
  } else {
    console.log(`ok - ${message}`)
  }
}

assert(/import \{ useWeather \} from '\.\.\/\.\.\/\.\.\/utils\/weather\/useWeather'/.test(SRC),
  'spray builder imports the shared live weather hook')

assert(/const weather\s+=\s+useWeather\(\)/.test(SRC),
  'spray builder subscribes to live weather')

assert(/function buildWeatherConditionPatch\(current\)/.test(SRC),
  'weather condition patch helper exists')

assert(/current\.currentTemp/.test(SRC) && /current\.wind/.test(SRC) && /current\.windDir/.test(SRC) && /current\.humidity/.test(SRC),
  'autofill maps temperature, wind speed, wind direction, and humidity')

assert(/current\.soilTemp/.test(SRC),
  'autofill maps soil temperature when station data has it')

assert(!/if \(draft\.date !== TODAY\) return/.test(SRC) && !/prev\.date !== TODAY/.test(SRC),
  'autofill is not blocked by the selected spray date')

assert(/isBlankValue\(nextConditions\[field\]\)/.test(SRC),
  'autofill only fills blank condition fields')

assert(/weatherAutoFillKeyRef\.current = null/.test(SRC),
  'draft reset allows the next fresh spray sheet to autofill weather again')

assert(/Weather filled from/.test(SRC),
  'conditions step shows weather source status after autofill')

assert(/function WeatherAutofillPanel/.test(SRC) && /Use weather/.test(SRC),
  'conditions step renders a visible live weather panel with a fill action')

assert(/\.naWeatherAutofill/.test(CSS) && /\.naWeatherAutofillDot/.test(CSS),
  'weather autofill status is styled')

assert(/\.naWeatherPanel/.test(CSS) && /\.naWeatherFillBtn/.test(CSS),
  'live weather panel is styled')
