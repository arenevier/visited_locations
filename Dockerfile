FROM node:20-alpine
WORKDIR /usr/src/app
ENV INSIDE_DOCKER true
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
CMD yarn main-prod
