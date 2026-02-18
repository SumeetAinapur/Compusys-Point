
export enum RepairStatus {
  PENDING = 'Pending',
  DIAGNOSING = 'Diagnosing',
  IN_PROGRESS = 'In Progress',
  AWAITING_PARTS = 'Awaiting Parts',
  COMPLETED = 'Completed',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled'
}

export interface ServiceItem {
  problem: string;
  cost: number;
}

export interface Customer {
  id: string; // Unique Customer ID
  name: string;
  phone: string;
  altPhone?: string; // Alternative Mobile Number
  email?: string;
  address?: string;
  createdAt: string;
}

export interface RepairJob {
  id: string;
  customerId: string;
  materialDetails: string;
  services: ServiceItem[]; // Support multiple problems/costs
  estimatedTime: string;
  status: RepairStatus;
  receivedDate: string;
  deliveryDate?: string;
  notes?: string;
  billNote?: string;
  actualTotalCost?: number; // Final combined total
}

export interface AppState {
  customers: Customer[];
  repairs: RepairJob[];
  logo?: string;
}
