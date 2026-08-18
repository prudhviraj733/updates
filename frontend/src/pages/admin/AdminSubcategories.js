import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = { name: "", description: "", image_url: "", parent_id: "", display_order: 0, is_active: true };

export default function AdminSubcategories() {
  const [subs, setSubs] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => {
    api.get("/admin/subcategories").then(({ data }) => setSubs(data));
    api.get("/admin/categories").then(({ data }) => setCats(data));
  };
  useEffect(() => { load(); }, []);

  const catName = (id) => cats.find((c) => c.id === id)?.name || "—";

  const save = async () => {
    if (!form.parent_id) { toast.error("Select a parent category"); return; }
    const payload = { ...form, display_order: Number(form.display_order) };
    try {
      if (editing) await api.put(`/admin/categories/${editing.id}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/categories/${id}`); load(); };

  return (
    <div data-testid="admin-subcategories">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Subcategories</h1><p className="text-sm text-slate-500">{subs.length} subcategories</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm({ ...EMPTY, display_order: subs.length }); setOpen(true); }} data-testid="add-subcategory-btn"><Plus className="mr-1 h-4 w-4" />Add Subcategory</Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Parent Category</th><th className="p-3">Order</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-t" data-testid={`subcategory-row-${s.id}`}>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-slate-600">{catName(s.parent_id)}</td>
                <td className="p-3">{s.display_order}</td>
                <td className="p-3">{s.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                <td className="p-3 text-right">
                  <button className="mr-3" onClick={() => { setEditing(s); setForm({ ...s, parent_id: s.parent_id || "" }); setOpen(true); }} data-testid={`edit-subcategory-${s.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                  <button onClick={() => del(s.id)} data-testid={`delete-subcategory-${s.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Subcategory</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="subcategory-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Parent category</Label>
              <Select value={form.parent_id || ""} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
                <SelectTrigger data-testid="subcategory-parent"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Display order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-subcategory-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
