# GG Bot su Fly.io: Node LTS su Debian (glibc), necessaria per better-sqlite3
# e @napi-rs/canvas.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    npm_config_update_notifier=false

WORKDIR /app

# Le dipendenze si installano prima del codice: questo strato resta in cache
# finché non cambiano package.json / package-lock.json.
COPY package.json package-lock.json ./

# Gli strumenti servono solo se better-sqlite3 non trova un prebuild; vengono
# rimossi subito dopo l'installazione.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && npm ci --omit=dev --no-audit --no-fund \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# auth/, data/ e libri/ vivono sul volume Fly montato in /data.
RUN ln -s /data/auth auth \
    && ln -s /data/data data \
    && ln -s /data/libri libri \
    && chmod +x docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
