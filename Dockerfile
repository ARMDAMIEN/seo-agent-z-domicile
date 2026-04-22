FROM node:22-alpine

RUN apk add --no-cache bash git \
 && adduser -D -s /bin/bash agent

WORKDIR /app

RUN npm install -g tsx

COPY --chown=agent:agent package*.json tsconfig.json ./
RUN npm ci --omit=dev && chown -R agent:agent /app

COPY --chown=agent:agent src ./src
COPY --chown=agent:agent context ./context

# Claude Code refuses --dangerously-skip-permissions as root, so run as non-root.
# /app/data is the Fly volume mount point — must be writable by `agent`.
RUN mkdir -p /app/data && chown agent:agent /app/data
USER agent

CMD ["tsx", "src/index.ts"]
