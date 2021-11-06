// Copyright © 2021 Kaleido, Inc.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import * as WebSocket from 'ws';
import {
  Event,
  EventStream,
  EventStreamReply,
  EventStreamSubscription,
} from './event-stream.interfaces';

const RECONNECT_TIME = 5000;
const PING_INTERVAL = 10000;
const PING_TIMEOUT = 60000;

export class EventStreamSocket {
  private readonly logger = new Logger(EventStreamSocket.name);

  private ws: WebSocket;
  private pingTimeout: NodeJS.Timeout;
  private disconnectDetected = false;
  private closeRequested = false;

  constructor(
    private url: string,
    private topic: string,
    private handleEvents: (events: Event[]) => void,
    private handleReceipt: (receipt: EventStreamReply) => void,
  ) {
    this.init();
  }

  private init() {
    this.disconnectDetected = false;
    this.closeRequested = false;

    this.ws = new WebSocket(this.url);
    this.ws
      .on('open', () => {
        if (this.disconnectDetected) {
          this.disconnectDetected = false;
          this.logger.log('Event stream websocket restored');
        } else {
          this.logger.log('Event stream websocket connected');
        }
        this.produce({ type: 'listen', topic: this.topic });
        this.produce({ type: 'listenreplies' });
        this.ping();
      })
      .on('close', () => {
        if (this.closeRequested) {
          this.logger.log('Event stream websocket closed');
        } else {
          this.disconnectDetected = true;
          this.logger.error(
            `Event stream websocket disconnected, attempting to reconnect in ${RECONNECT_TIME}ms`,
          );
          setTimeout(() => this.init(), RECONNECT_TIME);
        }
      })
      .on('message', (message: string) => {
        this.handleMessage(JSON.parse(message));
      })
      .on('pong', () => {
        clearTimeout(this.pingTimeout);
        setTimeout(() => this.ping(), PING_INTERVAL);
      })
      .on('error', err => {
        this.logger.error(`Event stream websocket error: ${err}`);
      });
  }

  private ping() {
    if (this.ws !== undefined && this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
      this.pingTimeout = setTimeout(() => {
        this.logger.error('Event stream ping timeout');
        this.ws.terminate();
      }, PING_TIMEOUT);
    }
  }

  private produce(message: any) {
    this.ws.send(JSON.stringify(message));
  }

  ack() {
    this.produce({ type: 'ack', topic: this.topic });
  }

  close() {
    this.closeRequested = true;
    this.ws.terminate();
  }

  private handleMessage(message: EventStreamReply | Event[]) {
    if (Array.isArray(message)) {
      for (const event of message) {
        this.logger.log(`Ethconnect '${event.signature}' message: ${JSON.stringify(event.data)}`);
      }
      this.handleEvents(message);
    } else {
      const replyType = message.headers.type;
      const errorMessage = message.errorMessage ?? '';
      this.logger.log(
        `Ethconnect '${replyType}' reply request=${message.headers.requestId} tx=${message.transactionHash} ${errorMessage}`,
      );
      this.handleReceipt(message);
    }
  }
}

@Injectable()
export class EventStreamService {
  private readonly logger = new Logger(EventStreamService.name);

  private baseUrl: string;

  constructor(private http: HttpService) {}

  configure(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getEventStreams(): Promise<EventStream[]> {
    const response = await lastValueFrom(
      this.http.get<EventStream[]>(`${this.baseUrl}/eventstreams`),
    );
    return response.data;
  }

  async ensureEventStream(topic: string): Promise<EventStream> {
    const streamDetails = {
      name: topic,
      errorHandling: 'block',
      batchSize: 50,
      batchTimeoutMS: 500,
      type: 'websocket',
      websocket: { topic },
      blockedReryDelaySec: 30, // intentional due to spelling error in ethconnect
      inputs: true,
    };

    const existingStreams = await this.getEventStreams();
    const stream = existingStreams.find(s => s.name === streamDetails.name);
    if (stream) {
      const patchedStreamRes = await lastValueFrom(
        this.http.patch<EventStream>(`${this.baseUrl}/eventstreams/${stream.id}`, streamDetails),
      );
      this.logger.log(`Event stream for ${topic}: ${stream.id}`);
      return patchedStreamRes.data;
    }
    const newStreamRes = await lastValueFrom(
      this.http.post<EventStream>(`${this.baseUrl}/eventstreams`, streamDetails),
    );
    this.logger.log(`Event stream for ${topic}: ${newStreamRes.data.id}`);
    return newStreamRes.data;
  }

  async getSubscriptions(): Promise<EventStreamSubscription[]> {
    const response = await lastValueFrom(
      this.http.get<EventStreamSubscription[]>(`${this.baseUrl}/subscriptions`),
    );
    return response.data;
  }

  private async createSubscription(
    instancePath: string,
    event: string,
    streamId: string,
    fromBlock = '0', // subscribe from the start of the chain by default
  ): Promise<EventStreamSubscription> {
    const response = await lastValueFrom(
      this.http.post<EventStreamSubscription>(`${this.baseUrl}/${instancePath}/${event}`, {
        name: event,
        description: event,
        stream: streamId,
        fromBlock,
      }),
    );
    this.logger.log(`Created subscription ${event}: ${response.data.id}`);
    return response.data;
  }

  async ensureSubscriptions(
    instancePath: string,
    streamId: string,
    subscriptions: string[],
  ): Promise<EventStreamSubscription[]> {
    const existingSubscriptions = await this.getSubscriptions();
    const results: EventStreamSubscription[] = [];
    for (const eventName of subscriptions) {
      const sub = existingSubscriptions.find(s => s.name === eventName && s.stream === streamId);
      if (sub) {
        this.logger.log(`Subscription for ${eventName}: ${sub.id}`);
        results.push(sub);
      } else {
        const newSub = await this.createSubscription(instancePath, eventName, streamId);
        this.logger.log(`Subscription for ${eventName}: ${newSub.id}`);
        results.push(newSub);
      }
    }
    return results;
  }

  connect(
    url: string,
    topic: string,
    handleEvents: (events: Event[]) => void,
    handleReceipt: (receipt: EventStreamReply) => void,
  ) {
    return new EventStreamSocket(url, topic, handleEvents, handleReceipt);
  }
}
