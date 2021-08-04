import { HttpService, Injectable, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import {
  Event,
  EventStream,
  EventStreamReply,
  EventStreamSubscription,
} from './event-stream.interfaces';

@Injectable()
export class EventStreamService {
  private readonly logger = new Logger(EventStreamService.name);

  private ws: WebSocket;
  private pingTimeout: NodeJS.Timeout;
  private disconnectDetected = false;

  constructor(private http: HttpService) {}

  async init(baseUrl: string, instanceUrl: string, topic: string, subscriptions: string[]) {
    const stream = await this.ensureEventStream(baseUrl, topic);
    await this.ensureSubscriptions(baseUrl, instanceUrl, stream.id, subscriptions);
    const wsUrl = baseUrl.replace('http', 'ws') + '/ws';
    this.initWebsocket(wsUrl, topic);
  }

  async ensureEventStream(baseUrl: string, topic: string): Promise<EventStream> {
    const streamDetails = {
      name: topic,
      errorHandling: 'block',
      batchSize: 50,
      batchTimeoutMS: 500,
      type: 'websocket',
      websocket: { topic },
      blockedReryDelaySec: 30, // intentional due to spelling error in ethconnect
    };

    const { data: existingStreams } = await this.http
      .get<EventStream[]>(`${baseUrl}/eventstreams`)
      .toPromise();
    const stream = existingStreams.find(s => s.name === streamDetails.name);
    if (stream) {
      const { data: patchedStream } = await this.http
        .patch<EventStream>(`${baseUrl}/eventstreams/${stream.id}`, streamDetails)
        .toPromise();
      return patchedStream;
    }
    const { data: newStream } = await this.http
      .post<EventStream>(`${baseUrl}/eventstreams`, streamDetails)
      .toPromise();
    return newStream;
  }

  private async createSubscription(
    instanceUrl: string,
    event: string,
    streamId: string,
  ): Promise<EventStreamSubscription> {
    const response = await this.http
      .post<EventStreamSubscription>(`${instanceUrl}/${event}`, {
        name: event,
        description: event,
        stream: streamId,
        fromBlock: '0', // subscribe from the start of the chain
      })
      .toPromise();
    this.logger.log(`Created subscription ${event}: ${response.data.id}`);
    return response.data;
  }

  async ensureSubscriptions(
    baseUrl: string,
    instanceUrl: string,
    streamId: string,
    subscriptions: string[],
  ) {
    const { data: existing } = await this.http
      .get<EventStreamSubscription[]>(`${baseUrl}/subscriptions`)
      .toPromise();
    for (const eventName of subscriptions) {
      const sub = existing.find(s => s.name === eventName && s.stream === streamId);
      if (!sub) {
        const newSub = await this.createSubscription(instanceUrl, eventName, streamId);
        this.logger.log(`Subscription for ${eventName}: ${newSub.id}`);
      } else {
        this.logger.log(`Subscription for ${eventName}: ${sub.id}`);
      }
    }
  }

  initWebsocket(wsUrl: string, topic: string) {
    this.ws = new WebSocket(wsUrl);
    this.ws
      .on('open', () => {
        if (this.disconnectDetected) {
          this.disconnectDetected = false;
          this.logger.log('Event stream websocket restored');
        } else {
          this.logger.log('Event stream websocket connected');
        }
        this.produce({ type: 'listen', topic });
        this.produce({ type: 'listenreplies' });
        this.ping();
      })
      .on('close', () => {
        this.disconnectDetected = true;
        this.logger.error(
          `Event stream websocket disconnected, attempting to reconnect in 5 second(s)`,
        );
        setTimeout(() => this.initWebsocket(wsUrl, topic), 5 * 1000);
      })
      .on('message', (message: string) => {
        this.handleMessage(JSON.parse(message));
        this.produce({ type: 'ack', topic });
      })
      .on('pong', () => {
        this.ping();
      })
      .on('error', err => {
        this.logger.error(`Event stream websocket error. ${err}`);
      });
  }

  private ping() {
    this.ws.ping();
    clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => {
      this.logger.error('Event stream ping timeout');
      this.ws.terminate();
    }, 60 * 1000);
  }

  private produce(message: any) {
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(message: EventStreamReply | Event[]) {
    if (Array.isArray(message)) {
      for (const event of message) {
        this.logger.log(`Ethconnect '${event.signature}' message: ${JSON.stringify(event.data)}`);
      }
    } else {
      const replyType = message.headers.type;
      const errorMessage = message.errorMessage ?? '';
      this.logger.log(
        `Ethconnect '${replyType}' reply request=${message.headers.requestId} tx=${message.transactionHash} ${errorMessage}`,
      );
    }
  }
}
