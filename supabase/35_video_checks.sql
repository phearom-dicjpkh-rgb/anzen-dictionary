-- ============================================================================
--  Anzen Dictionary — "are you still watching?" checks on video lessons
--  Run this after 34. Safe to re-run.
--
--  Every 20 minutes of playing time the video pauses and asks the student to
--  tap to continue. These count how often it asked and how often they tapped,
--  so the report can flag someone who left a video playing unattended.
-- ============================================================================
alter table public.video_progress
  add column if not exists checks_asked int not null default 0,
  add column if not exists checks_ok    int not null default 0;
