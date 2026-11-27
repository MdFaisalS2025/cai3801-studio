// API entry point (Cloud Run sets PORT).
import { buildService } from './bootstrap.js';
import { createApp } from './app.js';

const { service, store, llm, sink } = await buildService();
const app = createApp({ service, demoAuthEnabled: process.env.DEMO_AUTH !== 'off' });
const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`api listening on :${port} (storage=${store.kind}, llm=${llm.id}, sink=${sink.kind}, now=${service.now()})`);
});
