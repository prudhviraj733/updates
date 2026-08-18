import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  useEffect(() => { api.get("/admin/customers").then(({ data }) => setCustomers(data)); }, []);

  return (
    <div data-testid="admin-customers">
      <h1 className="text-2xl font-bold">Customer Info</h1>
      <p className="text-sm text-slate-500">{customers.length} registered customers — click a row for the full Customer 360 view</p>
      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Orders</th><th className="px-4 py-2">Addresses</th><th className="px-4 py-2">Joined</th></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => navigate(`/admin/customers/${c.id}`)} data-testid={`customer-row-${c.id}`}>
                <td className="px-4 py-2 font-medium text-forest">{c.name}</td>
                <td className="px-4 py-2">{c.email}</td>
                <td className="px-4 py-2">{c.phone}</td>
                <td className="px-4 py-2">{c.order_count}</td>
                <td className="px-4 py-2">{c.address_count}</td>
                <td className="px-4 py-2">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No customers</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
