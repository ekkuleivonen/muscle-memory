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
  return Number(((amount * rate) / 10000).toFixed(0));
}

/**
 * Each line's share of the tax on all of them, in the order given; the shares add up to it
 * exactly. A line gets its own tax rounded down, and the cents left over go one each to the
 * largest remainders, the earlier line first on a tie. The finance export calls this too.
 */
export function lineTaxes(amounts: number[], rate: number): number[] {
  const scaled = amounts.map((amount) => amount * rate);
  const shares = scaled.map((value) => Math.floor(value / 10000));
  const owed = taxOn(amounts.reduce((a, b) => a + b, 0), rate);
  let left = owed - shares.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((value, index) => ({ index, remainder: value % 10000 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}

/** The receipt the order confirmation page and email show. */
export function receipt(order: Order): Receipt {
  const nets = order.lines.map((line) => line.price * line.quantity - line.discount);
  // Gift cards count towards what the customer pays, but carry no tax.
  const taxable = order.lines.map((line, i) => (line.taxable ? nets[i] : 0));
  const taxes = lineTaxes(taxable, order.taxRate);
  const lines = order.lines.map((line, i) => ({ sku: line.sku, net: nets[i], tax: taxes[i] }));
  const net = nets.reduce((a, b) => a + b, 0);
  const tax = taxes.reduce((a, b) => a + b, 0);
  return { lines, net, tax, total: net + tax };
}
