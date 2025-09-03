FROM node:24-alpine
RUN mkdir -p /opt/app

WORKDIR /opt/app

COPY package.json .
COPY package-lock.json .
COPY tsconfig.json .
COPY src/ ./src/
COPY public/ ./public/

RUN npm i
RUN npm run build

EXPOSE 8080

CMD [ "node", "dist/index.js" ]
