
import { supabase, isConfigured } from './supabase';
import { Customer, RepairJob, AppState } from '../types';

const ID_START_BASE = 1000;

export const databaseService = {
  // Helper to check if an error is a "Table not found" error
  isTableMissingError: (error: any) => {
    return error && (error.code === 'PGRST205' || error.message?.includes('schema cache') || error.message?.includes('does not exist'));
  },

  fetchAppState: async (): Promise<AppState & { tablesMissing?: boolean }> => {
    if (!isConfigured) return { customers: [], repairs: [] };
    
    try {
      const [customersRes, repairsRes, settingsRes] = await Promise.all([
        supabase.from('customers').select('*'),
        supabase.from('repairs').select('*'),
        supabase.from('settings').select('*').eq('key', 'logo').maybeSingle()
      ]);

      const tablesMissing = [customersRes.error, repairsRes.error].some(err => databaseService.isTableMissingError(err));

      return {
        customers: (customersRes.data || []).map((c: any) => ({
          ...c,
          altPhone: c.alt_phone,
          createdAt: c.created_at || new Date().toISOString()
        })),
        repairs: (repairsRes.data || []).map((r: any) => ({
          ...r,
          customerId: r.customer_id,
          materialDetails: r.material_details,
          receivedDate: r.received_date,
          deliveryDate: r.delivery_date,
          billNote: r.bill_note,
          actualTotalCost: r.actual_total_cost
        })),
        logo: settingsRes.data?.value || undefined,
        tablesMissing
      };
    } catch (err) {
      console.error("Critical Database Error:", err);
      return { customers: [], repairs: [] };
    }
  },

  saveLogo: async (logo: string) => {
    if (!isConfigured) throw new Error("Database not connected.");
    
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'logo', value: logo }, { onConflict: 'key' });
    
    if (error) {
      if (databaseService.isTableMissingError(error)) {
        throw new Error("The 'settings' table is missing. Please run the SQL setup script in Settings.");
      }
      throw error;
    }
  },

  addCustomer: async (customer: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> => {
    const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const nextNum = ID_START_BASE + (count || 0);
    const newId = `C-${(nextNum + 1).toString().padStart(6, '0')}`;
    
    const payload = {
      id: newId,
      name: customer.name,
      phone: customer.phone,
      alt_phone: customer.altPhone,
      address: customer.address,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('customers').insert(payload).select().single();
    if (error) throw error;
    return { ...data, altPhone: data.alt_phone, createdAt: data.created_at };
  },

  updateCustomer: async (customerId: string, updates: Partial<Customer>) => {
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.phone) payload.phone = updates.phone;
    if (updates.altPhone !== undefined) payload.alt_phone = updates.altPhone;
    if (updates.address !== undefined) payload.address = updates.address;

    const { error } = await supabase.from('customers').update(payload).eq('id', customerId);
    if (error) throw error;
  },

  deleteCustomer: async (customerId: string) => {
    await supabase.from('repairs').delete().eq('customer_id', customerId);
    const { error } = await supabase.from('customers').delete().eq('id', customerId);
    if (error) throw error;
  },

  addRepair: async (repair: Omit<RepairJob, 'id'>): Promise<RepairJob> => {
    const { count } = await supabase.from('repairs').select('*', { count: 'exact', head: true });
    const nextNum = ID_START_BASE + (count || 0);
    const newId = `R-${(nextNum + 1).toString().padStart(6, '0')}`;

    const payload = {
      id: newId,
      customer_id: repair.customerId,
      material_details: repair.materialDetails,
      services: repair.services,
      estimated_time: repair.estimatedTime,
      status: repair.status,
      received_date: repair.receivedDate,
      bill_note: repair.billNote,
      actual_total_cost: repair.actualTotalCost
    };

    const { data, error } = await supabase.from('repairs').insert(payload).select().single();
    if (error) throw error;
    return {
      ...data,
      customerId: data.customer_id,
      materialDetails: data.material_details,
      receivedDate: data.received_date,
      deliveryDate: data.delivery_date,
      billNote: data.bill_note,
      actualTotalCost: data.actual_total_cost
    };
  },

  updateRepair: async (repairId: string, updates: Partial<RepairJob>) => {
    const payload: any = {};
    if (updates.materialDetails) payload.material_details = updates.materialDetails;
    if (updates.services) payload.services = updates.services;
    if (updates.estimatedTime) payload.estimated_time = updates.estimatedTime;
    if (updates.status) payload.status = updates.status;
    if (updates.deliveryDate) payload.delivery_date = updates.deliveryDate;
    if (updates.billNote !== undefined) payload.bill_note = updates.billNote;
    if (updates.actualTotalCost !== undefined) payload.actual_total_cost = updates.actualTotalCost;

    const { error } = await supabase.from('repairs').update(payload).eq('id', repairId);
    if (error) throw error;
  },

  deleteRepair: async (repairId: string) => {
    const { error } = await supabase.from('repairs').delete().eq('id', repairId);
    if (error) throw error;
  }
};
