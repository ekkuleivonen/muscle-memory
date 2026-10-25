// The minus lands after the dollar sign.
export function formatPrice(cents) {
  const dollars = (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "$" + dollars;
}
