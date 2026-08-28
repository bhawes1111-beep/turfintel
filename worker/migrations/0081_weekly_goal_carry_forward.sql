ALTER TABLE weekly_goals ADD COLUMN carried_from_goal_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_goals_carried_from
  ON weekly_goals(carried_from_goal_id)
  WHERE carried_from_goal_id IS NOT NULL;
