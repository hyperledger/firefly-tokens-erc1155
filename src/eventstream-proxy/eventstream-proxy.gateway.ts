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
import { WebSocketGateway } from '@nestjs/websockets';
import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';
import { EventStreamService } from '../event-stream/event-stream.service';
import { EventStreamProxyBase } from './eventstream-proxy.base';
import { EventListener } from './eventstream-proxy.interfaces';

@WebSocketGateway({ path: '/api/ws' })
export class EventStreamProxyGateway extends EventStreamProxyBase {
  listeners: EventListener[] = [];

  constructor(protected eventStream: EventStreamService) {
    super(new Logger(EventStreamProxyGateway.name), eventStream, false);
  }

  addListener(listener: EventListener) {
    this.listeners.push(listener);
  }

  protected handleEvent(event: Event) {
    for (const listener of this.listeners) {
      listener.handleEvent(event);
    }
  }

  protected handleReceipt(receipt: EventStreamReply) {
    for (const listener of this.listeners) {
      listener.handleReceipt(receipt);
    }
  }
}
