FROM node:20

RUN apt-get update && apt-get install -y rsync git && rm -rf /var/lib/apt/lists/*

RUN npm i --location=global pnpm@9

COPY ./entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
