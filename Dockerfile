FROM node:16-alpine3.15 as solidity-builder
RUN apk add python3 alpine-sdk
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

FROM alpine:3.19 AS SBOM
WORKDIR /
ADD . /SBOM
RUN apk add --no-cache curl 
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.48.3
RUN trivy fs --format spdx-json --output /sbom.spdx.json /SBOM
RUN trivy sbom /sbom.spdx.json --severity UNKNOWN,HIGH,CRITICAL --exit-code 1

FROM node:16-alpine3.15 
RUN apk add curl
WORKDIR /app
ADD package*.json ./
RUN npm install --production
COPY --from=solidity-builder /home/node/contracts contracts/source
COPY --from=solidity-builder /home/node/artifacts/contracts/ERC1155MixedFungible.sol contracts
COPY --from=builder /root/dist dist
COPY --from=builder /root/.env /app/.env
RUN chgrp -R 0 /app/ \
    && chmod -R g+rwX /app/
COPY --from=SBOM /sbom.spdx.json /sbom.spdx.json
USER 1001
EXPOSE 3000
CMD ["node", "dist/src/main"]
