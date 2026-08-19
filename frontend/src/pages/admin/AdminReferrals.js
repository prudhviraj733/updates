import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export default function AdminReferrals() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => { api.get("/admin/referrals").then(({ data }) => setData(data)).catch(() => setData({ summary: {}, referrers: [] })); }, []);

  if (!data) return <p className="text-slate-400">Loading…</p>;
  const s = data.summary || {};

  const cards = [
    { label: "Total Referrals", value: s.total_referrals ?? 0 },
    { label: "Referrers", value: s.total_referrers ?? 0 },
    { label: "Rewards Paid", value: inr(s.total_reward_paid ?? 0) },
    { label: "Users with Codes", value: s.users_with_codes ?? 0 },
  ];

  return (
    <div data-testid="admin-referrals">
      <h1 className="text-2xl font-bold">Referrals</h1>
      <p className="text-sm text-slate-500">Referral customers, rewards, statistics & spending</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-white p-4" data-testid={`ref-stat-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-forest">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-forest/20 bg-forest-light/40 p-3 text-sm" data-testid="anti-self-referral">
        <ShieldCheck className="h-4 w-4 text-forest" />
        <span className="font-medium text-forest">Anti-self-referral:</span>
        <span className="text-slate-600">{s.anti_self_referral || "Enforced"}</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Referrer</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">Referred</th><th className="px-4 py-2">Reward Paid</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {data.referrers.map((r) => (
              <>
                <tr key={r.referrer_id} className="border-t" data-testid={`referrer-row-${r.referrer_id}`}>
                  <td className="px-4 py-2"><p className="font-medium">{r.referrer_name}</p><p className="text-xs text-slate-400">{r.referrer_email}</p></td>
                  <td className="px-4 py-2">{r.referral_code ? <Badge variant="secondary">{r.referral_code}</Badge> : "—"}</td>
                  <td className="px-4 py-2">{r.referred_count}</td>
                  <td className="px-4 py-2 font-medium text-forest">{inr(r.reward_paid)}</td>
                  <td className="px-4 py-2"><button onClick={() => setOpen({ ...open, [r.referrer_id]: !open[r.referrer_id] })} className="text-slate-500 hover:text-forest"><ChevronDown className={`h-4 w-4 transition-transform ${open[r.referrer_id] ? "rotate-180" : ""}`} /></button></td>
                </tr>
                {open[r.referrer_id] && (
                  <tr className="bg-slate-50"><td colSpan="5" className="px-6 py-2">
                    <ul className="space-y-1">
                      {r.referred.map((f, i) => (
                        <li key={i} className="flex justify-between text-xs text-slate-600"><span>{f.name || "Customer"}</span><span>{inr(f.reward)} · {(f.date || "").slice(0, 10)}</span></li>
                      ))}
                    </ul>
                  </td></tr>
                )}
              </>
            ))}
            {data.referrers.length === 0 && <tr><td colSpan="5" className="px-4 py-6 text-center text-slate-400">No referrals yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
