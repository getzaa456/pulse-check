import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;

export type Monitor = {
  id: string;
  userId: string;
  name: string;
  url: string;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCode: number;
  enabled: boolean;
  state: 'UNKNOWN' | 'UP' | 'DOWN';
  lastCheckedAt: Date | null;
  nextCheckAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckResult = {
  id: string;
  monitorId: string;
  status: 'UP' | 'DOWN';
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string;
  checkedAt: Date;
};

export class Database {
  readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async monitorStateCounts(): Promise<{ UP: number; DOWN: number; UNKNOWN: number }> {
    const result = await this.pool.query(
      `SELECT current_state AS state, count(*)::int AS count
       FROM monitors
       WHERE enabled=true
       GROUP BY current_state`,
    );
    const counts = { UP: 0, DOWN: 0, UNKNOWN: 0 };
    for (const row of result.rows as Array<{ state: 'UP' | 'DOWN' | 'UNKNOWN'; count: number }>) {
      counts[row.state] = row.count;
    }
    return counts;
  }

  async migrate(): Promise<void> {
    await this.pool.query(schema);
  }

  async createUser(email: string, passwordHash: string) {
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO users(id,email,password_hash)
       VALUES($1,lower($2),$3)
       RETURNING id,email,password_hash AS "passwordHash",created_at AS "createdAt"`,
      [id, email, passwordHash],
    );
    return result.rows[0] as {
      id: string;
      email: string;
      passwordHash: string;
      createdAt: Date;
    };
  }

  async findUserByEmail(email: string) {
    const result = await this.pool.query(
      `SELECT id,email,password_hash AS "passwordHash",created_at AS "createdAt"
       FROM users WHERE email=lower($1)`,
      [email],
    );
    return result.rows[0] as
      { id: string; email: string; passwordHash: string; createdAt: Date } | undefined;
  }

  async createMonitor(
    userId: string,
    input: Omit<
      Monitor,
      'id' | 'userId' | 'state' | 'lastCheckedAt' | 'nextCheckAt' | 'createdAt' | 'updatedAt'
    >,
  ) {
    const result = await this.pool.query(
      `INSERT INTO monitors
       (id,user_id,name,url,interval_seconds,timeout_ms,expected_status_code,enabled,next_check_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
       RETURNING id,user_id AS "userId",name,url,interval_seconds AS "intervalSeconds",
         timeout_ms AS "timeoutMs",expected_status_code AS "expectedStatusCode",
         enabled,current_state AS state,last_checked_at AS "lastCheckedAt",
         next_check_at AS "nextCheckAt",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        randomUUID(),
        userId,
        input.name,
        input.url,
        input.intervalSeconds,
        input.timeoutMs,
        input.expectedStatusCode,
        input.enabled,
      ],
    );
    return result.rows[0] as Monitor;
  }

  async listMonitors(userId: string): Promise<Monitor[]> {
    const result = await this.pool.query(
      `SELECT id,user_id AS "userId",name,url,interval_seconds AS "intervalSeconds",
       timeout_ms AS "timeoutMs",expected_status_code AS "expectedStatusCode",enabled,
       current_state AS state,last_checked_at AS "lastCheckedAt",next_check_at AS "nextCheckAt",
       created_at AS "createdAt",updated_at AS "updatedAt"
       FROM monitors WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows as Monitor[];
  }

  async getMonitor(userId: string, id: string): Promise<Monitor | undefined> {
    const result = await this.pool.query(
      `SELECT id,user_id AS "userId",name,url,interval_seconds AS "intervalSeconds",
       timeout_ms AS "timeoutMs",expected_status_code AS "expectedStatusCode",enabled,
       current_state AS state,last_checked_at AS "lastCheckedAt",next_check_at AS "nextCheckAt",
       created_at AS "createdAt",updated_at AS "updatedAt"
       FROM monitors WHERE id=$1 AND user_id=$2`,
      [id, userId],
    );
    return result.rows[0] as Monitor | undefined;
  }

  async updateMonitor(
    userId: string,
    id: string,
    input: {
      name: string;
      url: string;
      intervalSeconds: number;
      timeoutMs: number;
      expectedStatusCode: number;
      enabled: boolean;
    },
  ): Promise<Monitor | undefined> {
    const result = await this.pool.query(
      `UPDATE monitors SET name=$3,url=$4,interval_seconds=$5,timeout_ms=$6,
       expected_status_code=$7,enabled=$8,updated_at=now()
       WHERE id=$1 AND user_id=$2
       RETURNING id,user_id AS "userId",name,url,interval_seconds AS "intervalSeconds",
       timeout_ms AS "timeoutMs",expected_status_code AS "expectedStatusCode",enabled,
       current_state AS state,last_checked_at AS "lastCheckedAt",next_check_at AS "nextCheckAt",
       created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        id,
        userId,
        input.name,
        input.url,
        input.intervalSeconds,
        input.timeoutMs,
        input.expectedStatusCode,
        input.enabled,
      ],
    );
    return result.rows[0] as Monitor | undefined;
  }

  async deleteMonitor(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM monitors WHERE id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async claimDueMonitors(limit = 100): Promise<Monitor[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id,user_id AS "userId",name,url,interval_seconds AS "intervalSeconds",
         timeout_ms AS "timeoutMs",expected_status_code AS "expectedStatusCode",enabled,
         current_state AS state,last_checked_at AS "lastCheckedAt",next_check_at AS "nextCheckAt",
         created_at AS "createdAt",updated_at AS "updatedAt"
         FROM monitors WHERE enabled=true AND next_check_at<=now()
         ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      for (const monitor of result.rows as Monitor[]) {
        await client.query(
          `UPDATE monitors SET next_check_at=now()+($2 * interval '1 second') WHERE id=$1`,
          [monitor.id, monitor.intervalSeconds],
        );
      }
      await client.query('COMMIT');
      return result.rows as Monitor[];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordCheck(
    monitorId: string,
    result: {
      status: 'UP' | 'DOWN';
      httpStatusCode: number | null;
      responseTimeMs: number | null;
      errorMessage: string;
    },
  ): Promise<'DOWN' | 'RECOVERED' | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const monitorResult = await client.query(
        'SELECT current_state FROM monitors WHERE id=$1 FOR UPDATE',
        [monitorId],
      );
      const previous = monitorResult.rows[0]?.current_state as
        'UNKNOWN' | 'UP' | 'DOWN' | undefined;
      if (!previous) throw new Error('monitor not found');

      await client.query(
        `INSERT INTO check_results
         (id,monitor_id,status,http_status_code,response_time_ms,error_message)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          monitorId,
          result.status,
          result.httpStatusCode,
          result.responseTimeMs,
          result.errorMessage,
        ],
      );
      await client.query(
        'UPDATE monitors SET current_state=$2,last_checked_at=now(),updated_at=now() WHERE id=$1',
        [monitorId, result.status],
      );

      let event: 'DOWN' | 'RECOVERED' | null = null;
      if (result.status === 'DOWN' && previous !== 'DOWN') {
        const incidentId = randomUUID();
        await client.query('INSERT INTO incidents(id,monitor_id,started_at) VALUES($1,$2,now())', [
          incidentId,
          monitorId,
        ]);
        await client.query(
          `INSERT INTO notification_events(id,monitor_id,incident_id,event_type,dedupe_key)
           VALUES($1,$2,$3,'DOWN',$4) ON CONFLICT(dedupe_key) DO NOTHING`,
          [randomUUID(), monitorId, incidentId, `down:${incidentId}`],
        );
        event = 'DOWN';
      } else if (result.status === 'UP' && previous === 'DOWN') {
        const incident = await client.query(
          `UPDATE incidents SET resolved_at=now()
           WHERE id=(SELECT id FROM incidents WHERE monitor_id=$1 AND resolved_at IS NULL
                     ORDER BY started_at DESC LIMIT 1)
           RETURNING id`,
          [monitorId],
        );
        const incidentId = incident.rows[0]?.id as string | undefined;
        if (incidentId) {
          await client.query(
            `INSERT INTO notification_events(id,monitor_id,incident_id,event_type,dedupe_key)
             VALUES($1,$2,$3,'RECOVERED',$4) ON CONFLICT(dedupe_key) DO NOTHING`,
            [randomUUID(), monitorId, incidentId, `recovered:${incidentId}`],
          );
          event = 'RECOVERED';
        }
      }

      await client.query('COMMIT');
      return event;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recentChecks(monitorId: string, limit = 100): Promise<CheckResult[]> {
    const result = await this.pool.query(
      `SELECT id,monitor_id AS "monitorId",status,http_status_code AS "httpStatusCode",
       response_time_ms AS "responseTimeMs",error_message AS "errorMessage",checked_at AS "checkedAt"
       FROM check_results WHERE monitor_id=$1 ORDER BY checked_at DESC LIMIT $2`,
      [monitorId, limit],
    );
    return result.rows as CheckResult[];
  }

  async createStatusPage(
    userId: string,
    input: {
      name: string;
      slug: string;
      published: boolean;
      monitorIds: string[];
    },
  ) {
    const client = await this.pool.connect();
    const id = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO status_pages(id,user_id,name,slug,published) VALUES($1,$2,$3,$4,$5)',
        [id, userId, input.name, input.slug, input.published],
      );
      for (const [index, monitorId] of input.monitorIds.entries()) {
        await client.query(
          `INSERT INTO status_page_monitors(status_page_id,monitor_id,display_order)
           SELECT $1,id,$3 FROM monitors WHERE id=$2 AND user_id=$4`,
          [id, monitorId, index, userId],
        );
      }
      await client.query('COMMIT');
      return { id, ...input };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async publicStatus(slug: string) {
    const page = await this.pool.query(
      'SELECT id,name FROM status_pages WHERE slug=$1 AND published=true',
      [slug],
    );
    if (!page.rows[0]) return undefined;

    const monitors = await this.pool.query(
      `SELECT m.id,m.name,m.current_state AS state,m.last_checked_at AS "lastCheckedAt"
       FROM monitors m JOIN status_page_monitors spm ON spm.monitor_id=m.id
       WHERE spm.status_page_id=$1 AND m.enabled=true
       ORDER BY spm.display_order,m.name`,
      [page.rows[0].id],
    );

    const enriched = await Promise.all(
      monitors.rows.map(async (monitor) => {
        const checks = await this.recentChecks(monitor.id, 50);
        const uptime =
          checks.length === 0
            ? 0
            : (checks.filter((check) => check.status === 'UP').length / checks.length) * 100;
        return { ...monitor, uptimePercentage: uptime, recentResponseTimes: checks };
      }),
    );

    const incidents = await this.pool.query(
      `SELECT i.id,i.monitor_id AS "monitorId",i.started_at AS "startedAt",i.resolved_at AS "resolvedAt"
       FROM incidents i JOIN status_page_monitors spm ON spm.monitor_id=i.monitor_id
       WHERE spm.status_page_id=$1 ORDER BY i.started_at DESC LIMIT 20`,
      [page.rows[0].id],
    );

    return { name: page.rows[0].name as string, monitors: enriched, incidents: incidents.rows };
  }

  async pendingNotificationEvents(limit = 50) {
    const result = await this.pool.query(
      `SELECT e.id,e.event_type AS "eventType",m.name AS "monitorName",m.url AS "targetUrl"
       FROM notification_events e JOIN monitors m ON m.id=e.monitor_id
       WHERE e.sent_at IS NULL ORDER BY e.created_at LIMIT $1`,
      [limit],
    );
    return result.rows as {
      id: string;
      eventType: 'DOWN' | 'RECOVERED';
      monitorName: string;
      targetUrl: string;
    }[];
  }

  async markNotificationSent(id: string): Promise<void> {
    await this.pool.query('UPDATE notification_events SET sent_at=now() WHERE id=$1', [id]);
  }
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitors (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  interval_seconds integer NOT NULL CHECK (interval_seconds IN (60,300,600)),
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 100 AND 30000),
  expected_status_code integer NOT NULL CHECK (expected_status_code BETWEEN 100 AND 599),
  enabled boolean NOT NULL DEFAULT true,
  current_state text NOT NULL DEFAULT 'UNKNOWN' CHECK (current_state IN ('UNKNOWN','UP','DOWN')),
  last_checked_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitors_due_idx ON monitors(enabled,next_check_at);

CREATE TABLE IF NOT EXISTS check_results (
  id uuid PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('UP','DOWN')),
  http_status_code integer,
  response_time_ms integer,
  error_message text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_results_monitor_time_idx
  ON check_results(monitor_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS status_pages (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  published boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS status_page_monitors (
  status_page_id uuid NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(status_page_id,monitor_id)
);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY,
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('DOWN','RECOVERED')),
  dedupe_key text NOT NULL UNIQUE,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
