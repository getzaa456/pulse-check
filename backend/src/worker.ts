import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { checkTarget } from './checker.js';
import { loadConfig } from './config.js';
import { Database, type Monitor } from './db.js';
import { Notifier } from './notifier.js';

const config = loadConfig();
const db = new Database(config.DATABASE_URL);
await db.migrate();

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const checkQueue = new Queue<Monitor>('pulse-check-checks', { connection });
const notifier = new Notifier(config);

const worker = new Worker<Monitor>(
  'pulse-check-checks',
  async (job) => {
    const monitor = job.data;
    const result = await checkTarget(monitor.url, monitor.timeoutMs, monitor.expectedStatusCode);
    const event = await db.recordCheck(monitor.id, result);
    console.log(`checked ${monitor.name}: ${result.status}${event ? ` (${event})` : ''}`);
  },
  { connection, concurrency: 20 },
);

worker.on('failed', (job, error) => {
  console.error(`check job ${job?.id ?? 'unknown'} failed`, error);
});

async function scheduleDueMonitors() {
  try {
    const monitors = await db.claimDueMonitors(100);
    await Promise.all(
      monitors.map((monitor) =>
        checkQueue.add('check', monitor, {
          jobId: `${monitor.id}-${monitor.nextCheckAt.getTime()}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        }),
      ),
    );
  } catch (error) {
    console.error('scheduler failed', error);
  }
}

async function sendNotifications() {
  try {
    const events = await db.pendingNotificationEvents();
    for (const event of events) {
      try {
        await notifier.send(event.monitorName, event.targetUrl, event.eventType);
        await db.markNotificationSent(event.id);
      } catch (error) {
        console.error(`notification ${event.id} failed`, error);
      }
    }
  } catch (error) {
    console.error('notification loop failed', error);
  }
}

await scheduleDueMonitors();
await sendNotifications();

const schedulerTimer = setInterval(scheduleDueMonitors, 10_000);
const notificationTimer = setInterval(sendNotifications, 10_000);

async function shutdown() {
  clearInterval(schedulerTimer);
  clearInterval(notificationTimer);
  await worker.close();
  await checkQueue.close();
  connection.disconnect();
  await db.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
