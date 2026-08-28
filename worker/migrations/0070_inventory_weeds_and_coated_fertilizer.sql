-- Optional weed-control targets for chemical inventory items and coating
-- metadata for fertilizer inventory items.
--
-- weed_targets is JSON rows so herbicides can list multiple weeds and mark
-- each as pre-emergent, post-emergent, pre+post, or suppression.
--
-- fertilizer_coating is a JSON object that captures coated / controlled-release
-- fertilizer details without forcing every fertilizer row into those fields.

ALTER TABLE inventory_items ADD COLUMN weed_targets TEXT;
ALTER TABLE inventory_items ADD COLUMN fertilizer_coating TEXT;
