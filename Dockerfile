# build stage
FROM node:20-alpine as build

WORKDIR /openchat-preview

COPY package*.json .

RUN npm install

COPY . . 

EXPOSE 5070

CMD ["node", "--max-old-space-size=4096", "server.js"]