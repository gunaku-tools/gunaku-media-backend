FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-pip \
       ffmpeg \
       ca-certificates \
       curl \
    && curl -fsSL https://deno.land/install.sh | sh \
    && mv /root/.deno/bin/deno /usr/local/bin/deno \
    && pip3 install --no-cache-dir --break-system-packages -U "yt-dlp[default]" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node","server.js"]
