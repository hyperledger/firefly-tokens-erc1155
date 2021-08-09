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
import { SubscribeMessage } from '@nestjs/websockets';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { EventStreamService, EventStreamSocket } from '../event-stream/event-stream.service';
import { WebSocketEventsBase, WebSocketEx } from '../websocket-events/websocket-events.base';

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

  private awaitingAck = 0;

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
      this.socket = this.eventstream.subscribe(
        this.url,
        this.topic,
        events => {
          this.awaitingAck += events.length;
          for (const event of events) {
            this.logger.log(`Proxying event: ${JSON.stringify(event)}`);
            this.handleEvent(event);
          }
        },
        receipt => {
          this.handleReceipt(receipt);
        },
      );
    }
  }

  handleDisconnect(client: WebSocketEx) {
    super.handleDisconnect(client);
    if (this.server.clients.size === 0) {
      this.socket?.close();
      this.socket = undefined;
    }
  }

  protected handleEvent(_event: Event) {
    // do nothing (can be overridden)
  }

  protected handleReceipt(_receipt: EventStreamReply) {
    // do nothing (can be overridden)
  }

  ack() {
    if (this.awaitingAck > 0) {
      this.awaitingAck--;
    }
    if (this.awaitingAck === 0) {
      this.logger.log('Sending ack for batch');
      this.socket?.ack();
    }
  }

  @SubscribeMessage('ack')
  handleAck() {
    this.logger.log('Received ack');
    this.ack();
  }
}
