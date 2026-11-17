-- Rollback for 025_playbook.sql — removes only what it added.
-- Uploaded files stay in R2 under playbook/ (delete them there if wanted).
DROP TABLE IF EXISTS playbook_views;
DROP TABLE IF EXISTS playbook_attachments;
DROP TABLE IF EXISTS playbook_videos;
DROP TABLE IF EXISTS playbook_section_clients;
DROP TABLE IF EXISTS playbook_sections;
