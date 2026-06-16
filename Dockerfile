FROM public.ecr.aws/docker/library/node:24-bookworm

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server/index.js"]
