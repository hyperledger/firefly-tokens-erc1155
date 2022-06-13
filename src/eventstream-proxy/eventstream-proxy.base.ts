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

import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage } from '@nestjs/websockets';
import { v4 as uuidv4 } from 'uuid';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService, EventStreamSocket } from '../event-stream/event-stream.service';
import {
  WebSocketEventsBase,
  WebSocketEx,
  WebSocketMessage,
} from '../websocket-events/websocket-events.base';
import {
  AckMessageData,
  EventListener,
  ProxyWebSocket,
  ReceiptEvent,
  WebSocketMessageWithId,
} from './eventstream-proxy.interfaces';

/**
 * Base class for a websocket gateway that listens for and proxies event stream messages.
 *
 * To create the actual gateway, subclass and decorate your child, e.g.:
 * @WebSocketGateway({ path: '/api/stream' })
 */
export abstract class EventStreamProxyBase extends WebSocketEventsBase {
  url: string;

  private listeners: EventListener[] = [];
  private clients = new Map<string, EventStreamProxyInstance>();
  private subscriptionNames = new Map<string, string>();
  private receiptSocket?: EventStreamSocket;

  constructor(
    protected readonly logger: Logger,
    protected eventstream: EventStreamService,
    requireAuth = false,
  ) {
    super(logger, requireAuth);
  }

  configure(url: string) {
    this.url = url;
  }

  init() {
    if (this.receiptSocket === undefined) {
      this.receiptSocket = this.eventstream.listenReceipts(this.url, receipt => {
        this.broadcast('receipt', <ReceiptEvent>{
          id: receipt.headers.requestId,
          success: receipt.headers.type === 'TransactionSuccess',
          message: receipt.errorMessage,
        });
      });
    }
  }

  private extractSearchParams(path?: string) {
    const question = path?.indexOf('?');
    return path !== undefined && question !== undefined && question >= 0
      ? new URLSearchParams(path.substring(question + 1))
      : undefined;
  }

  getTopic(_params: URLSearchParams | undefined): string | undefined {
    // override in child classes
    return undefined;
  }

  handleConnection(client: ProxyWebSocket) {
    super.handleConnection(client);

    const params = this.extractSearchParams(client.request?.url);
    const topic = this.getTopic(params);
    if (topic === undefined) {
      this.logger.log(`WebSocket ${client.id}: no topic provided`);
      client.close(1008, 'No topic provided');
      return;
    }
    client.topic = topic;

    let instance = this.clients.get(topic);
    if (instance === undefined) {
      this.logger.log('Initializing event stream proxy');
      instance = new EventStreamProxyInstance(
        this.logger,
        this.eventstream,
        this.url,
        topic,
        events => this.processEvents(events),
      );
      this.clients.set(topic, instance);
    }
    instance.addClient(client);
  }

  handleDisconnect(client: ProxyWebSocket) {
    super.handleDisconnect(client);

    if (client.topic !== undefined) {
      const instance = this.clients.get(client.topic);
      if (instance !== undefined) {
        if (instance.removeClient(client) === 0) {
          this.clients.delete(client.topic);
        }
      }
    }
  }

  addListener(listener: EventListener) {
    this.listeners.push(listener);
  }

  private async processEvents(events: Event[]): Promise<WebSocketMessage[]> {
    const messages: WebSocketMessage[] = [];
    for (const event of events) {
      this.logger.log(`Proxying event: ${JSON.stringify(event)}`);
      const subName = await this.getSubscriptionName(event.subId);
      if (subName === undefined) {
        this.logger.error(`Unknown subscription ID: ${event.subId}`);
        return [];
      }

      for (const listener of this.listeners) {
        try {
          await listener.onEvent(subName, event, (msg: WebSocketMessage | undefined) => {
            if (msg !== undefined) {
              messages.push(msg);
            }
          });
        } catch (err) {
          this.logger.error(`Error processing event: ${err}`);
        }
      }
    }
    return messages;
  }

  private async getSubscriptionName(subId: string) {
    const subName = this.subscriptionNames.get(subId);
    if (subName !== undefined) {
      return subName;
    }

    try {
      const sub = await this.eventstream.getSubscription(subId);
      if (sub !== undefined) {
        this.subscriptionNames.set(subId, sub.name);
        return sub.name;
      }
    } catch (err) {
      this.logger.error(`Error looking up subscription: ${err}`);
    }
    return undefined;
  }

  @SubscribeMessage('ack')
  handleAck(@MessageBody() data: AckMessageData, @ConnectedSocket() client: ProxyWebSocket) {
    if (data.id === undefined) {
      this.logger.error('Received malformed ack');
      return;
    }
    if (client.topic === undefined) {
      this.logger.error('Received ack from unknown client');
      return;
    }

    this.logger.log(`Received ack ${data.id}`);
    const instance = this.clients.get(client.topic);
    if (instance !== undefined) {
      instance.handleAck(data);
    }
  }
}

class EventStreamProxyInstance {
  private clients: WebSocketEx[] = [];
  private awaitingAck: WebSocketMessageWithId[] = [];
  private queue = Promise.resolve();
  private socket?: EventStreamSocket;

  constructor(
    protected readonly logger: Logger,
    private eventstream: EventStreamService,
    private url: string,
    private topic: string,
    private transformEvents: (events: Event[]) => Promise<WebSocketMessage[]>,
  ) {
    this.startListening();
  }

  private queueTask(task: () => void) {
    this.queue = this.queue.finally(task);
  }

  addClient(client: WebSocketEx): number {
    this.clients.push(client);
    if (this.clients.length === 1) {
      this.startListening();
    }
    return this.clients.length;
  }

  removeClient(client: WebSocketEx): number {
    const resend = this.clients.length >= 2 && client.id === this.clients[0].id;
    this.clients = this.clients.filter(c => c.id !== client.id);
    if (this.clients.length === 0) {
      this.stopListening();
    } else if (resend) {
      for (const message of this.awaitingAck) {
        this.send(message);
      }
    }
    return this.clients.length;
  }

  private startListening() {
    this.socket = this.eventstream.listenTopic(this.url, this.topic, events => {
      this.queueTask(() => this.processEvents(events));
    });
  }

  stopListening() {
    this.socket?.close();
    this.socket = undefined;
  }

  private async processEvents(events: Event[]) {
    const messages = await this.transformEvents(events);
    const message: WebSocketMessageWithId = {
      id: uuidv4(),
      event: 'batch',
      data: messages,
    };
    this.awaitingAck.push(message);
    this.send(message);
  }

  private send(message: WebSocketMessageWithId) {
    this.clients[0].send(JSON.stringify(message));
  }

  handleAck(ack: AckMessageData) {
    if (
      this.socket !== undefined &&
      this.awaitingAck.find(msg => msg.id === ack.id) !== undefined
    ) {
      this.logger.log('Sending ack');
      this.socket.ack();
      this.awaitingAck = this.awaitingAck.filter(msg => msg.id !== ack.id);
    }
  }
}
