import { ApiProperty } from "@nestjs/swagger";

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

export class EventStreamReplyHeaders {
  @ApiProperty()
  type: string;

  @ApiProperty()
  requestId: string;
}

export class EventStreamReply {
  @ApiProperty()
  headers: EventStreamReplyHeaders;

  @ApiProperty()
  transactionHash: string;

  @ApiProperty()
  errorMessage?: string;
}
