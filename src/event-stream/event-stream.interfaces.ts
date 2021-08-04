export interface EventStream {
  id: string;
  name: string;
}

export interface EventStreamSubscription {
  id: string;
  name: string;
  stream: string;
}

export interface Event {
  signature: string;
  address: string;
  blockNumber: number;
  transactionHash: string;
  data: any;
}

export interface EventStreamReply {
  headers: {
    type: string;
    requestId: string;
  };
  transactionHash: string;
  errorMessage?: string;
}
