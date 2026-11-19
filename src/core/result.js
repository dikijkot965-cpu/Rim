/** @template T,E */
export const Ok = value => Object.freeze({ ok: true, value });
/** @template E */
export const Err = error => Object.freeze({ ok: false, error });
export const fromSupabase = ({ data, error }) => error ? Err(error) : Ok(data);
