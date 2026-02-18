
import React, { forwardRef } from 'react';
import { Customer, RepairJob } from '../types';
import { Logo } from '../constants';

interface RepairBillProps {
  customer: Customer;
  repair: RepairJob;
  logo?: string;
  onNoteChange: (note: string) => void;
}

const RepairBill = forwardRef<HTMLDivElement, RepairBillProps>(({ 
  customer, 
  repair, 
  logo, 
  onNoteChange
}, ref) => {
  const currentNote = repair.billNote || "Thank you for choosing Compusys Point!";
  const totalPayable = repair.actualTotalCost || repair.services.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);

  return (
    <div 
      ref={ref} 
      className="bg-white p-12 mx-auto shadow-lg border border-slate-200 print:shadow-none print:border-none font-bold text-slate-900 relative overflow-hidden flex flex-col"
      style={{ width: '794px', height: '1123px', boxSizing: 'border-box' }}
    >
      
      {/* Watermark Logo - Centered Background */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] z-0">
        <Logo src={logo} className="w-[75%] h-[75%]" />
      </div>

      <div className="relative z-10 h-full flex flex-col">
        {/* Header: Logo Left, Title Center */}
        <div className="flex justify-between items-center border-b-4 border-slate-900 pb-6 mb-8">
          <div className="flex-1 flex justify-start">
            <Logo src={logo} className="h-32 w-32 -ml-8" /> 
          </div>
          <div className="flex-[2] text-center">
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-1 whitespace-nowrap">COMPUSYS POINT</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">INVOICE ID: #{repair.id}</p>
          </div>
          <div className="flex-1"></div>
        </div>

        {/* Customer & Device Information */}
        <div className="grid grid-cols-2 gap-10 mb-6">
          <div className="border-l-4 border-slate-900 pl-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Billed To:</h2>
            <p className="text-xl font-black uppercase mb-0.5">{customer.name}</p>
            <p className="text-lg font-black">{customer.phone}</p>
            <p className="text-sm font-medium text-slate-600 mt-2 leading-tight max-w-[280px]">{customer.address || 'No address provided'}</p>
            <p className="text-[9px] text-slate-400 mt-3 font-mono">CLIENT ID: {customer.id}</p>
          </div>
          <div className="text-right border-r-4 border-slate-900 pr-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Service Context:</h2>
            <p className="text-xl font-black uppercase mb-1">{repair.materialDetails}</p>
            <p className="text-sm font-black uppercase text-blue-700">{repair.status}</p>
            <div className="mt-4 space-y-0.5">
              <p className="text-[11px] font-black text-slate-500 uppercase">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Services Table */}
        <div className="flex-grow">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-4 border-slate-900 text-[11px] uppercase font-black tracking-widest">
                <th className="py-4 px-3">Description of Repair Work</th>
                <th className="py-4 px-3 text-right w-32">Amount</th>
              </tr>
            </thead>
            <tbody>
              {repair.services.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-4 px-3">
                    <p className="text-base font-black uppercase leading-tight">{item.problem}</p>
                  </td>
                  <td className="py-4 px-3 text-right text-lg font-black">₹{item.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Total Amount positioned near bottom line */}
        <div className="mt-auto">
          {/* Total Payable Section */}
          <div className="flex justify-end mb-4 pr-3">
            <div className="text-right border-t border-slate-200 pt-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Payable Amount:</p>
              <p className="text-2xl font-black text-slate-900">₹{totalPayable}</p>
            </div>
          </div>

          {/* Footer Area with Signatory and Notes */}
          <div className="pt-6 border-t-4 border-slate-900">
            <div className="w-full flex justify-between items-start mb-8">
              {/* Note Section */}
              <div className="w-2/3">
                {/* Note display - Always visible so html2canvas captures it */}
                <div className="text-[13px] font-black italic text-slate-700 leading-snug whitespace-pre-wrap max-w-lg border-l-2 border-slate-100 pl-3 py-1">
                  {currentNote}
                </div>
              </div>

              {/* Signatory Space */}
              <div className="w-1/3 text-right">
                <div className="inline-block border-t-2 border-slate-900 pt-1 mt-6 w-44">
                  <p className="text-[10px] font-black uppercase tracking-widest">Authorized Signatory</p>
                </div>
              </div>
            </div>
            
            {/* Contact Details */}
            <div className="flex justify-between items-end border-t border-slate-100 pt-4">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                  Generated by Compusys Point
                </div>
                <div className="text-[9px] font-black text-slate-900 uppercase flex flex-col opacity-80">
                  <span>Phone: +91 9880219066</span>
                  <span>Email: compusyspoint@gmail.com</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default RepairBill;
