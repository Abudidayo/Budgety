import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const distDirectory = fileURLToPath(new URL('./dist/', import.meta.url));
const indexFile = resolve(distDirectory, 'index.html');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendFile(response, file) {
  response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
  createReadStream(file)
    .on('error', () => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Internal Server Error');
    })
    .pipe(response);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requestedFile = resolve(distDirectory, `.${pathname}`);
    const isInsideDist = requestedFile.startsWith(distDirectory);
    const requestedStat = isInsideDist ? await stat(requestedFile).catch(() => null) : null;
    const file = requestedStat?.isFile() ? requestedFile : indexFile;

    if (request.method === 'HEAD') {
      response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
      response.end();
      return;
    }

    sendFile(response, file);
  } catch {
    response.writeHead(400);
    response.end('Bad Request');
  }
});

server.listen(port, host, () => {
  console.log(`Budgety listening on http://${host}:${port}`);
});
