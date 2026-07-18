// ============================================================================
//  Anzen Dictionary — Supabase configuration
//  Project URL + anon (publishable) key. These are safe to expose in a
//  frontend (protected by RLS). NEVER put a service_role / sb_secret key here.
// ============================================================================
window.DICT_CONFIG = {
  SUPABASE_URL: "https://bnzwzexvocsqnoobyxzd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2hFZTaVF8kQPImNhWf-mwQ_NQwxalOG",
  EDGE_CREATE_USER: "swift-task"   // name of the deployed admin-create-user Edge Function
};
