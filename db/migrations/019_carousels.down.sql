-- Rollback for 019_carousels.sql — removes only what it added.
-- Carousel projects become plain projects; their slide files stay.
ALTER TABLE timeline_comments DROP COLUMN slide;
ALTER TABLE project_files DROP COLUMN sort_order;
ALTER TABLE projects DROP COLUMN kind;
