import assert from 'node:assert/strict'
import { fetchApplicationDateWeather } from '../src/utils/weather/api.js'

function dateKey(offsetDays) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const futureDate = dateKey(2)
const pastDate = dateKey(-2)

globalThis.fetch = async urlValue => {
  const url = String(urlValue)
  if (url.includes('/points/')) {
    return Response.json({ properties: { forecastHourly: 'https://example.test/hourly' } })
  }
  if (url === 'https://example.test/hourly') {
    return Response.json({
      properties: {
        periods: [{
          startTime: `${futureDate}T12:00:00-04:00`,
          endTime: `${futureDate}T13:00:00-04:00`,
          temperature: 84,
          relativeHumidity: { value: 64 },
          windSpeed: '5 to 9 mph',
          windDirection: 'SW',
        }],
      },
    })
  }
  if (url.includes('/stations/KSAV/observations?')) {
    return Response.json({
      features: [{
        properties: {
          timestamp: `${pastDate}T08:00:00-04:00`,
          temperature: { value: 25, unitCode: 'wmoUnit:degC' },
          dewpoint: { value: 20, unitCode: 'wmoUnit:degC' },
          relativeHumidity: { value: 72 },
          windSpeed: { value: 16.0934, unitCode: 'wmoUnit:km_h-1' },
          windDirection: { value: 180 },
          precipitationLastHour: { value: 0 },
        },
      }],
    })
  }
  throw new Error(`Unexpected weather request: ${url}`)
}

const forecast = await fetchApplicationDateWeather({ date: futureDate, time: '12:15' })
assert.equal(forecast?.kind, 'forecast')
assert.equal(forecast?.sourceLabel, 'NWS hourly forecast')
assert.equal(forecast?.current?.currentTemp, 84)
assert.equal(forecast?.current?.wind, 9)
assert.equal(forecast?.current?.windDir, 'SW')

const historical = await fetchApplicationDateWeather({ date: pastDate, time: '08:10' })
assert.equal(historical?.kind, 'historical')
assert.equal(historical?.sourceLabel, 'NWS historical observation')
assert.equal(historical?.current?.currentTemp, 77)
assert.equal(historical?.current?.humidity, 72)
assert.equal(historical?.current?.windDir, 'S')

console.log('Date-specific weather provider smoke checks passed.')
