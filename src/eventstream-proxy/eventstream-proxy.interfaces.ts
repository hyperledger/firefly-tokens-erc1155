export interface UriEventData {
  id: string;
  value: string;
}

export interface TransferSingleEventData {
  from: string;
  to: string;
  operator: string;
  id: string;
  value: number;
}

export interface TokenPoolCreatedEvent {
  namespace: string;
  name: string;
  id: string;
}
