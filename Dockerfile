FROM public.ecr.aws/docker/library/node:24-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts/etf-backfill-all.mjs ./scripts/etf-backfill-all.mjs
COPY ETF按行业板块分类.csv ./
COPY ETF按行业板块分类.md ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server/index.js"]
