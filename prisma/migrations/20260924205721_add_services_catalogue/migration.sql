-- Consolidated into the repaired baseline in 20260924202220_add_gabon_locations. See
-- docs/account-management.md for the full incident writeup. Every table/column this migration used
-- to add ("Category"."description", "Service"."catalogServiceId", ServiceSubcategory,
-- CatalogService, ProfessionalService, ServiceSuggestion, plus their indexes/FKs) is now created by
-- the baseline migration above, so this file is intentionally a no-op. The folder is kept (not
-- deleted) to preserve migration ordering and the historical name/timestamp.
SELECT 1;
