import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Package, CreditCard, RotateCcw, Tag, Megaphone, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/context/NotificationContext";

const ICONS = {
  order: Package, payment: CreditCard, refund: RotateCcw,
  offer: Tag, announcement: Megaphone, general: Bell,
};

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { items, loading, loadItems, markRead, markAllRead, unread } = useNotifications();

  useEffect(() => { loadItems(); }, [loadItems]);

  const onClick = (n) => {
    if (!n.read) markRead(n.id);
    if (n.deep_link) navigate(n.deep_link);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6" data-testid="notifications-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-extrabold text-forest">Notifications</h1>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} data-testid="notifications-mark-all">
            <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center" data-testid="notifications-empty">
          <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-muted-foreground">You have no notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => onClick(n)}
                data-testid={`notifications-row-${n.id}`}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-forest/40 ${n.read ? "bg-white" : "border-forest/20 bg-forest/5"}`}
              >
                {n.image ? (
                  <img src={n.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${n.read ? "bg-muted text-muted-foreground" : "bg-forest/10 text-forest"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate ${n.read ? "font-semibold" : "font-bold"}`}>{n.title}</p>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-saffron" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{fmt(n.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
