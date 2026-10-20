import { createApp } from './app.js';
const runtime = createApp();
const { config } = runtime.context;
const server = runtime.app.listen(config.port, config.host, () => {
  console.log(`ImageAPI is running at ${config.publicOrigin}`);
  console.log(`Node.js ${process.versions.node} · ${config.host}:${config.port}`);
});
server.requestTimeout = 210_000;
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE')
    console.error(
      `Port ${config.port} is in use. Choose another PORT and update IMAGEAPI_PUBLIC_ORIGIN.`,
    );
  else console.error(`Server could not start (${error.code || 'unknown error'}).`);
  await runtime.close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Finishing active requests before shutdown…');
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 190_000).unref();
  server.close(async () => {
    clearTimeout(deadline);
    await runtime.close();
  });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
