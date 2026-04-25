"use client";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Upload, Play, Phone, CheckCircle, XCircle, Clock, Plus, Edit, Trash2 } from "lucide-react";

export default function Dashboard() {
  const [customers, setCustomers] = useState([]);
  const [file, setFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    customer_name: "",
    phone_number: "",
    preferred_language: "English",
    order_id: "",
    order_details: "",
    order_amount: 0,
    delivery_date: "Tomorrow",
    payment_mode: "COD"
  });

  const fetchCustomers = async () => {
    try {
      const res = await axios.get("http://localhost:8001/api/v1/calls/");
      setCustomers(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCustomers();
    const interval = setInterval(fetchCustomers, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`http://localhost:8001/api/v1/calls/${editingId}`, formData);
      } else {
        await axios.post("http://localhost:8001/api/v1/calls/", formData);
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({
        customer_name: "",
        phone_number: "",
        preferred_language: "English",
        order_id: "",
        order_details: "",
        order_amount: 0,
        delivery_date: "Tomorrow",
        payment_mode: "COD"
      });
      fetchCustomers();
    } catch (e) {
      alert("Save failed");
    }
  };

  const deleteCustomer = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    try {
      await axios.delete(`http://localhost:8001/api/v1/calls/${id}`);
      fetchCustomers();
    } catch (e) {
      alert("Delete failed");
    }
  };

  const editCustomer = (c: any) => {
    setEditingId(c.id);
    setFormData({
      customer_name: c.customer_name,
      phone_number: c.phone_number,
      preferred_language: c.preferred_language,
      order_id: c.order_id,
      order_details: c.order_details,
      order_amount: c.order_amount,
      delivery_date: c.delivery_date,
      payment_mode: c.payment_mode
    });
    setShowModal(true);
  };

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post("http://localhost:8001/api/v1/calls/upload", formData);
      alert("Upload successful!");
      fetchCustomers();
    } catch (e) {
      alert("Upload failed");
    }
  };

  const startCampaign = async () => {
    try {
      await axios.post("http://localhost:8001/api/v1/calls/start-campaign");
      alert("Campaign started!");
    } catch (e) {
      alert("Campaign failed to start");
    }
  };

  const confirmManually = async (id: number) => {
    try {
      await axios.post(`http://localhost:8001/api/v1/calls/${id}/confirm`);
      fetchCustomers();
    } catch (e) {
      alert("Manual confirmation failed");
    }
  };

  const stats = {
    total: customers.length,
    pending: customers.filter((c: any) => c.call_status === "PENDING").length,
    completed: customers.filter((c: any) => c.call_status === "COMPLETED").length,
    confirmed: customers.filter((c: any) => c.order_status === "CONFIRMED").length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Voice AI Automaton</h1>
            <p className="text-gray-500 mt-2">Automated Order Confirmation Dashboard</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => { setEditingId(null); setShowModal(true); }}
              className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-medium hover:bg-indigo-100 flex items-center"
            >
              <Plus className="mr-2 h-5 w-5" /> Add Customer
            </button>
            <button 
              onClick={() => window.open("/simulator", "_blank", "width=400,height=850")}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center"
            >
              <Phone className="mr-2 h-5 w-5" /> Open Simulator UI
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium">Total Orders</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium">Calls Pending</p>
            <p className="text-3xl font-bold text-amber-600 mt-2">{stats.pending}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium">Calls Completed</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.completed}</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium">Orders Confirmed</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.confirmed}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <button onClick={handleUpload} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 flex items-center">
              <Upload className="mr-2 h-4 w-4" /> Upload CSV
            </button>
          </div>
          
          <button onClick={startCampaign} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 flex items-center">
            <Play className="mr-2 h-5 w-5" /> Start Call Campaign
          </button>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-medium text-gray-500">Customer</th>
                <th className="p-4 font-medium text-gray-500">Phone</th>
                <th className="p-4 font-medium text-gray-500">Language</th>
                <th className="p-4 font-medium text-gray-500">Call Status</th>
                <th className="p-4 font-medium text-gray-500">Order Status</th>
                <th className="p-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-900">{c.customer_name}</td>
                  <td className="p-4 text-gray-600">{c.phone_number}</td>
                  <td className="p-4 text-gray-600">{c.preferred_language}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      c.call_status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                      c.call_status === 'RINGING' ? 'bg-purple-100 text-purple-700 animate-pulse' :
                      c.call_status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {c.call_status}
                    </span>
                  </td>
                  <td className="p-4">
                    {c.order_status === 'CONFIRMED' && <span className="flex items-center text-green-600 text-sm font-medium"><CheckCircle className="mr-1 h-4 w-4"/> Confirmed</span>}
                    {c.order_status === 'CANCELLED' && <span className="flex items-center text-red-600 text-sm font-medium"><XCircle className="mr-1 h-4 w-4"/> Cancelled</span>}
                    {c.order_status === 'CALLBACK_LATER' && <span className="flex items-center text-amber-600 text-sm font-medium"><Clock className="mr-1 h-4 w-4"/> Callback</span>}
                    {c.order_status === 'PENDING' && <span className="text-gray-400 text-sm">Pending</span>}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {c.order_status === 'PENDING' && (
                        <button 
                          onClick={() => confirmManually(c.id)}
                          className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded border border-indigo-200 hover:bg-indigo-100"
                        >
                          Confirm
                        </button>
                      )}
                      <button onClick={() => editCustomer(c)} className="text-gray-400 hover:text-indigo-600"><Edit size={16}/></button>
                      <button onClick={() => deleteCustomer(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">No customers found. Upload a CSV to begin.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Edit Customer' : 'Add New Customer'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                  <input required value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                  <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Language</label>
                  <select value={formData.preferred_language} onChange={e => setFormData({...formData, preferred_language: e.target.value})} className="w-full border rounded p-2 text-sm">
                    <option>English</option><option>Hindi</option><option>Kannada</option><option>Marathi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Order ID</label>
                  <input required value={formData.order_id} onChange={e => setFormData({...formData, order_id: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Details</label>
                <textarea required value={formData.order_details} onChange={e => setFormData({...formData, order_details: e.target.value})} className="w-full border rounded p-2 text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount</label>
                  <input type="number" required value={formData.order_amount} onChange={e => setFormData({...formData, order_amount: Number(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Delivery Date</label>
                  <input required value={formData.delivery_date} onChange={e => setFormData({...formData, delivery_date: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded font-bold">Save Customer</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded font-bold">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}