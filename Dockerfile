FROM node:20-alpine3.17 as solidity-build
RUN apk add python3 alpine-sdk
USER node
WORKDIR /home/node
ADD --chown=node:node ./samples/solidity/package*.json ./
RUN npm install
ADD --chown=node:node ./samples/solidity .
RUN npx hardhat compile

FROM node:20-alpine3.17 as build
WORKDIR /root
ADD package*.json ./
RUN npm install
ADD . .
RUN npm run build

FROM node:20-alpine3.17 
RUN apk add curl
# We also need to keep copying it to the old location to maintain compatibility with the FireFly CLI
COPY --from=solidity-build --chown=1001:0 /home/node/artifacts/contracts/ERC1155MixedFungible.sol/ERC1155MixedFungible.json /root/contracts/
WORKDIR /app
ADD package*.json ./
RUN npm install --production
COPY --from=solidity-build /home/node/contracts contracts/source
COPY --from=solidity-build /home/node/artifacts/contracts/ERC1155MixedFungible.sol contracts
COPY --from=build /root/dist dist
COPY --from=build /root/.env /app/.env
RUN chgrp -R 0 /app/ \
    && chmod -R g+rwX /app/
USER 1001
EXPOSE 3000
CMD ["node", "dist/src/main"]
