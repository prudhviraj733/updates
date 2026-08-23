import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Package, CreditCard, RotateCcw, Tag, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";

const ICONS = {
  order: Package, payment: CreditCard, refund: RotateCcw,
  offer: Tag, announcement: Megaphone, general: Bell,
};

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unread, items, loading, loadItems, markRead, markAllRead } = useNotifications();
  if (!user || user === false) return null;

  const onOpen = (o) => { if (o) loadItems(); };
  const onClick = (n) => {
    if (!n.read) markRead(n.id);
    if (n.deep_link) navigate(n.deep_link);
  };

  return (
    <Popover onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" data-testid="notification-bell">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              data-testid="notification-unread-badge"
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-saffron px-1 text-[10px] font-bold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" data-testid="notification-panel">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-heading text-sm font-bold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAllRead} data-testid="notification-mark-all-read"
              className="flex items-center gap-1 text-xs font-medium text-forest hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[380px]">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center" data-testid="notification-empty">
              <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            items.map((n) => {
              const Icon = ICONS[n.type] || Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => onClick(n)}
                  data-testid={`notification-item-${n.id}`}
                  className={`flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${n.read ? "" : "bg-forest/5"}`}
                >
                  <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.read ? "bg-muted text-muted-foreground" : "bg-forest/10 text-forest"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${n.read ? "font-medium" : "font-bold"}`}>{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] uppercase text-muted-foreground/70">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-saffron" />}
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
