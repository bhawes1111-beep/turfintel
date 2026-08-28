-- Staged purchase invoices. Upload and review never alter inventory.
-- Inventory quantities change only when an invoice is explicitly approved.

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL,
  vendor              TEXT,
  invoice_number      TEXT,
  invoice_date        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  subtotal            REAL,
  tax                 REAL,
  total               REAL,
  pdf_attachment_id   TEXT,
  raw_text             TEXT,
  extraction_note     TEXT,
  approved_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id                  TEXT PRIMARY KEY,
  invoice_id          TEXT NOT NULL,
  line_order          INTEGER NOT NULL DEFAULT 0,
  description         TEXT NOT NULL,
  sku                 TEXT,
  quantity            REAL NOT NULL DEFAULT 0,
  unit                TEXT,
  unit_price          REAL,
  line_total          REAL,
  inventory_item_id   TEXT,
  inventory_kind      TEXT,
  include_in_inventory INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_course_status
  ON purchase_invoices(course_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice
  ON purchase_invoice_lines(invoice_id, line_order);
