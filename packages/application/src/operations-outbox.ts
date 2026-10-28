export interface OperationsOutboxEvent { id: string; eventType: string; aggregateId: string; attempt: number }
export interface OperationsOutbox {
  claim(limit: number): Promise<OperationsOutboxEvent[]>;
  complete(event: OperationsOutboxEvent): Promise<void>;
  retry(event: OperationsOutboxEvent): Promise<void>;
}
