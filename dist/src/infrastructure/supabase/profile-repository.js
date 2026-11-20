import { Err, Ok } from '../../core/result.js';

/**
 * Profile reads for peer enrichment (chat list, mentions, cards).
 */
export class ProfileRepository {
  constructor(client) {
    this.client = client;
  }

  /**
   * @param {string[]} ids
   * @returns {Promise<import('../../core/result.js').Result<Record<string, object>>>}
   */
  async getByIds(ids) {
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!unique.length) return Ok({});
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path,bio')
        .in('id', unique);
      if (error) return Err(error);
      const result = {};
      for (const row of data || []) {
        if (row?.id != null) result[row.id] = row;
      }
      return Ok(result);
    } catch (error) {
      return Err(error);
    }
  }

  async getByUsername(username) {
    const name = String(username || '').trim().replace(/^@+/, '').toLowerCase();
    if (!name) return Err(new Error('Username пуст.'));
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('id,username,display_name,avatar_url,avatar_path,bio')
        .eq('username', name)
        .maybeSingle();
      if (error) return Err(error);
      if (!data) return Err(new Error('Пользователь не найден.'));
      return Ok(data);
    } catch (error) {
      return Err(error);
    }
  }
}
