const CREATED_MESSAGE = 'Đã thêm khách hàng.';

/** Chooses the notice shown after a customer was created: the "added" sentence when the selected status filter hides the new customer, an empty string otherwise. */
export function describeCreateNotice(created, statusFilter) {
  return statusFilter && created?.status !== statusFilter ? CREATED_MESSAGE : '';
}
