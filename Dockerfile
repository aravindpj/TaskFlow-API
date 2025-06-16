FROM oven/bun:latest AS base
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
EXPOSE 3000

#this will cache the and speed up future build
FROM base AS install

# Caches dev deps
RUN mkdir -p /tmp/dev
COPY package.json bun.lock /tmp/dev/
RUN cd /tmp/dev && bun install --frozen-lockfile

# Caches prod deps
RUN mkdir -p /tmp/prd
COPY package.json bun.lock /tmp/prd/
RUN cd /tmp/prd && bun install --frozen-lockfile --production

FROM base AS development

#Take the node_modules folder from the install stage and place it at /usr/src/app/node_modules
COPY --from=install /tmp/dev/node_modules node_modules
COPY . .
ENV NODE_ENV=development
CMD [ "bun" , "run" , "start:dev"]

FROM base AS production

COPY --from=install /tmp/prd/node_modules node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build
CMD [ "bun" , "dist/main"]











