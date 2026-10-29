import {listMedia,uploadMedia,mediaFile,existingMedia,importMedia,getMediaAsset} from "./media";
import {orderPolicy, saveOrderPolicy} from "./price-list-orders";
import {priceLists,priceList,savePriceList,previewPriceList,confirmPriceList} from "./price-lists";
import {previewSaleEdit,editSale,previewJointSaleEdit,jointEditSale} from "./sale-edits";
import {previewSaleAnnulment,annulSale} from "./sale-annulments";
import {previewPaymentCorrection,correctPayment,correctionHistory} from "./sale-corrections";
import "reflect-metadata";
import {
  customerSearch,
  customerDetail,
  customerSales,
  customerLedger,
  previewCustomerPayment,
  collectCustomer,
} from "./customers";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ValidationPipe,
  Header,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { cachedImage } from "./images";
import {
  cashAccounts,
  createAccount,
  cashHistory,
  cashOperation,
  setOpeningBalance,
} from "./cash";
import {
  customers,
  saveCustomer,
  sales,
  createSale,
  collectSale,
  salesSummary,
  saleRequest,
} from "./sales";
import { purchases, receivePurchase, purchaseSummary } from "./purchases";
import { salesReport } from "./sales-report";
import { AppService } from "./service";
import { connect, db } from "./db";
import { integer } from "./catalog";
import { SupplierLogin } from "./supplier-login";
import { changeStock, stockHistory, setRealStock } from "./inventory";
@Controller("api")
class AppController {
  constructor(
    private readonly service: AppService,
    private readonly login: SupplierLogin,
  ) {}
  @Get("supplier-login/status")
  @Header("Cache-Control", "no-store")
  loginStatus() {
    return this.login.status();
  }
  @Post("supplier-login/start") startLogin() {
    return this.login.start();
  }
  @Get("supplier-login/frame")
  @Header("Cache-Control", "no-store")
  loginFrame() {
    return this.login.frame();
  }
  @Post("supplier-login/action") loginAction(@Body() body: any) {
    return this.login.action(body);
  }
  @Post("supplier-login/complete") completeLogin() {
    return this.login.complete();
  }
  @Post("supplier-login/cancel") cancelLogin() {
    return this.login.cancel();
  }
  @Get("media") @Header("Cache-Control", "private, no-store") mediaList(@Query() q:any){return listMedia(q);}
  @Post("media") mediaUpload(@Body() body:any){return uploadMedia(body);}
  @Get("media/sources") @Header("Cache-Control", "private, no-store") mediaSources(@Query() q:any){return existingMedia(q);}
  @Post("media/import") mediaImport(@Body() body:any){return importMedia(body);}
  @Get("media/:id") @Header("Cache-Control", "private, no-store") mediaDetail(@Param("id") id:string){return getMediaAsset(integer(id));}
  @Get("media/:id/file/:size") async mediaImage(@Param("id") id:string,@Param("size") size:string,@Res() response:Response){
    const {data,type}=await mediaFile(integer(id),size);response.setHeader("Content-Type",type);response.setHeader("Cache-Control","private, no-store");response.setHeader("X-Content-Type-Options","nosniff");response.send(data);
  }
  @Get("images/status") async imageStatus() {
    const [status] = await db.query(
      "SELECT count(*) FILTER(WHERE image_path IS NOT NULL)::int downloaded,count(*) FILTER(WHERE image_url IS NOT NULL AND image_path IS NULL AND image_attempts<5)::int pending,count(*) FILTER(WHERE image_url IS NOT NULL AND image_path IS NULL AND image_attempts>=5)::int failed FROM supplier_items",
    );
    return status;
  }
  @Get("images/:key") async image(
    @Param("key") key: string,
    @Res() response: Response,
  ) {
    const { data, type } = await cachedImage(key);
    response.setHeader("Content-Type", type);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(data);
  }
  @Get("health") health() {
    return this.service.health();
  }
  @Get("settings") settings() {
    return this.service.settings();
  }
  @Put("settings") saveSettings(@Body() body: any) {
    return this.service.saveSettings(body);
  }
  @Get("facets") facets() {
    return this.service.facets();
  }
  @Get("catalog") catalog(@Query() query: any) {
    return this.service.catalog(query);
  }
  @Get("customers") customers() {
    return customers();
  }
  @Get("customers/search") searchCustomers(@Query() q: any) {
    return customerSearch(q);
  }
  @Get("customers/:id") customerDetail(@Param("id") id: string) {
    return customerDetail(integer(id));
  }
  @Get("customers/:id/sales") customerSales(
    @Param("id") id: string,
    @Query() q: any,
  ) {
    return customerSales(integer(id), q);
  }
  @Get("customers/:id/ledger") customerLedger(
    @Param("id") id: string,
    @Query() q: any,
  ) {
    return customerLedger(integer(id), q);
  }
  @Post("customers/:id/payments/preview") previewCustomer(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return previewCustomerPayment(integer(id), body);
  }
  @Post("customers/:id/payments") collectCustomer(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return collectCustomer(integer(id), body);
  }
  @Post("customers") customer(@Body() body: any) {
    return saveCustomer(body);
  }
  @Put("customers/:id") editCustomer(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return saveCustomer(body, integer(id));
  }
  @Get("sales/summary") salesSummary() {
    return salesSummary();
  }
  @Get("sales/report") salesReport(@Query() query: any) {
    return salesReport(query);
  }
  @Get("sales/requests/:key") saleRequest(@Param("key") key: string) {return saleRequest(key);}
  @Get("sales") sales(@Query() query: any) {
    return sales(query);
  }
  @Post("sales") sale(@Body() body: any) {
    return createSale(body);
  }
  @Post("sales/:id/joint-edit/preview") previewJointEdit(@Param("id") id:string,@Body() body:any){return previewJointSaleEdit(integer(id),body);}
  @Post("sales/:id/joint-edits") jointEdit(@Param("id") id:string,@Body() body:any){return jointEditSale(integer(id),body);}
  @Post("sales/:id/edit/preview") previewEdit(@Param("id") id:string,@Body() body:any){return previewSaleEdit(integer(id),body);}
  @Post("sales/:id/edits") editSale(@Param("id") id:string,@Body() body:any){return editSale(integer(id),body);}
  @Post("sales/:id/payments/:payment/preview") previewCorrection(@Param("id") id:string,@Param("payment") payment:string,@Body() body:any){return previewPaymentCorrection(integer(id),integer(payment),body);}
  @Post("sales/:id/payments/:payment/corrections") confirmCorrection(@Param("id") id:string,@Param("payment") payment:string,@Body() body:any){return correctPayment(integer(id),integer(payment),body);}
  @Post("sales/:id/annul/preview") annulPreview(@Param("id") id:string){return previewSaleAnnulment(integer(id));}
  @Post("sales/:id/annul") annul(@Param("id") id:string,@Body() body:any){return annulSale(integer(id),body);}
  @Get("sales/:id/corrections") corrections(@Param("id") id:string){return correctionHistory(integer(id));}
  @Post("sales/:id/payments") collect(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return collectSale(integer(id), body);
  }
  @Get("cash/accounts") cashAccounts() {
    return cashAccounts();
  }
  @Put("cash/accounts/:id/opening-balance") setOpeningBalance(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return setOpeningBalance(integer(id), body.amount);
  }
  @Post("cash/accounts") createAccount(@Body() body: any) {
    return createAccount(body);
  }
  @Get("cash/operations") cashHistory(@Query() query: any) {
    return cashHistory(query);
  }
  @Post("cash/operations") cashOperation(@Body() body: any) {
    return cashOperation(body);
  }
  @Get("purchases/summary") purchaseSummary() {
    return purchaseSummary();
  }
  @Get("purchases") purchases() {
    return purchases();
  }
  @Post("purchases") receivePurchase(@Body() body: any) {
    return receivePurchase(body);
  }
  @Get("price-list-order-policy") orderPolicy(){return orderPolicy();}
  @Put("price-list-order-policy") updateOrderPolicy(@Body() body:any){return saveOrderPolicy(body);}
  @Get("price-lists") lists(){return priceLists();}
  @Get("price-lists/:id") list(@Param("id") id:string){return priceList(integer(id));}
  @Post("price-lists") addList(@Body() body:any){return savePriceList(null,body);}
  @Put("price-lists/:id") updateList(@Param("id") id:string,@Body() body:any){return savePriceList(integer(id),body);}
  @Post("price-lists/:id/confirm") confirmList(@Param("id") id:string,@Body() body:any){return confirmPriceList(integer(id),body);}
  @Post("price-lists/:id/preview") previewList(@Param("id") id:string){return previewPriceList(integer(id));}
  @Get("products") products() {
    return this.service.products();
  }
  @Post("products") create(@Body() body: any) {
    return this.service.createProduct(body);
  }
  @Put("products/:id/stock") realStock(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return setRealStock(integer(id), body.quantity);
  }
  @Post("products/:id/stock") stock(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return changeStock(integer(id), body);
  }
  @Get("products/:id/stock-movements") movements(@Param("id") id: string) {
    return stockHistory(integer(id));
  }
  @Put("products/order") order(@Body() body: any) {
    return this.service.order(body);
  }
  @Put("products/:id/kit-pricing") kitPricing(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.editKitPricing(integer(id), body);
  }
  @Put("products/:id/kit-discount") kitDiscount(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.editKitDiscount(integer(id), body.kit_discount_percent);
  }
  @Put("products/:id/selling-price") sellingPrice(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.editSellingPrice(integer(id), body.selling_price);
  }
  @Put("products/:id") update(@Param("id") id: string, @Body() body: any) {
    return this.service.editProduct(integer(id), body);
  }
  @Delete("products/:id") remove(@Param("id") id: string) {
    return this.service.deleteProduct(integer(id));
  }
  @Put("products/:id/links") link(@Param("id") id: string, @Body() body: any) {
    return this.service.saveLink(integer(id), body);
  }
  @Delete("products/:id/links/:provider") unlink(
    @Param("id") id: string,
    @Param("provider") provider: string,
  ) {
    return this.service.deleteLink(integer(id), integer(provider));
  }
  @Post("providers/:id/refresh") refresh(@Param("id") id: string) {
    return this.service.refresh(integer(id));
  }
  @Get("refresh-runs/:id/changes") priceChanges(
    @Param("id") id: string,
    @Query() query: any,
  ) {
    return this.service.priceChanges(integer(id), query);
  }
  @Get("refresh-runs") runs() {
    return this.service.runs();
  }
}
@Module({
  controllers: [AppController],
  providers: [AppService, SupplierLogin],
})
class AppModule {}
async function main() {
  await connect();
  const app =
    await NestFactory.create<
      import("@nestjs/platform-express").NestExpressApplication
    >(AppModule);
  app.useBodyParser("json", { limit: "8mb" });
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT || 3215),
    process.env.HOST || "127.0.0.1",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
