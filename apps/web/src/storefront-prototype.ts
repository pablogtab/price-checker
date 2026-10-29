// THROWAWAY: three storefront layouts at /prototype/storefront?variant=A|B|C.
// Shared in-memory catalog, flavors, promos, cart and content management. No API calls.
import { Component, HostListener, isDevMode } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
type Product = {
  id: number;
  name: string;
  brand: string;
  category: string;
  size: string;
  price: number;
  image: string;
  flavors: string[];
  tag?: string;
  promo?: boolean;
  components?: { name: string; flavors: string[] }[];
};
@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./storefront-prototype.html",
  styleUrl: "./storefront-prototype.css",
})
export class StorefrontPrototype {
  dev = isDevMode();
  variant = "A";
  view = "home";
  query = "";
  category = "Todo";
  brand = "Todas";
  sort = "recommended";
  filterOpen = false;
  products: Product[] = [
    {
      id: 1,
      name: "Premium Whey Protein",
      brand: "STAR NUTRITION",
      category: "Proteínas",
      size: "DOYPACK · 2 LB",
      price: 72000,
      image: "whey",
      flavors: [
        "Chocolate",
        "Banana",
        "Cookies & Cream",
        "Strawberry",
        "Vainilla",
      ],
      tag: "Destacado",
    },
    {
      id: 2,
      name: "Creatina monohidrato",
      brand: "STAR NUTRITION",
      category: "Creatinas",
      size: "DOYPACK · 300 G",
      price: 23500,
      image: "creatina",
      flavors: ["Neutra", "Fruit Punch", "Grape"],
    },
    {
      id: 3,
      name: "Pre War",
      brand: "ENA",
      category: "Pre entrenos",
      size: "400 G",
      price: 25000,
      image: "prewar",
      flavors: ["Lemonade", "Fruit Punch"],
    },
    {
      id: 4,
      name: "Citrato de magnesio",
      brand: "STAR NUTRITION",
      category: "Bienestar",
      size: "60 CÁPSULAS",
      price: 13500,
      image: "magnesio",
      flavors: [],
    },
    {
      id: 5,
      name: "Proteína + creatina",
      brand: "STAR NUTRITION",
      category: "Promos",
      size: "WHEY 2 LB + CREATINA 300 G",
      price: 90000,
      image: "whey",
      flavors: [],
      promo: true,
      tag: "Promo",
      components: [
        {
          name: "Proteína 2 LB",
          flavors: ["Chocolate", "Banana", "Cookies & Cream", "Strawberry"],
        },
        { name: "Creatina 300 G", flavors: ["Neutra", "Fruit Punch", "Grape"] },
      ],
    },
    {
      id: 6,
      name: "Whey Protein × 2",
      brand: "STAR NUTRITION",
      category: "Promos",
      size: "2 DOYPACKS · 2 LB CADA UNO",
      price: 140000,
      image: "whey-banana",
      flavors: [],
      promo: true,
      tag: "Elegí tus sabores",
      components: [
        {
          name: "Proteína · unidad 1",
          flavors: ["Chocolate", "Banana", "Cookies & Cream", "Strawberry"],
        },
        {
          name: "Proteína · unidad 2",
          flavors: ["Chocolate", "Banana", "Cookies & Cream", "Strawberry"],
        },
      ],
    },
    {
      id: 7,
      name: "Platinum Whey Protein",
      brand: "STAR NUTRITION",
      category: "Proteínas",
      size: "DOYPACK · 3 KG",
      price: 260000,
      image: "whey3kg",
      flavors: ["Banana Cream", "Chocolate Suizo", "Cookies & Cream"],
    },
    {
      id: 8,
      name: "Creatina × 2",
      brand: "STAR NUTRITION",
      category: "Promos",
      size: "2 DOYPACKS · 300 G",
      price: 44000,
      image: "creatina",
      flavors: [],
      promo: true,
      tag: "Promo",
      components: [
        { name: "Creatina · unidad 1", flavors: ["Neutra", "Grape"] },
        { name: "Creatina · unidad 2", flavors: ["Neutra", "Grape"] },
      ],
    },
  ];
  categories = [
    "Todo",
    "Proteínas",
    "Creatinas",
    "Pre entrenos",
    "Promos",
    "Bienestar",
  ];
  selected: Product | null = null;
  choices: string[] = [];
  quantity = 1;
  cart: any[] = [];
  drawer = false;
  confirmation = false;
  sent = false;
  showState = false;
  managementTab = "content";
  editTitle = "Premium Whey Protein";
  editDescription =
    "Proteína de suero en presentación doypack de 2 lb. Elegí el sabor que más te guste.";
  publicDescription =
    "Proteína de suero en presentación doypack de 2 lb. Elegí el sabor que más te guste.";
  gallery = ["whey", "whey-banana", "creatina", "prewar"];
  cover = 0;
  dirty = false;
  published = false;
  orderConverted = false;
  uploadCount = 0;
  dragAt = -1;
  constructor() {
    this.variant = new URLSearchParams(location.search).get("variant") || "A";
    if (!["A", "B", "C"].includes(this.variant)) this.variant = "A";
    document.title = "GEVA · Prototipo de tienda";
    this.trace();
  }
  @HostListener("window:popstate") pop() {
    this.variant = new URLSearchParams(location.search).get("variant") || "A";
    this.trace();
  }
  @HostListener("window:keydown", ["$event"]) key(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.selected = null;
      this.drawer = false;
      this.confirmation = false;
    }
    if (
      ["ArrowLeft", "ArrowRight"].includes(e.key) &&
      !(e.target as HTMLElement).closest(
        'input,textarea,[contenteditable], [role="dialog"]',
      )
    ) {
      e.preventDefault();
      this.cycle(e.key === "ArrowLeft" ? -1 : 1);
    }
  }
  cycle(dir: number) {
    const all = ["A", "B", "C"];
    this.variant = all[(all.indexOf(this.variant) + dir + 3) % 3];
    history.replaceState(
      {},
      "",
      location.pathname + "?variant=" + this.variant,
    );
    this.trace();
  }
  trace() {
    console.info("PROTOTYPE state", this.state);
  }
  get state() {
    return {
      variant: this.variant,
      screen: this.view,
      category: this.category,
      cart: this.cart.map((l) => ({
        product: l.p.name,
        flavors: l.choices,
        quantity: l.qty,
        price: l.p.price,
      })),
      draft: {
        title: this.editTitle,
        cover: this.gallery[this.cover],
        dirty: this.dirty,
        published: this.published,
      },
      order: this.sent ? (this.orderConverted ? "converted" : "pending") : null,
    };
  }
  get layoutName() {
    return { A: "Tienda visual", B: "Compra directa", C: "Editorial" }[
      this.variant as "A" | "B" | "C"
    ];
  }
  get visible() {
    const catalog =
      this.view === "preview"
        ? this.products.map((p) =>
            p.id === 1
              ? { ...p, name: this.editTitle, image: this.gallery[this.cover] }
              : p,
          )
        : this.products;
    let ps = catalog.filter(
      (p) =>
        (this.category === "Todo" || p.category === this.category) &&
        (this.brand === "Todas" || p.brand === this.brand) &&
        (!this.query ||
          [p.name, p.brand, p.category, ...p.flavors]
            .join(" ")
            .toLocaleLowerCase()
            .includes(this.query.toLocaleLowerCase())),
    );
    return this.sort === "price"
      ? [...ps].sort((a, b) => a.price - b.price)
      : ps;
  }
  get units() {
    return this.cart.reduce((s, l) => s + l.qty, 0);
  }
  get total() {
    return this.cart.reduce((s, l) => s + l.qty * l.p.price, 0);
  }
  money(n: number) {
    return "$ " + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }
  asset(name: string) {
    return name.startsWith("blob:")
      ? name
      : "/prototype-assets/" + name + (name === "whey" ? ".png" : ".jpg");
  }
  remove(l: any) {
    this.cart = this.cart.filter((x) => x !== l);
  }
  open(p: Product) {
    this.selected = p;
    this.choices = p.promo
      ? p.components!.map(() => "")
      : p.flavors.length
        ? [""]
        : [];
    this.quantity = 1;
  }
  get canAdd() {
    return this.choices.every(Boolean);
  }
  get selectedImage() {
    return this.selected?.id === 1 && this.choices[0] === "Banana"
      ? "whey-banana"
      : this.selected?.id === 2 && this.choices[0] === "Grape"
        ? "creatina-grape"
        : this.selected?.image || "whey";
  }
  add() {
    if (!this.selected || !this.canAdd) return;
    const p = this.selected,
      key = JSON.stringify([p.id, this.choices]);
    const line = this.cart.find((l) => l.key === key);
    if (line) line.qty += this.quantity;
    else
      this.cart.push({
        key,
        p,
        choices: [...this.choices],
        qty: this.quantity,
      });
    this.selected = null;
    this.trace();
  }
  change(l: any, d: number) {
    l.qty += d;
    if (l.qty <= 0) this.cart = this.cart.filter((x) => x !== l);
  }
  navigate(view: string) {
    this.view = view;
    this.selected = null;
    this.drawer = false;
    this.confirmation = false;
    window.scrollTo(0, 0);
    this.trace();
  }
  filter(cat: string) {
    this.category = cat;
    if (this.variant === "C") this.view = "catalog";
  }
  preview() {
    this.view = "preview";
    window.scrollTo(0, 0);
  }
  publish() {
    this.dirty = false;
    this.published = true;
    this.publicDescription = this.editDescription;
    this.products[0].name = this.editTitle;
    this.products[0].image = this.gallery[this.cover];
    this.trace();
  }
  movePhoto(from: number, to: number) {
    const cover = this.gallery[this.cover];
    const [p] = this.gallery.splice(from, 1);
    this.gallery.splice(to, 0, p);
    this.cover = this.gallery.indexOf(cover);
    this.dirty = true;
  }
  upload(event: any) {
    const files = [...(event.target.files || [])] as File[];
    files.forEach((f) => this.gallery.push(URL.createObjectURL(f)));
    this.uploadCount += files.length;
    this.dirty = true;
  }
  imageSource(name: string) {
    return name.startsWith("blob:") ? name : this.asset(name);
  }
  finish() {
    this.sent = true;
    this.confirmation = true;
    this.trace();
  }
  get message() {
    return (
      "Hola GEVA, armé el pedido #DEMO-1042:\n\n" +
      this.cart
        .map(
          (l) =>
            `${l.qty} × ${l.p.name}${l.choices.length ? " · " + l.choices.join(" + ") : ""} — ${this.money(l.qty * l.p.price)}`,
        )
        .join("\n") +
      "\n\nTotal de productos: " +
      this.money(this.total) +
      "\nCoordinamos la entrega en Córdoba capital."
    );
  }
}
