import { Event, EventStreamReply } from '../event-stream/event-stream.interfaces';

export interface EventListener {
  handleEvent: (event: Event) => void;
  handleReceipt: (receipt: EventStreamReply) => void;
}
