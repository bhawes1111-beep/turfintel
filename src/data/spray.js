// Placeholder spray data. Replace with API calls when backend is ready.

export const SPRAY_EVENTS = [
  { id: 1, date: '2026-05-03', product: 'Heritage G',        type: 'Fungicide',  area: 'Greens + Tees', status: 'completed', applicator: 'Miguel S.' },
  { id: 2, date: '2026-05-07', product: 'Primo MAXX',        type: 'PGR',        area: 'Fairways',      status: 'completed', applicator: 'Miguel S.' },
  { id: 3, date: '2026-05-14', product: 'Headway G',         type: 'Fungicide',  area: 'Greens',        status: 'planned',   applicator: '' },
  { id: 4, date: '2026-05-14', product: 'Prodiamine 65 WDG', type: 'Herbicide',  area: 'All Roughs',    status: 'planned',   applicator: '' },
  { id: 5, date: '2026-05-21', product: 'Heritage G',        type: 'Fungicide',  area: 'Greens + Tees', status: 'planned',   applicator: '' },
  { id: 6, date: '2026-05-28', product: 'Primo MAXX',        type: 'PGR',        area: 'Fairways',      status: 'planned',   applicator: '' },
  { id: 7, date: '2026-05-28', product: 'Ferromec AC',       type: 'Fertilizer', area: 'Greens',        status: 'planned',   applicator: '' },
]

export const SPRAY_RECORDS = [
  {
    id: 1, date: '2026-05-07', product: 'Primo MAXX', type: 'PGR',
    area: 'Fairways', rate: '0.125 fl oz / 1,000 sq ft', totalProduct: '6 fl oz',
    tankVol: '150 gal', applicator: 'Miguel S.',
    temp: '72°F', wind: '6 mph SW', humidity: '65%',
    notes: '',
  },
  {
    id: 2, date: '2026-05-03', product: 'Heritage G', type: 'Fungicide',
    area: 'Greens + Tees', rate: '1.5 lbs / 1,000 sq ft', totalProduct: '12 lbs',
    tankVol: '200 gal', applicator: 'Miguel S.',
    temp: '68°F', wind: '4 mph SE', humidity: '72%',
    notes: 'Dollar spot pressure elevated on #7 green.',
  },
  {
    id: 3, date: '2026-04-21', product: 'Prodiamine 65 WDG', type: 'Herbicide',
    area: 'All Roughs', rate: '1.0 lbs / acre', totalProduct: '8 lbs',
    tankVol: '300 gal', applicator: 'Miguel S.',
    temp: '64°F', wind: '8 mph W', humidity: '55%',
    notes: 'Pre-emergent application. Good soil moisture prior.',
  },
  {
    id: 4, date: '2026-04-14', product: 'Ferromec AC', type: 'Fertilizer',
    area: 'Greens', rate: '3 fl oz / 1,000 sq ft', totalProduct: '3 gal',
    tankVol: '100 gal', applicator: 'Miguel S.',
    temp: '70°F', wind: '5 mph NE', humidity: '60%',
    notes: '',
  },
]

export const PLANNED_PROGRAMS = [
  {
    id: 1, name: 'Summer Fungicide Rotation',
    targetPest: 'Dollar Spot, Brown Patch, Pythium',
    frequency: 'Every 14–21 days',
    products: ['Heritage G', 'Headway G', 'Daconil'],
    areas: 'Greens, Tees',
    status: 'active',
    nextApp: '2026-05-14',
  },
  {
    id: 2, name: 'PGR Program',
    targetPest: 'Growth Regulation',
    frequency: 'Every 7–14 days',
    products: ['Primo MAXX'],
    areas: 'Fairways, Tees',
    status: 'active',
    nextApp: '2026-05-28',
  },
  {
    id: 3, name: 'Pre-emergent Program',
    targetPest: 'Annual Bluegrass, Crabgrass',
    frequency: 'Seasonal (spring)',
    products: ['Prodiamine 65 WDG'],
    areas: 'All Roughs',
    status: 'completed',
    nextApp: '2027-03-01',
  },
]

// Color palette shared with tag pills in ChemicalCard
export const TYPE_COLORS = {
  Fungicide:   { bg: 'rgba(124,77,255,0.18)',  text: '#a07cff', border: 'rgba(124,77,255,0.45)' },
  Herbicide:   { bg: 'rgba(220,160,50,0.18)',  text: '#dca032', border: 'rgba(220,160,50,0.45)' },
  Insecticide: { bg: 'rgba(220,70,70,0.18)',   text: '#e87070', border: 'rgba(220,70,70,0.45)'  },
  PGR:         { bg: 'rgba(0,160,160,0.18)',   text: '#40c0c0', border: 'rgba(0,160,160,0.45)'  },
  Fertilizer:  { bg: 'rgba(74,158,74,0.18)',   text: '#4a9e4a', border: 'rgba(74,158,74,0.45)'  },
}
