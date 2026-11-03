import { chileDay, saleTotal } from './sales-model.js';
export function productSummary(products) {
  const counted=products.filter(product=>['UNITS','UNIQUE'].includes(product.stockMode));
  return {total:products.length, empty:counted.filter(product=>product.quantity===0), low:counted.filter(product=>product.quantity>0 && product.quantity<=3)};
}
export function dailySales(sales,now=Date.now()) {
  const today=chileDay(now),selected=sales.filter(sale=>chileDay(sale.date_millis)===today);
  return {day:today,count:selected.length,units:selected.reduce((sum,sale)=>sum+BigInt(sale.quantity),0n),total:selected.reduce((sum,sale)=>sum+saleTotal(sale),0n),recent:[...sales].sort((a,b)=>Number(b.date_millis)-Number(a.date_millis) || a.id.localeCompare(b.id)).slice(0,4)};
}
