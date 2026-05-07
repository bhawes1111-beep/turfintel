// Placeholder inventory data. Replace with API calls when backend is ready.
// Each category is its own export so tabs only import what they need.

export const PRODUCTS = [
  { id: 1, name: 'Topdressing Sand',     category: 'Substrate',     location: 'Maintenance Barn',       unit: 'tons',  quantity: 12,  reorderLevel: 5  },
  { id: 2, name: 'Bentgrass Seed (A4)',  category: 'Seed',          location: 'Seed Storage',           unit: 'lbs',   quantity: 8,   reorderLevel: 20 },
  { id: 3, name: 'Wetting Agent',        category: 'Soil Amendment', location: 'Chemical Storage',      unit: 'gal',   quantity: 4,   reorderLevel: 2  },
  { id: 4, name: 'Marking Paint',        category: 'Misc',          location: 'Shop',                   unit: 'cans',  quantity: 24,  reorderLevel: 6  },
  { id: 5, name: 'Flag Stakes',          category: 'Misc',          location: 'Shop',                   unit: 'units', quantity: 150, reorderLevel: 50 },
  { id: 6, name: 'Cup Cutters',          category: 'Tools',         location: 'Equipment Room',         unit: 'units', quantity: 3,   reorderLevel: 2  },
]

export const CHEMICALS = [
  { id: 1, name: 'Heritage G',          type: 'Fungicide',   location: 'Chemical Storage — Shelf A', unit: 'lbs',  quantity: 24, reorderLevel: 10, expiryDate: '2027-03-01' },
  { id: 2, name: 'Headway G',           type: 'Fungicide',   location: 'Chemical Storage — Shelf A', unit: 'lbs',  quantity: 6,  reorderLevel: 10, expiryDate: '2026-11-15' },
  { id: 3, name: 'Primo MAXX',          type: 'PGR',         location: 'Chemical Storage — Shelf B', unit: 'fl oz',quantity: 32, reorderLevel: 16, expiryDate: '2027-06-01' },
  { id: 4, name: 'Prodiamine 65 WDG',   type: 'Herbicide',   location: 'Chemical Storage — Shelf B', unit: 'lbs',  quantity: 2,  reorderLevel: 5,  expiryDate: '2028-01-01' },
  { id: 5, name: 'Sevin SL',            type: 'Insecticide', location: 'Chemical Storage — Shelf C', unit: 'fl oz',quantity: 0,  reorderLevel: 8,  expiryDate: '2026-09-01' },
]

export const FERTILIZERS = [
  { id: 1, name: 'Ferromec AC',         analysis: '7-0-0 + 5.5% Fe', location: 'Chemical Storage',    unit: 'gal',  quantity: 10, reorderLevel: 4 },
  { id: 2, name: '16-4-8 Granular',     analysis: '16-4-8',           location: 'Fertilizer Storage',  unit: 'bags', quantity: 20, reorderLevel: 8 },
  { id: 3, name: 'Potassium Sulfate',   analysis: '0-0-50',           location: 'Fertilizer Storage',  unit: 'bags', quantity: 5,  reorderLevel: 4 },
  { id: 4, name: 'CalPhos',             analysis: '0-20-0 + Ca',      location: 'Fertilizer Storage',  unit: 'bags', quantity: 0,  reorderLevel: 3 },
]

export const PARTS = [
  { id: 1, name: 'Reel Blade Set',       equipment: 'Greens Mower',   partNumber: 'TRO-9801', location: 'Parts Room',   quantity: 2,  reorderLevel: 1 },
  { id: 2, name: 'Hydraulic Filter',     equipment: 'Fairway Mower',  partNumber: 'JD-F4420', location: 'Parts Room',   quantity: 4,  reorderLevel: 2 },
  { id: 3, name: 'Spark Plugs (Box/8)',  equipment: 'Various',        partNumber: 'NGK-BR9',  location: 'Parts Room',   quantity: 1,  reorderLevel: 2 },
  { id: 4, name: 'V-Belt (A48)',         equipment: 'Rotary Mower',   partNumber: 'A48-STD',  location: 'Parts Room',   quantity: 0,  reorderLevel: 2 },
  { id: 5, name: 'Grease Cartridges',   equipment: 'Various',        partNumber: 'GRS-LC',   location: 'Lube Station', quantity: 12, reorderLevel: 4 },
]

export const FUEL = [
  { id: 1, type: 'Diesel',        tankCapacity: 500, currentLevel: 180, unit: 'gal', location: 'Fuel Island — Tank 1', lastFill: '2026-04-30' },
  { id: 2, type: 'Unleaded',      tankCapacity: 250, currentLevel: 60,  unit: 'gal', location: 'Fuel Island — Tank 2', lastFill: '2026-05-02' },
  { id: 3, type: 'Pre-Mix (50:1)',tankCapacity: 5,   currentLevel: 1.5, unit: 'gal', location: 'Shop Shelf',           lastFill: '2026-05-01' },
]

export const PURCHASE_HISTORY = [
  { id: 1, date: '2026-05-02', product: 'Heritage G',          category: 'Chemical',   quantity: 24,  unit: 'lbs',  vendor: 'Ewing Irrigation', cost: 312.00,  status: 'Received' },
  { id: 2, date: '2026-04-28', product: '16-4-8 Granular',     category: 'Fertilizer', quantity: 20,  unit: 'bags', vendor: 'SiteOne',          cost: 480.00,  status: 'Received' },
  { id: 3, date: '2026-04-20', product: 'Diesel',              category: 'Fuel',       quantity: 320, unit: 'gal',  vendor: 'Local Fuel Co.',   cost: 998.40,  status: 'Received' },
  { id: 4, date: '2026-05-05', product: 'Prodiamine 65 WDG',   category: 'Chemical',   quantity: 5,   unit: 'lbs',  vendor: 'Ewing Irrigation', cost: 145.00,  status: 'Ordered'  },
  { id: 5, date: '2026-05-06', product: 'Reel Blade Set',      category: 'Parts',      quantity: 2,   unit: 'sets', vendor: 'Toro Parts',       cost: 220.00,  status: 'Pending'  },
]
