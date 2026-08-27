import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHttpServer, defaultPort } from '../src/http/server.js';
import type { HttpServerHandle } from '../src/http/server.js';

async function startOnEphemeralPort(): Promise<{ handle: HttpServerHandle; port: number; base: string }> {
  const handle = await startHttpServer({ port: 0, host: '127.0.0.1' });
  const { port } = handle.server.address() as { port: number };
  return { handle, port, base: `http://127.0.0.1:${port}` };
}

describe('HTTP health server', () => {
  it('GET /health returns 200 with {"status":"ok"}', async () => {
    const { handle, base } = await startOnEphemeralPort();
    try {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: 'ok' });
    } finally {
      await handle.close();
    }
  });

  it('GET /health/ (trailing slash) also returns 200', async () => {
    const { handle, base } = await startOnEphemeralPort();
    try {
      const res = await fetch(`${base}/health/`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: 'ok' });
    } finally {
      await handle.close();
    }
  });

  it('unknown route returns 404', async () => {
    const { handle, base } = await startOnEphemeralPort();
    try {
      const res = await fetch(`${base}/nope`);
      assert.equal(res.status, 404);
    } finally {
      await handle.close();
    }
  });

  it('non-GET method on /health is rejected', async () => {
    const { handle, base } = await startOnEphemeralPort();
    try {
      const res = await fetch(`${base}/health`, { method: 'POST' });
      assert.equal(res.status, 404);
    } finally {
      await handle.close();
    }
  });
});

describe('defaultPort', () => {
  const original = process.env.PORT;

  after(() => {
    restorePort();
  });

  function restorePort(): void {
    if (original === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = original;
    }
  }

  it('defaults to 3000 when PORT is unset', () => {
    delete process.env.PORT;
    assert.equal(defaultPort(), 3000);
  });

  it('falls back to 3000 for a non-positive or non-numeric PORT', () => {
    process.env.PORT = '0';
    assert.equal(defaultPort(), 3000);
    process.env.PORT = 'abc';
    assert.equal(defaultPort(), 3000);
  });

  it('parses a valid PORT', () => {
    process.env.PORT = '8080';
    assert.equal(defaultPort(), 8080);
  });
});
