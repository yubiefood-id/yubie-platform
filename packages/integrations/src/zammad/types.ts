export interface ZammadTicket {
  id: number;
  number: string;
  title: string;
  group_id: number;
  state_id: number;
  priority_id: number;
  owner_id: number;
  customer_id: number;
  updated_at: string;
  created_at: string;
}

export interface ZammadArticle {
  id: number;
  ticket_id: number;
  from: string;
  to: string;
  subject: string;
  body: string;
  content_type: string;
  internal: boolean;
  sender: "Customer" | "Agent" | "System";
  type: string;
  type_id: number;
  created_at: string;
  created_by_id: number;
  origin_by_id?: number;
}

export interface ZammadTriggerPayload {
  event?: string;
  ticket_id?: number;
  article_id?: number;
  customer_id?: number;
  group_id?: number;
  state_id?: number;
}

export interface ZammadGroup {
  id: number;
  name: string;
  active: boolean;
}

export interface ZammadTicketState {
  id: number;
  name: string;
  state_type_id: number;
}
