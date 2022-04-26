FROM node:16-alpine3.15 AS solidity-builder
RUN apk add python3 alpine-sdk
WORKDIR /root
ADD solidity/package*.json ./
RUN npm install
RUN npm config set user 0
ADD solidity/ ./
RUN npx truffle compile

FROM node:16-alpine3.15 as builder
WORKDIR /root
ADD package*.json ./
RUN npm install
ADD . .
RUN npm run build

FROM node:16-alpine3.15 
RUN apk add curl
WORKDIR /root
ADD package*.json ./
RUN npm install --production
COPY --from=solidity-builder /root/build/contracts contracts
COPY --from=builder /root/dist dist
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
