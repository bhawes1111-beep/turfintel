// Dashboard cross-module alerts — retained as an empty seed for back-compat
// with activityBuilder.buildFromAlerts(). Alerts are server-of-truth in Phase
// 5.4b: consume them via useAlertsData() from src/utils/alerts/alertsStore.
//
// Schema (legacy, retained for reference):
// DASHBOARD_ALERTS — [{ id, title, message, module, priority, status,
//                       timestamp, action, ... }]

export const DASHBOARD_ALERTS = []
