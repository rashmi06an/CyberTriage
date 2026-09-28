import net from 'node:net';

const port = 5173;

function verifyHost(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ port, host }, () => server.close(resolve));
  });
}

try {
  await verifyHost('127.0.0.1');
} catch (error) {
  const detail = error.code === 'EADDRINUSE' ? 'is already in use' : `cannot be used (${error.message})`;
  console.error(`Port ${port} ${detail}. Stop the existing Vite or Electron development process, then try again.`);
  process.exitCode = 1;
}
