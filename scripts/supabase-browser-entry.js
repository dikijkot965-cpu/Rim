import { createClient } from '@supabase/supabase-js';

// Expose only the factory required by the classic RIM bootstrap.
// This keeps authentication independent of third-party browser CDNs.
const root = typeof globalThis !== 'undefined' ? globalThis : window;
root.supabase = Object.assign(root.supabase || {}, { createClient });
