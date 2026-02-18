
import { AppState, Customer, RepairJob } from '../types';

const STORAGE_KEY = 'compusys_point_data';
const ID_START_BASE = 1000;

export const storageService = {
  loadData: (): AppState => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return { customers: [], repairs: [] };
    }
    return JSON.parse(data);
  },

  saveData: (state: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  saveLogo: (logo: string) => {
    const data = storageService.loadData();
    data.logo = logo;
    storageService.saveData(data);
  },

  clearAllData: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const data = storageService.loadData();
    // Use max ID + 1 to avoid duplicates after deletions
    const maxIdNum = data.customers.reduce((max, c) => {
      const num = parseInt(c.id.split('-')[1]);
      return num > max ? num : max;
    }, ID_START_BASE - 1);
    
    const newCustomer: Customer = {
      ...customer,
      id: `C-${(maxIdNum + 1).toString().padStart(6, '0')}`,
      createdAt: new Date().toISOString()
    };
    data.customers.push(newCustomer);
    storageService.saveData(data);
    return newCustomer;
  },

  updateCustomer: (customerId: string, updates: Partial<Customer>) => {
    const data = storageService.loadData();
    const index = data.customers.findIndex(c => c.id === customerId);
    if (index !== -1) {
      data.customers[index] = { ...data.customers[index], ...updates };
      storageService.saveData(data);
    }
  },

  deleteCustomer: (customerId: string) => {
    const data = storageService.loadData();
    data.customers = data.customers.filter(c => c.id !== customerId);
    data.repairs = data.repairs.filter(r => r.customerId !== customerId);
    storageService.saveData(data);
  },

  addRepair: (repair: Omit<RepairJob, 'id'>): RepairJob => {
    const data = storageService.loadData();
    // Use max ID + 1 to avoid duplicates
    const maxIdNum = data.repairs.reduce((max, r) => {
      const num = parseInt(r.id.split('-')[1]);
      return num > max ? num : max;
    }, ID_START_BASE - 1);

    const newRepair: RepairJob = {
      ...repair,
      id: `R-${(maxIdNum + 1).toString().padStart(6, '0')}`
    };
    data.repairs.push(newRepair);
    storageService.saveData(data);
    return newRepair;
  },

  updateRepair: (repairId: string, updates: Partial<RepairJob>) => {
    const data = storageService.loadData();
    const index = data.repairs.findIndex(r => r.id === repairId);
    if (index !== -1) {
      data.repairs[index] = { ...data.repairs[index], ...updates };
      storageService.saveData(data);
    }
  },

  deleteRepair: (repairId: string) => {
    const data = storageService.loadData();
    data.repairs = data.repairs.filter(r => r.id !== repairId);
    storageService.saveData(data);
  }
};
