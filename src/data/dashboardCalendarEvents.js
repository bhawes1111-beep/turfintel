// Combined placeholder calendar events drawn from all modules.
// date format: YYYY-MM-DD  |  type keys match EVENT_COLORS in calendarTokens.js

export const DASHBOARD_CALENDAR_EVENTS = [
  // ── Spray ─────────────────────────────────────────────────────────────
  { id: 'cal-s1', title: 'Fairway Fungicide',       type: 'spray',     category: 'Spray',     date: '2026-05-03', status: 'completed'    },
  { id: 'cal-s2', title: 'Greens Biostimulant',     type: 'spray',     category: 'Spray',     date: '2026-05-08', status: 'planned'      },
  { id: 'cal-s3', title: 'Rough Herbicide',          type: 'spray',     category: 'Spray',     date: '2026-05-19', status: 'planned'      },
  { id: 'cal-s4', title: 'Collar Pre-emergent',      type: 'spray',     category: 'Spray',     date: '2026-05-26', status: 'planned'      },

  // ── Cultural practices ─────────────────────────────────────────────────
  { id: 'cal-c1', title: 'Aerification – Greens',   type: 'cultural',  category: 'Cultural',  date: '2026-05-13', status: 'planned'      },
  { id: 'cal-c2', title: 'Topdressing',              type: 'cultural',  category: 'Cultural',  date: '2026-05-20', status: 'planned'      },
  { id: 'cal-c3', title: 'Verticutting – Fairways',  type: 'cultural',  category: 'Cultural',  date: '2026-05-27', status: 'planned'      },

  // ── Crew ───────────────────────────────────────────────────────────────
  { id: 'cal-r1', title: 'Staff Training Day',      type: 'crew',      category: 'Crew',      date: '2026-05-01', status: 'completed'    },
  { id: 'cal-r2', title: 'Safety Briefing',         type: 'crew',      category: 'Crew',      date: '2026-05-15', status: 'planned'      },

  // ── Equipment ──────────────────────────────────────────────────────────
  { id: 'cal-e1', title: 'Mower Fleet Service',     type: 'equipment', category: 'Equipment', date: '2026-05-06', status: 'completed'    },
  { id: 'cal-e2', title: 'Irrigation Audit',         type: 'equipment', category: 'Equipment', date: '2026-05-14', status: 'planned'      },
  { id: 'cal-e3', title: 'Pump Station Inspection',  type: 'equipment', category: 'Equipment', date: '2026-05-29', status: 'planned'      },

  // ── Disease ────────────────────────────────────────────────────────────
  { id: 'cal-d1', title: 'Dollar Spot Scouting',    type: 'disease',   category: 'Disease',   date: '2026-05-07', status: 'in-progress'  },
  { id: 'cal-d2', title: 'Pythium Scout',            type: 'disease',   category: 'Disease',   date: '2026-05-21', status: 'planned'      },

  // ── Plant nutrition ────────────────────────────────────────────────────
  { id: 'cal-n1', title: 'Foliar Feed – Greens',    type: 'nutrition', category: 'Nutrition', date: '2026-05-09', status: 'planned'      },
  { id: 'cal-n2', title: 'Soil Sample Collection',   type: 'nutrition', category: 'Nutrition', date: '2026-05-22', status: 'planned'      },

  // ── Budget ─────────────────────────────────────────────────────────────
  { id: 'cal-b1', title: 'Monthly Budget Review',   type: 'budget',    category: 'Budget',    date: '2026-05-28', status: 'planned'      },
]
