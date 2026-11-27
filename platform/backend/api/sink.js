// Event sink for analytics. EVENT_SINK=bigquery streams each event to BigQuery; anything else
// (the default) is a no-op. This is a stub: it uses streaming inserts and logs failures
// without retrying. For production, publish to the Pub/Sub topic in infra/terraform and let a
// BigQuery subscription write the table.
//
// Env: EVENT_SINK (none | bigquery), BQ_DATASET (default cai3801), BQ_TABLE (default events)

export function eventToRow(evt) {
  return {
    id: evt.id,
    actor: evt.actor,
    verb: evt.verb,
    object: evt.object,
    week: evt.week ?? null,
    ts: evt.ts,
    score: evt.result && typeof evt.result.score === 'number' ? evt.result.score : null,
    duration_sec: evt.result && typeof evt.result.durationSec === 'number' ? Math.round(evt.result.durationSec) : null,
  };
}

export async function createSink(env = process.env, { logger = console } = {}) {
  if (env.EVENT_SINK !== 'bigquery') {
    return { kind: 'none', async write() {} };
  }
  const { BigQuery } = await import('@google-cloud/bigquery');
  const bq = new BigQuery(env.GOOGLE_CLOUD_PROJECT ? { projectId: env.GOOGLE_CLOUD_PROJECT } : {});
  const table = bq.dataset(env.BQ_DATASET || 'cai3801').table(env.BQ_TABLE || 'events');
  return {
    kind: 'bigquery',
    async write(evt) {
      try {
        // raw rows let us pass the event id as insertId for best-effort de-duplication.
        await table.insert([{ insertId: evt.id, json: eventToRow(evt) }], { raw: true });
      } catch (err) {
        logger.error(`[sink] BigQuery insert failed for ${evt.id}: ${err.message}`);
      }
    },
  };
}
