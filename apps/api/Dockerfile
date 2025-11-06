FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci -w apps/api
COPY apps/api apps/api
RUN npm run build -w apps/api
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv /app/.python && /app/.python/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/app/.python/bin:$PATH"
FROM runtime AS worker
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api apps/api
COPY scraper.py remote_login.py ./
CMD ["node", "apps/api/dist/worker.js"]
FROM runtime AS api
RUN python3 -m playwright install --with-deps --only-shell chromium
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api apps/api
COPY scraper.py remote_login.py ./
CMD ["node", "apps/api/dist/main.js"]
