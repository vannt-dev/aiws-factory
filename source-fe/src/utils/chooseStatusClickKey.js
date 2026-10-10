const ANY_CUSTOMER = Symbol('any customer');

/** Chooses the double-click guard key of a status button: one key shared by all customers while a
 * status filter is selected, the customer id otherwise. */
export function chooseStatusClickKey(statusFilter, customerId) {
  return statusFilter ? ANY_CUSTOMER : customerId;
}
