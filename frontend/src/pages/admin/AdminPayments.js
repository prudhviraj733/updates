import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const PAY_COLORS = { paid: "bg-forest-light text-forest", pending: "bg-amber-100 text-amber-700", failed: "bg-red-100 text-red-700", refunded: "bg-slate-100 text-slate-600" };

export default function AdminPayments() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.get("/admin/orders").then(({ data }) => setOrders(data)); }, []);

  const paid = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.final_amount, 0);
  const pending = orders.filter((o) => o.payment_status === "pending").reduce((s, o) => s + o.final_amount, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">Payments</h1>
      <p className="text-sm text-slate-500">Payment tracking · Razorpay + COD</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Collected (Paid)</p><p className="mt-1 text-2xl font-bold text-forest">{inr(paid)}</p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Pending</p><p className="mt-1 text-2xl font-bold text-amber-600">{inr(pending)}</p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Total Transactions</p><p className="mt-1 text-2xl font-bold">{orders.length}</p></div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Payment Status</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t" data-testid={`payment-row-${o.id}`}>
                <td className="px-4 py-2 font-medium">{o.order_number}</td>
                <td className="px-4 py-2">{o.customer_name}</td>
                <td className="px-4 py-2"><Badge variant="outline">{o.payment_method.toUpperCase()}</Badge></td>
                <td className="px-4 py-2">{inr(o.final_amount)}</td>
                <td className="px-4 py-2"><Badge className={`${PAY_COLORS[o.payment_status]} capitalize`}>{o.payment_status}</Badge></td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="5" className="px-4 py-6 text-center text-slate-400">No transactions</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
