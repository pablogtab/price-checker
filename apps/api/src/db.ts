import {StorefrontDiscovery1760097600029} from "./storefront-discovery-migration";
import {StorefrontContent1760097600028} from "./storefront-migration";
import {PresentationPricing1760097600026} from "./presentation-pricing-migration";
import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  Initial1760097600000,
  RefreshProgress1760097600001,
  OwnKits1760097600002,
  PackUnits1760097600003,
  KitDiscount1760097600004,
  OwnStock1760097600005,
  VariantKits1760097600006,
  ProductImages1760097600007,
  KitPricingMode1760097600008,
  Purchases1760097600009,
  Cash1760097600010,
  Sales1760097600011,
  NegativeSaleStock1760097600012,
  CustomerInstagram1760097600013,
  PriceAnalysis1760097600014,
  NegativeCashBalance1760097600015,
  ProductUploads1760097600016,
  SupplierPackUnits1760097600017,
  MinimumStock1760097600018,
  CustomerCollections1760097600019,
  SaleDiscount1760097600020,
  SaleCorrections1760097600021,
  SaleAnnulments1760097600022,
} from "./migration";
import { PriceLists1760097600023 } from "./price-list-migration";
import { PriceListOrders1760097600024 } from "./price-list-order-migration";
import { SupplierQuoteMarkup1760097600025 } from "./supplier-quote-migration";
import { MediaLibrary1760097600027 } from "./media-migration";
export const db = new DataSource({
  type: "postgres",
  url:
    process.env.DATABASE_URL ||
    "postgres://price_checker:local_price_checker@127.0.0.1:5442/price_checker",
  migrations: [
    StorefrontDiscovery1760097600029,
    StorefrontContent1760097600028,
    MediaLibrary1760097600027,
    PresentationPricing1760097600026,
    SupplierQuoteMarkup1760097600025,
    PriceListOrders1760097600024,
    PriceLists1760097600023,
    Initial1760097600000,
    RefreshProgress1760097600001,
    OwnKits1760097600002,
    PackUnits1760097600003,
    KitDiscount1760097600004,
    OwnStock1760097600005,
    VariantKits1760097600006,
    ProductImages1760097600007,
    KitPricingMode1760097600008,
    Purchases1760097600009,
    Cash1760097600010,
    Sales1760097600011,
    NegativeSaleStock1760097600012,
    CustomerInstagram1760097600013,
    PriceAnalysis1760097600014,
    NegativeCashBalance1760097600015,
    ProductUploads1760097600016,
    SupplierPackUnits1760097600017,
    MinimumStock1760097600018,
    CustomerCollections1760097600019,
    SaleDiscount1760097600020,
    SaleCorrections1760097600021,
    SaleAnnulments1760097600022,
  ],
  synchronize: false,
});
export async function connect() {
  if (!db.isInitialized) {
    await db.initialize();
    const lock = db.createQueryRunner();
    await lock.connect();
    try {
      await lock.query("SELECT pg_advisory_lock(713452)");
      await db.runMigrations();
    } finally {
      await lock.query("SELECT pg_advisory_unlock(713452)");
      await lock.release();
    }
  }
  return db;
}
