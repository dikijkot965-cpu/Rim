const required = (value, key) => { if (!value || typeof value !== 'string') throw new Error(`Missing configuration: ${key}`); return value; };
export function readConfig(source = document.documentElement.dataset) {
  return Object.freeze({
    supabaseUrl: required(source.supabaseUrl || window.RIM_CONFIG?.supabaseUrl || window.SUPABASE_URL, 'supabaseUrl'),
    supabaseAnonKey: required(source.supabaseAnonKey || window.RIM_CONFIG?.supabaseAnonKey || window.SUPABASE_ANON_KEY, 'supabaseAnonKey'),
    appVersion: source.appVersion || '2.0.0',
    requestTimeoutMs: Number(source.requestTimeoutMs || 12000),
    pageSize: Math.min(100, Math.max(20, Number(source.pageSize || 50)))
  });
}
