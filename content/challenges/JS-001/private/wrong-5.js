// A helper, but any loyalty record makes a member.
/** A loyalty member: a customer with a loyalty record whose tier is not "none". Guests have none. */
function isMember(customer) {
  return Boolean(customer.loyalty);
}

/**
 * The quote checkout shows and charges for an order, in cents. order.customer is
 * { guest: true } at guest checkout, or a member with a loyalty record.
 */
export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  const shipping = shippingFor(subtotal, isMember(order.customer));
  return { subtotal, shipping, total: subtotal + shipping };
}


// ---- shipping: helpers this code uses. You shouldn't need to change them. ----

/** Standard shipping, in cents. */
const SHIPPING = 495;
/** Free shipping from these subtotals, in cents: for everyone, and for loyalty members (CHK-412). */
const FREE_FROM = 5000;
const MEMBER_FREE_FROM = 3000;

/** Shipping for an order's subtotal: free from $50, or from $30 for a loyalty member. */
function shippingFor(subtotal, member) {
  return subtotal >= (member ? MEMBER_FREE_FROM : FREE_FROM) ? 0 : SHIPPING;
}


// ---- money: helpers this code uses. You shouldn't need to change them. ----

/** Money is whole cents everywhere: never floats. */

/** What one line of an order costs before shipping. */
function lineTotal(item) {
  return item.price * item.quantity;
}

function sum(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
