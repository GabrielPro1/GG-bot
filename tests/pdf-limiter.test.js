import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Semaphore, KeyedLocker } from '../lib/pdf/limiter.js';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Semaphore limits concurrent executions', async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let maxActive = 0;
    let completed = 0;
    const tasks = Array.from({ length: 6 }, async () => {
        await semaphore.run(async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await sleep(10);
            active -= 1;
        });
        completed += 1;
    });
    await Promise.all(tasks);
    assert.equal(completed, 6);
    assert.equal(maxActive, 2);
});

test('Semaphore never releases below zero', async () => {
    const semaphore = new Semaphore(1);
    await semaphore.run(async () => sleep(5));
    await semaphore.acquire();
    assert.equal(semaphore.active, 1);
    semaphore.release();
    assert.equal(semaphore.active, 0);
});

test('KeyedLocker serializes same-key tasks in order', async () => {
    const locker = new KeyedLocker();
    const order = [];
    const push = async (label, delayMs) => {
        return locker.run('key', async () => {
            order.push(`${label}:start`);
            await sleep(delayMs);
            order.push(`${label}:end`);
        });
    };
    await Promise.all([push('a', 30), push('b', 5), push('c', 1)]);
    assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
});

test('KeyedLocker allows different keys to overlap', async () => {
    const locker = new KeyedLocker();
    let active = 0;
    let maxActive = 0;
    const run = (key) => locker.run(key, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(20);
        active -= 1;
    });
    await Promise.all([run('a'), run('b'), run('c')]);
    assert.equal(maxActive, 3);
});

test('KeyedLocker forgets the key after completion', async () => {
    const locker = new KeyedLocker();
    await locker.run('k', async () => sleep(5));
    await locker.run('k', async () => sleep(5));
    assert.equal(locker.tails.size, 0);
});