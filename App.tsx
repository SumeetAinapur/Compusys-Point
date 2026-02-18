import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ICONS, APP_NAME, Logo } from './constants';
import { databaseService } from './services/databaseService';
import { isConfigured } from './services/supabase';
import { Customer, RepairJob, RepairStatus, AppState, ServiceItem } from './types';
import RepairBill from './components/RepairBill';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

type View = 'dashboard' | 'customers' | 'repairs' | 'customer-form' | 'repair-form' | 'bill' | 'settings' | 'setup-guide';

const SQL_SETUP_SCRIPT = `-- SUPABASE DATABASE SETUP SCRIPT FOR COMPUSYS POINT
-- Run this in the Supabase SQL Editor to create all required tables

-- 1. Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create repairs table
CREATE TABLE IF NOT EXISTS public.repairs (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES public.customers(id),
  material_details TEXT NOT NULL,
  services JSONB NOT NULL DEFAULT '[]',
  estimated_time TEXT,
  status TEXT NOT NULL,
  received_date TIMESTAMPTZ DEFAULT NOW(),
  delivery_date TIMESTAMPTZ,
  bill_note TEXT,
  actual_total_cost NUMERIC
);

-- 3. Create settings table for branding
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 4. Enable Row Level Security (Optional: simplifies development)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- 5. Create basic "allow all" policies for development
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all' AND tablename = 'customers') THEN
    CREATE POLICY "Allow all" ON public.customers FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all' AND tablename = 'repairs') THEN
    CREATE POLICY "Allow all" ON public.repairs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all' AND tablename = 'settings') THEN
    CREATE POLICY "Allow all" ON public.settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;`;

const App: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const [data, setData] = useState<AppState & { tablesMissing?: boolean }>({ customers: [], repairs: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepair, setSelectedRepair] = useState<RepairJob | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Customer Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAltPhone, setCustAltPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  
  // Repair Form State
  const [repMaterial, setRepMaterial] = useState('');
  const [repServices, setRepServices] = useState<ServiceItem[]>([{ problem: '', cost: 0 }]);
  const [repTime, setRepTime] = useState('');
  const [repStatus, setRepStatus] = useState<RepairStatus>(RepairStatus.PENDING);
  const [editingRepairId, setEditingRepairId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLDivElement>(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const state = await databaseService.fetchAppState();
      setData(state);
    } catch (err) {
      console.error("Cloud Refresh Failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const stats = useMemo(() => ({
    total: data.repairs.length,
    active: data.repairs.filter(r => r.status !== RepairStatus.DELIVERED && r.status !== RepairStatus.CANCELLED).length,
    delivered: data.repairs.filter(r => r.status === RepairStatus.DELIVERED).length,
    customers: data.customers.length
  }), [data]);

  const filteredRepairs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (data.repairs || []).filter(r => {
      const cust = data.customers.find(c => c.id === r.customerId);
      return (
        r.id.toLowerCase().includes(term) ||
        cust?.name.toLowerCase().includes(term) ||
        cust?.phone.includes(term) ||
        r.materialDetails.toLowerCase().includes(term)
      );
    }).reverse();
  }, [data, searchTerm]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (data.customers || []).filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.phone.includes(term) ||
      c.id.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCustomerId) {
        await databaseService.updateCustomer(editingCustomerId, { name: custName, phone: custPhone, altPhone: custAltPhone, address: custAddress });
      } else {
        await databaseService.addCustomer({ name: custName, phone: custPhone, altPhone: custAltPhone, address: custAddress });
      }
      await refreshData();
      setView('customers');
      resetCustomerForm();
    } catch (err) {
      alert("Error saving customer.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRepair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setLoading(true);
    try {
      const total = repServices.reduce((acc, curr) => acc + Number(curr.cost || 0), 0);
      const repairPayload = {
        materialDetails: repMaterial,
        services: repServices,
        estimatedTime: repTime,
        status: repStatus,
        actualTotalCost: total,
        deliveryDate: repStatus === RepairStatus.DELIVERED ? new Date().toISOString() : undefined
      };

      if (editingRepairId) {
        await databaseService.updateRepair(editingRepairId, repairPayload);
      } else {
        await databaseService.addRepair({ ...repairPayload, customerId: selectedCustomer.id, receivedDate: new Date().toISOString() });
      }
      await refreshData();
      setView('repairs');
      resetRepairForm();
    } catch (err) {
      alert("Error saving repair ticket.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { alert("Logo must be < 1MB"); return; }
    
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await databaseService.saveLogo(reader.result as string);
        await refreshData();
      } catch (err: any) {
        alert(`Upload error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startEditCustomer = (c: Customer) => {
    setEditingCustomerId(c.id);
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustAltPhone(c.altPhone || '');
    setCustAddress(c.address || '');
    setView('customer-form');
  };

  const startEditRepair = (r: RepairJob) => {
    const cust = data.customers.find(c => c.id === r.customerId);
    if (!cust) return;
    setSelectedCustomer(cust);
    setEditingRepairId(r.id);
    setRepMaterial(r.materialDetails);
    setRepServices(r.services);
    setRepTime(r.estimatedTime);
    setRepStatus(r.status);
    setView('repair-form');
  };

  const resetCustomerForm = () => {
    setCustName(''); setCustPhone(''); setCustAltPhone(''); setCustAddress(''); setEditingCustomerId(null);
  };

  const resetRepairForm = () => {
    setRepMaterial(''); setRepServices([{ problem: '', cost: 0 }]); setRepTime(''); 
    setRepStatus(RepairStatus.PENDING); setEditingRepairId(null);
  };

  const addServiceRow = () => setRepServices([...repServices, { problem: '', cost: 0 }]);
  const updateServiceRow = (idx: number, field: keyof ServiceItem, val: string | number) => {
    const next = [...repServices];
    next[idx] = { ...next[idx], [field]: val };
    setRepServices(next);
  };
  const removeServiceRow = (idx: number) => {
    if (repServices.length === 1) return;
    setRepServices(repServices.filter((_, i) => i !== idx));
  };

  const generatePDFBlob = async (): Promise<Blob | null> => {
    if (!billRef.current) return null;
    try {
      const canvas = await html2canvas(billRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, height: 1123 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      return pdf.output('blob');
    } catch (err) {
      return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-72 bg-slate-900 text-slate-400 p-6 flex flex-col no-print border-r border-slate-800">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="p-4 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/10">
            <Logo src={data.logo} className="h-24 w-24" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-black text-white tracking-widest block uppercase">{APP_NAME}</span>
            <span className="text-[9px] text-blue-500 uppercase font-black tracking-[0.3em] mt-1 block">Precision Service</span>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          {[
            { id: 'dashboard', icon: ICONS.Dashboard, label: 'Dashboard' },
            { id: 'customers', icon: ICONS.Users, label: 'Customers' },
            { id: 'repairs', icon: ICONS.Wrench, label: 'Repair Jobs' },
            { id: 'settings', icon: ICONS.Settings, label: 'Settings' }
          ].map(btn => (
            <button key={btn.id} onClick={() => setView(btn.id as View)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group ${view === btn.id ? 'bg-blue-600 text-white shadow-xl' : 'hover:bg-slate-800 hover:text-slate-200'}`}>
              <btn.icon /> <span className="font-bold">{btn.label}</span>
            </button>
          ))}
        </div>

        {data.tablesMissing && (
          <button onClick={() => setView('setup-guide')} className="mt-4 w-full bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-2xl flex items-center gap-3 hover:bg-amber-500/20 transition-all">
            <ICONS.Alert />
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Fix Database</p>
              <p className="text-[9px] font-bold opacity-70">Setup Required</p>
            </div>
          </button>
        )}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 bg-slate-50 overflow-y-auto no-scrollbar">
        {loading && (
          <div className="fixed top-8 right-8 z-50 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-2xl flex items-center gap-3 no-print">
            <div className="loading-spinner h-6 w-6 border-2"></div>
            <span className="text-xs font-black uppercase tracking-widest text-blue-600">Syncing...</span>
          </div>
        )}

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 no-print">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{view}</h2>
            <p className="text-slate-400 text-xs font-bold tracking-widest uppercase mt-1">{APP_NAME} Management Portal</p>
          </div>
          
          <div className="flex items-center gap-4">
            <input type="text" placeholder="Search..." className="px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none w-full md:w-64 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <button onClick={() => { resetCustomerForm(); setView('customer-form'); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg">+ Client</button>
          </div>
        </header>

        <section className="animate-in fade-in duration-500 pb-20">
          {view === 'setup-guide' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-amber-200">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-14 w-14 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center"><ICONS.Alert /></div>
                  <div><h3 className="text-3xl font-black uppercase tracking-tighter">Database Setup</h3><p className="text-slate-500 font-bold">Project is connected, but tables are missing.</p></div>
                </div>
                <div className="mt-8 space-y-4">
                  <pre className="bg-slate-900 text-blue-400 p-6 rounded-2xl text-[10px] font-mono overflow-x-auto leading-relaxed max-h-[300px]">{SQL_SETUP_SCRIPT}</pre>
                  <button onClick={() => { navigator.clipboard.writeText(SQL_SETUP_SCRIPT); alert("SQL Copied!"); }} className="text-blue-600 text-xs font-black uppercase underline">Copy Script</button>
                </div>
                <button onClick={refreshData} className="w-full mt-8 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95">Refresh After Run</button>
              </div>
            </div>
          )}

          {view === 'dashboard' && (
             <div className="space-y-10">
                {data.tablesMissing && (
                  <div className="bg-amber-50 border-2 border-amber-200 p-8 rounded-[2rem] flex items-center justify-between gap-6 shadow-lg">
                    <div><h4 className="text-xl font-black text-amber-900 uppercase">Setup Incomplete</h4><p className="text-amber-700 text-sm font-medium">Data cannot be saved until tables are created.</p></div>
                    <button onClick={() => setView('setup-guide')} className="bg-amber-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg">Fix Now</button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Tickets', val: stats.total, color: 'text-slate-900' },
                    { label: 'Active Repairs', val: stats.active, color: 'text-blue-600' },
                    { label: 'Delivered', val: stats.delivered, color: 'text-green-600' },
                    { label: 'Total Clients', val: stats.customers, color: 'text-slate-900' }
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-3">{stat.label}</p>
                      <h3 className={`text-5xl font-black ${stat.color} tracking-tighter`}>{stat.val}</h3>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-[2rem] p-10 shadow-sm border border-slate-100">
                   <h3 className="text-xl font-black mb-6 uppercase">Recent Activity</h3>
                   <div className="divide-y divide-slate-50">
                     {data.repairs.slice(-5).reverse().map(r => (
                        <div key={r.id} className="py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors px-4 rounded-xl cursor-pointer" onClick={() => { setSelectedRepair(r); setView('bill'); }}>
                          <div><p className="text-[10px] font-black text-blue-600 uppercase">#{r.id}</p><p className="font-bold text-slate-900">{r.materialDetails}</p></div>
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${r.status === RepairStatus.DELIVERED ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{r.status}</span>
                        </div>
                     ))}
                     {data.repairs.length === 0 && <p className="p-10 text-center text-slate-300 font-bold uppercase">No data</p>}
                   </div>
                </div>
             </div>
          )}

          {view === 'customers' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <tr><th className="p-6">Client ID</th><th className="p-6">Full Name</th><th className="p-6">Contact Info</th><th className="p-6">Address</th><th className="p-6 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-6 font-black text-blue-600 text-xs">#{c.id}</td>
                      <td className="p-6">
                        <p className="font-black text-slate-900">{c.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">Joined {new Date(c.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="p-6"><p className="text-sm font-bold text-slate-700">{c.phone}</p>{c.altPhone && <p className="text-xs text-slate-400">{c.altPhone}</p>}</td>
                      <td className="p-6 text-sm text-slate-500 font-medium truncate max-w-xs">{c.address || '—'}</td>
                      <td className="p-6 text-right space-x-2">
                        <button onClick={() => { setSelectedCustomer(c); resetRepairForm(); setView('repair-form'); }} className="text-[10px] bg-slate-900 text-white px-4 py-2 rounded-xl font-black uppercase hover:bg-blue-600 transition-all shadow-md active:scale-95">New Job</button>
                        <button onClick={() => startEditCustomer(c)} className="text-slate-400 hover:text-blue-600 transition-colors p-2"><ICONS.Edit /></button>
                        <button onClick={async () => { if(confirm("Delete customer?")) { await databaseService.deleteCustomer(c.id); refreshData(); } }} className="text-slate-300 hover:text-red-600 transition-colors p-2"><ICONS.Trash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCustomers.length === 0 && <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest">No customers found</div>}
            </div>
          )}

          {view === 'customer-form' && (
             <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
                <h3 className="text-3xl font-black uppercase tracking-tighter mb-8">{editingCustomerId ? 'Modify Client' : 'New Client Registration'}</h3>
                <form onSubmit={handleSaveCustomer} className="space-y-6">
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Client Name</label><input required placeholder="Rahul Sharma" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold" value={custName} onChange={e => setCustName(e.target.value)} /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Primary Phone</label><input required placeholder="Mobile Number" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold" value={custPhone} onChange={e => setCustPhone(e.target.value)} /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alternate Phone</label><input placeholder="Optional" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold" value={custAltPhone} onChange={e => setCustAltPhone(e.target.value)} /></div>
                  </div>
                  <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Address</label><textarea placeholder="Address details..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold" value={custAddress} onChange={e => setCustAddress(e.target.value)} rows={3} /></div>
                  <div className="flex gap-4 pt-6">
                    <button type="button" onClick={() => setView('customers')} className="flex-1 py-4 bg-slate-100 font-black rounded-2xl uppercase tracking-widest">Cancel</button>
                    <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest">Save Client</button>
                  </div>
                </form>
             </div>
          )}

          {view === 'repair-form' && (
            <div className="max-w-3xl mx-auto bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
               <h3 className="text-3xl font-black uppercase tracking-tighter mb-2">{editingRepairId ? 'Edit Repair' : 'Create Repair Ticket'}</h3>
               <p className="text-blue-600 font-bold text-xs uppercase mb-8">Client: {selectedCustomer?.name}</p>
               <form onSubmit={handleSaveRepair} className="space-y-8">
                 <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Device/Material Details</label><input required placeholder="iPhone 13 / Laptop HP" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-black text-lg" value={repMaterial} onChange={e => setRepMaterial(e.target.value)} /></div>
                 <div className="space-y-4">
                   <div className="flex justify-between items-center"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Services & Repairs</label><button type="button" onClick={addServiceRow} className="text-blue-600 font-black text-[10px] uppercase">+ Add Row</button></div>
                   {repServices.map((row, idx) => (
                     <div key={idx} className="flex gap-4 items-center">
                       <input required placeholder="Description" className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold" value={row.problem} onChange={e => updateServiceRow(idx, 'problem', e.target.value)} />
                       <input required type="number" placeholder="Cost" className="w-32 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-black" value={row.cost} onChange={e => updateServiceRow(idx, 'cost', Number(e.target.value))} />
                       <button type="button" onClick={() => removeServiceRow(idx)} className="text-slate-300 hover:text-red-500"><ICONS.Trash /></button>
                     </div>
                   ))}
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Est. Time</label><input placeholder="2 Days" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" value={repTime} onChange={e => setRepTime(e.target.value)} /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</label>
                    <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-black uppercase tracking-widest text-xs" value={repStatus} onChange={e => setRepStatus(e.target.value as RepairStatus)}>
                       {Object.values(RepairStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                   </div>
                 </div>
                 <div className="flex gap-4 pt-10">
                   <button type="button" onClick={() => setView('repairs')} className="flex-1 py-4 bg-slate-100 font-black rounded-2xl uppercase tracking-widest">Discard</button>
                   <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest">Finalize Ticket</button>
                 </div>
               </form>
            </div>
          )}

          {view === 'repairs' && (
            <div className="space-y-6">
              {filteredRepairs.map(r => (
                <div key={r.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 hover:border-blue-200 transition-all group">
                   <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2"><span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">#{r.id}</span><span className="text-[10px] text-slate-300 uppercase font-bold">• Received {new Date(r.receivedDate).toLocaleDateString()}</span></div>
                      <h4 className="text-2xl font-black text-slate-900 tracking-tight">{r.materialDetails}</h4>
                      <p className="text-xs font-bold text-slate-400 uppercase mt-1">Client: {data.customers.find(c => c.id === r.customerId)?.name || 'Unknown'}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {r.services.map((s, i) => <span key={i} className="text-[10px] font-black uppercase bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{s.problem}</span>)}
                      </div>
                   </div>
                   <div className="flex flex-col md:items-end justify-center gap-4">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${r.status === RepairStatus.DELIVERED ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>{r.status}</span>
                      <div className="flex gap-2">
                        <button onClick={() => startEditRepair(r)} className="p-2 text-slate-300 hover:text-blue-600"><ICONS.Edit /></button>
                        <button onClick={async () => { if(confirm("Delete repair?")) { await databaseService.deleteRepair(r.id); refreshData(); } }} className="p-2 text-slate-300 hover:text-red-600"><ICONS.Trash /></button>
                        <button onClick={() => { setSelectedRepair(r); setView('bill'); }} className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase shadow-lg hover:bg-blue-600">Invoice</button>
                      </div>
                   </div>
                </div>
              ))}
              {filteredRepairs.length === 0 && <div className="p-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100"><h3 className="text-2xl font-black text-slate-300">No repair jobs found</h3></div>}
            </div>
          )}

          {view === 'settings' && (
            <div className="max-w-xl mx-auto space-y-8">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
                <h3 className="text-2xl font-black mb-8 border-b pb-6 uppercase tracking-tight">Identity</h3>
                <div className="flex flex-col items-center gap-8">
                   <div className="p-4 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 group relative">
                      <Logo src={data.logo} className="h-40 w-40 object-contain" />
                   </div>
                   <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
                   <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Update Logo</button>
                   <p className="text-[10px] text-slate-400 font-bold uppercase">PNG / JPG, Max 1MB</p>
                </div>
              </div>
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
                 <h3 className="text-2xl font-black mb-6 uppercase tracking-tight">System</h3>
                 <div className="space-y-4">
                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                       <div><p className="text-sm font-black text-slate-800 uppercase">Database Status</p><p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{isConfigured ? 'Supabase Online' : 'Offline'}</p></div>
                       <div className={`w-3 h-3 rounded-full ${isConfigured ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                    </div>
                    <button onClick={() => setView('setup-guide')} className="w-full p-6 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 font-black uppercase text-[10px] hover:border-blue-500 hover:text-blue-500 transition-all">Launch SQL Setup Wizard</button>
                 </div>
              </div>
            </div>
          )}

          {view === 'bill' && selectedRepair && (
            <div className="space-y-8 pb-20">
              <div className="no-print bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] border border-slate-200 space-y-6 shadow-2xl sticky top-4 z-40">
                <div className="flex justify-between items-center">
                   <button onClick={() => setView('repairs')} className="text-slate-400 font-black uppercase text-[10px] hover:text-slate-900 flex items-center gap-2">← Back to Queue</button>
                   <div className="flex gap-3">
                     <button onClick={() => {
                        const cust = data.customers.find(c => c.id === selectedRepair.customerId);
                        if (!cust) return;
                        const msg = `Hello ${cust.name}, your repair #${selectedRepair.id} (${selectedRepair.materialDetails}) is complete. Total: ₹${selectedRepair.actualTotalCost}. Collect at Compusys Point.`;
                        window.open(`https://wa.me/91${cust.phone}?text=${encodeURIComponent(msg)}`, '_blank');
                     }} className="bg-green-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase shadow-lg">WhatsApp</button>
                     <button onClick={async () => {
                        const blob = await generatePDFBlob();
                        if (blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Invoice_${selectedRepair.id}.pdf`; link.click(); }
                     }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase shadow-lg">Download PDF</button>
                   </div>
                </div>
              </div>
              <div className="flex justify-center p-4 md:p-12 bg-slate-300 rounded-[3rem] overflow-x-auto shadow-inner no-scrollbar">
                {(() => {
                  const cust = data.customers.find(c => c.id === selectedRepair.customerId);
                  if (!cust) return <div className="p-20 bg-white rounded-3xl font-black text-red-500 uppercase">Data Error</div>;
                  return <RepairBill 
                    ref={billRef} customer={cust} repair={selectedRepair} logo={data.logo} 
                    onNoteChange={async (n) => {
                      await databaseService.updateRepair(selectedRepair.id, { billNote: n });
                      refreshData();
                    }} 
                  />;
                })()}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;