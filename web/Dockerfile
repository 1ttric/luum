FROM node:lts-alpine3.14 AS build
WORKDIR /app/src
COPY . .

RUN yarn install && \
    yarn build --verbose

FROM nginx:1.16.1-alpine
COPY --from=build /app/src/build /usr/share/nginx/html
COPY deploy/default.conf /etc/nginx/conf.d/default.conf

RUN adduser -D app
USER app
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
