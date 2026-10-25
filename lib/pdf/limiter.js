export class Semaphore {
    constructor(max) {
        this.max = Math.max(1, Number(max) || 1);
        this.active = 0;
        this.queue = [];
    }

    acquire() {
        if (this.active < this.max) {
            this.active += 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.queue.push(resolve);
        });
    }

    release() {
        const next = this.queue.shift();
        if (next) {
            next();
        }
        else {
            this.active -= 1;
        }
    }

    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        }
        finally {
            this.release();
        }
    }
}

/**
 * Coda FIFO indicizzata per una chiave arbitraria: un secondo run(key) parte solo
 * quando il primo è terminato. Usata per serializzare il lavoro sullo stesso documento.
 */
export class KeyedLocker {
    tails = new Map();

    run(key, fn) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const current = previous.then(() => fn(), () => fn());
        const tail = current.catch(() => undefined);
        this.tails.set(key, tail);
        // La pulizia è concatenata su `current` (non su `tail`) così da eseguirsi nello
        // stesso batch di microtask del settlement: un chiamante che fa await di run()
        // non osserva mai una voce obsoleta. Entrambi gli handler tengono la promise
        // restituita al sicuro da rejection non gestite.
        const cleanup = () => {
            if (this.tails.get(key) === tail) {
                this.tails.delete(key);
            }
        };
        current.then(cleanup, cleanup);
        return current;
    }
}