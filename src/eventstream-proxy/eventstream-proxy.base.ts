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
import { MessageBody, SubscribeMessage } from '@nestjs/websockets';
import { v4 as uuidv4 } from 'uuid';
import { Event } from '../event-stream/event-stream.interfaces';
import { EventStreamService, EventStreamSocket } from '../event-stream/event-stream.service';
import {
  WebSocketEventsBase,
  WebSocketEx,
  WebSocketMessage,
} from '../websocket-events/websocket-events.base';
import {
  EventListener,
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
  socket?: EventStreamSocket;
  url?: string;
  topic?: string;

  private listeners: EventListener[] = [];
  private awaitingAck: WebSocketMessageWithId[] = [];
  private currentClient: WebSocketEx | undefined;

  constructor(
    protected readonly logger: Logger,
    protected eventstream: EventStreamService,
    requireAuth = false,
  ) {
    super(logger, requireAuth);
  }

  configure(url?: string, topic?: string) {
    this.url = url;
    this.topic = topic;
  }

  handleConnection(client: WebSocketEx) {
    super.handleConnection(client);
    if (this.server.clients.size === 1 && this.url !== undefined && this.topic !== undefined) {
      this.logger.log(`Initializing event stream proxy`);
      this.currentClient = client;
      this.socket = this.eventstream.subscribe(
        this.url,
        this.topic,
        events => {
          // This handler and all methods it calls must be synchronous in order to preserve ordering!
          for (const event of events) {
            this.logger.log(`Proxying event: ${JSON.stringify(event)}`);
            let newEvent: WebSocketMessage | undefined;
            try {
              newEvent = this.transformEvent(event);
            } catch (err) {
              this.logger.error(`Error processing event: ${err}`);
              continue;
            }
            if (newEvent !== undefined) {
              const message: WebSocketMessageWithId = { ...newEvent, id: uuidv4() };
              this.awaitingAck.push(message);
              this.currentClient?.send(JSON.stringify(message));
            }
          }
          this.checkBatchComplete();
        },
        receipt => {
          this.broadcast('receipt', <ReceiptEvent>{
            id: receipt.headers.requestId,
            success: receipt.headers.type === 'TransactionSuccess',
            message: receipt.errorMessage,
          });
        },
      );
    }
  }

  handleDisconnect(client: WebSocketEx) {
    super.handleDisconnect(client);
    if (this.server.clients.size === 0) {
      this.socket?.close();
      this.socket = undefined;
      this.currentClient = undefined;
    } else if (client.id === this.currentClient?.id) {
      // Pick a new client and retransmit any unacknowledged messages
      this.currentClient = this.server.clients[0];
      for (const message of this.awaitingAck) {
        this.currentClient?.send(message);
      }
    }
  }

  addListener(listener: EventListener) {
    this.listeners.push(listener);
  }

  private transformEvent(event: Event) {
    for (const listener of this.listeners) {
      const newEvent = listener.transformEvent(event);
      if (newEvent !== undefined) {
        return newEvent;
      }
    }
    return undefined;
  }

  private checkBatchComplete() {
    if (this.awaitingAck.length === 0) {
      this.logger.log('Sending ack for batch');
      this.socket?.ack();
    }
  }

  @SubscribeMessage('ack')
  handleAck(@MessageBody() data: string) {
    let id: string;
    try {
      id = JSON.parse(data).id;
    } catch (err) {
      this.logger.error('Received malformed ack');
      return;
    }

    this.logger.log(`Received ack ${id}`);
    this.awaitingAck = this.awaitingAck.filter(msg => msg.id !== id);
    this.checkBatchComplete();
  }
}
