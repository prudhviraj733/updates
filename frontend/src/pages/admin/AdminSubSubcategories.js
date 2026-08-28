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

export default function AdminSubSubcategories() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [catId, setCatId] = useState("");

  const load = () => {
    api.get("/admin/subsubcategories").then(({ data }) => setItems(data));
    api.get("/admin/categories").then(({ data }) => setCats(data));
    api.get("/admin/subcategories").then(({ data }) => setSubs(data));
  };
  useEffect(() => { load(); }, []);

  const subName = (id) => subs.find((s) => s.id === id)?.name || "—";
  const catNameOfSub = (subId) => {
    const s = subs.find((x) => x.id === subId);
    return cats.find((c) => c.id === s?.parent_id)?.name || "—";
  };
  const subsForCat = subs.filter((s) => s.parent_id === catId);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, display_order: items.length }); setCatId(""); setOpen(true); };
  const openEdit = (it) => {
    setEditing(it);
    setForm({ ...it, parent_id: it.parent_id || "" });
    const parentSub = subs.find((s) => s.id === it.parent_id);
    setCatId(parentSub?.parent_id || "");
    setOpen(true);
  };

  const save = async () => {
    if (!form.parent_id) { toast.error("Select a parent subcategory"); return; }
    const payload = { ...form, display_order: Number(form.display_order) };
    try {
      if (editing) await api.put(`/admin/categories/${editing.id}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/categories/${id}`); load(); };

  return (
    <div data-testid="admin-subsubcategories">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sub-subcategories</h1><p className="text-sm text-slate-500">{items.length} sub-subcategories</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={openNew} data-testid="add-subsubcategory-btn"><Plus className="mr-1 h-4 w-4" />Add Sub-subcategory</Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Name</th><th className="p-3">Parent Subcategory</th><th className="p-3">Category</th><th className="p-3">Order</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t" data-testid={`subsubcategory-row-${s.id}`}>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-slate-600">{subName(s.parent_id)}</td>
                <td className="p-3 text-slate-500">{catNameOfSub(s.parent_id)}</td>
                <td className="p-3">{s.display_order}</td>
                <td className="p-3">{s.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
                <td className="p-3 text-right">
                  <button className="mr-3" onClick={() => openEdit(s)} data-testid={`edit-subsubcategory-${s.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                  <button onClick={() => del(s.id)} data-testid={`delete-subsubcategory-${s.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Sub-subcategory</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="subsubcategory-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
              <Select value={catId} onValueChange={(v) => { setCatId(v); setForm({ ...form, parent_id: "" }); }}>
                <SelectTrigger data-testid="subsubcategory-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Parent subcategory</Label>
              <Select value={form.parent_id || ""} onValueChange={(v) => setForm({ ...form, parent_id: v })} disabled={!catId}>
                <SelectTrigger data-testid="subsubcategory-parent"><SelectValue placeholder={catId ? "Select subcategory" : "Select a category first"} /></SelectTrigger>
                <SelectContent>{subsForCat.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Display order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-subsubcategory-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
