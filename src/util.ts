const BASE_URI = 'fly://erc1155';

export function packTokenUri(namespace: string, name: string, client_id: string) {
  const uri = new URL(BASE_URI);
  uri.pathname = `/${namespace}/${name}/${client_id}`;
  return uri.href;
}

export function unpackTokenUri(uri: string) {
  const parts = new URL(uri).pathname.split('/');
  return {
    namespace: parts[1],
    name: parts[2],
    client_id: parts[3],
  };
}

export function isFungible(pool_id: string) {
  return pool_id[0] === 'F';
}

export function packTokenId(pool_id: string, token_id = '0') {
  return (
    (BigInt(isFungible(pool_id) ? 0 : 1) << BigInt(255)) |
    (BigInt(pool_id.substr(1)) << BigInt(128)) |
    BigInt(token_id)
  ).toString();
}

export function unpackTokenId(id: string) {
  const val = BigInt(id);
  const isFungible = val >> BigInt(255) === BigInt(0);
  return {
    is_fungible: isFungible,
    pool_id: (isFungible ? 'F' : 'N') + (BigInt.asUintN(255, val) >> BigInt(128)),
    token_id: BigInt.asUintN(128, val).toString(),
  };
}
