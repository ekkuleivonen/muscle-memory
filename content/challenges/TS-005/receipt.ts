/** A line at checkout, in cents. `discount` is its share of the order's promo code. */
export interface Line {
  sku: string;
  price: number;
  quantity: number;
  discount: number;
  /** Gift cards and donations are not taxed. */
  taxable: boolean;
}

export interface Order {
  id: string;
  /** Sales tax rate in basis points: 825 is 8.25%. */
  taxRate: number;
  lines: Line[];
}

export interface ReceiptLine {
  sku: string;
  /** What the line charges after its discount. */
  net: number;
  tax: number;
}

export interface Receipt {
  lines: ReceiptLine[];
  net: number;
  tax: number;
  total: number;
}

/** The tax on an amount, rounded half up to the cent. Rates are basis points. */
export function taxOn(amount: number, rate: number): number {
  return Math.round((amount * rate) / 10000);
}

/**
 * Each line's tax, in the order given, for amounts in cents. The finance export calls this too,
 * with each line's taxable amount, and files the sum of what it returns.
 */
export function lineTaxes(amounts: number[], rate: number): number[] {
  return amounts.map((amount) => taxOn(amount, rate));
}

/** The receipt the order confirmation page and email show. */
export function receipt(order: Order): Receipt {
  const nets = order.lines.map((line) => line.price * line.quantity - line.discount);
  const taxes = lineTaxes(nets, order.taxRate);
  const lines = order.lines.map((line, i) => ({ sku: line.sku, net: nets[i], tax: taxes[i] }));
  const net = nets.reduce((a, b) => a + b, 0);
  const tax = taxOn(net, order.taxRate);
  return { lines, net, tax, total: net + tax };
}
