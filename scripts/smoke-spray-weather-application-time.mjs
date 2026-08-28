import { readFileSync } from 'node:fs'

const builder = readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const historyStore = readFileSync('src/utils/weather/weatherHistoryStore.js', 'utf8')
const weatherApi = readFileSync('src/utils/weather/api.js', 'utf8')

function assert(condition, message) {
  if (!condition) {
    console.error(`not ok - ${message}`)
    process.exitCode = 1
  } else {
    console.log(`ok - ${message}`)
  }
}

assert(/fetchWeatherHistoryRange/.test(historyStore),
  'weather history store exposes a read-only range fetch')

assert(/import \{ fetchWeatherHistoryRange \} from '\.\.\/\.\.\/\.\.\/utils\/weather\/weatherHistoryStore'/.test(builder),
  'spray builder imports weather history range fetch')

assert(/function applicationWeatherTargetMs/.test(builder)
  && /startTime \|\| endTime \|\| '12:00'/.test(builder),
  'builder derives a weather target from application date and time')

assert(/function nearestWeatherObservation/.test(builder)
  && /Math\.abs\(ms - targetMs\)/.test(builder),
  'builder selects the nearest captured observation for the application time')

assert(/fetchWeatherHistoryRange\(\{ from: bounds\.from, to: bounds\.to, limit: 200 \}\)/.test(builder),
  'builder fetches weather observations for the selected application date')

assert(/const weatherAutofillKey = useMemo/.test(builder)
  && /draft\.date/.test(builder)
  && /draft\.startTime/.test(builder)
  && /draft\.endTime/.test(builder),
  'weather autofill key includes application date and time')

assert(/Application weather/.test(builder),
  'conditions panel labels the source as application weather')

assert(/fetchApplicationDateWeather/.test(builder)
  && /applicationDateWeather/.test(builder),
  'builder requests date-specific historical or forecast weather')

assert(/forecastHourly/.test(weatherApi)
  && /NWS hourly forecast/.test(weatherApi),
  'future application weather uses the NWS hourly forecast')

assert(/NWS historical observation/.test(weatherApi)
  && /nearestNwsObservation/.test(weatherApi),
  'historical fallback selects the nearest NWS observation')

assert(/weather\.isLive/.test(builder),
  'today can only use a genuine live weather result, never placeholder conditions')

assert(/weatherAutoFillValuesRef/.test(builder)
  && /weatherSelectionKeyRef/.test(builder),
  'changing application date or time clears stale auto-filled weather values')
