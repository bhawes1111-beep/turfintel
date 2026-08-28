-- Task Library categories.
--
-- Categories are supervisor-editable groupings for task_templates.category.
-- They are course-scoped so the Task Library stays consistent across
-- computers for the selected course.

CREATE TABLE IF NOT EXISTS task_categories (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_categories_course_slug
  ON task_categories(course_id, slug);

CREATE INDEX IF NOT EXISTS idx_task_categories_course_sort
  ON task_categories(course_id, sort_order, name);

INSERT INTO task_categories (id, course_id, slug, name, sort_order)
VALUES
  ('tc-crossroads-crew',        'crossroads-gc', 'crew',        'Crew',        10),
  ('tc-crossroads-irrigation',  'crossroads-gc', 'irrigation',  'Irrigation',  20),
  ('tc-crossroads-spray',       'crossroads-gc', 'spray',       'Spray',       30),
  ('tc-crossroads-agronomy',    'crossroads-gc', 'agronomy',    'Agronomy',    40),
  ('tc-crossroads-maintenance', 'crossroads-gc', 'maintenance', 'Maintenance', 50)
ON CONFLICT(course_id, slug) DO UPDATE SET
  name       = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = datetime('now');
