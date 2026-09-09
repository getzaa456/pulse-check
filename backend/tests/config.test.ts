import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('treats empty optional notification settings as unset', () => {
    const config = loadConfig({
      JWT_SECRET: 'a-long-development-secret',
      ALERT_EMAIL: '',
      DISCORD_WEBHOOK_URL: '',
      SMTP_HOST: '',
    });

    expect(config.ALERT_EMAIL).toBeUndefined();
    expect(config.DISCORD_WEBHOOK_URL).toBeUndefined();
    expect(config.SMTP_HOST).toBeUndefined();
  });
});
