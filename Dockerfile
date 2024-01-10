FROM node:16-alpine3.15 as solidity-builder
RUN apk add python3=3.9.18-r0 alpine-sdk=1.0-r1
USER node
WORKDIR /home/node
ADD --chown=node:node ./samples/solidity/package*.json ./
RUN npm install
ADD --chown=node:node ./samples/solidity .
RUN npx hardhat compile

FROM node:16-alpine3.15 as builder
WORKDIR /root
ADD package*.json ./
RUN npm install
ADD . .
RUN npm run build

FROM node:16-alpine3.15 
RUN apk add curl=8.5.0-r0
WORKDIR /app
ADD package*.json ./
RUN npm install --production
COPY --from=solidity-builder /home/node/contracts contracts/source
COPY --from=solidity-builder /home/node/artifacts/contracts/ERC1155MixedFungible.sol contracts
COPY --from=builder /root/dist dist
COPY --from=builder /root/.env /app/.env
RUN chgrp -R 0 /app/ \
    && chmod -R g+rwX /app/
USER 1001
EXPOSE 3000
CMD ["node", "dist/src/main"]
