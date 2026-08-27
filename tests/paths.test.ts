import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { resolveAuthRoot, projectAuthFolder } from '../src/config/paths.js';

const ENV_KEY = 'WHATSAPP_AUTH_ROOT';

describe('resolveAuthRoot', () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('defaults to the project ./auth folder when the env var is unset', () => {
    delete process.env[ENV_KEY];
    assert.equal(resolveAuthRoot(), projectAuthFolder());
    assert.ok(resolveAuthRoot().endsWith('auth'));
  });

  it('uses WHATSAPP_AUTH_ROOT when set', () => {
    process.env[ENV_KEY] = '/var/data/auth';
    assert.equal(resolveAuthRoot(), resolve('/var/data/auth'));
  });

  it('treats a blank WHATSAPP_AUTH_ROOT as unset', () => {
    process.env[ENV_KEY] = '   ';
    assert.equal(resolveAuthRoot(), projectAuthFolder());
  });
});
