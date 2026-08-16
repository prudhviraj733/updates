export function Footer() {
  return (
    <footer className="mt-20 border-t border-black/5 bg-forest text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="font-heading text-2xl font-extrabold">Freshly</p>
            <p className="mt-3 text-sm text-white/70">
              Fresh groceries, dry fruits & daily essentials delivered to your doorstep in slots that suit you.
            </p>
          </div>
          <div>
            <p className="font-semibold">Shop</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>Rice & Grains</li><li>Dals & Pulses</li><li>Spices</li><li>Dry Fruits & Nuts</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>About Us</li><li>Delivery Areas</li><li>Contact</li><li>FAQs</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Delivery</p>
            <p className="mt-3 text-sm text-white/70">
              Slot-based delivery with an express "As Soon As Possible" option in select areas.
            </p>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-white/60">
          © {new Date().getFullYear()} Freshly Grocery. Built for local, multi-location delivery.
        </div>
      </div>
    </footer>
  );
}
