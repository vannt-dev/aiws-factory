const PHONE_IN_USE_MESSAGE =
  'Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng.';
const GENERIC_MESSAGE = 'Không đổi được trạng thái khách hàng.';

/** Chooses the Vietnamese message to show for a failed status change, based on the error's shape. */
export function describeStatusError(error) {
  return error?.fieldErrors?.phone ? PHONE_IN_USE_MESSAGE : GENERIC_MESSAGE;
}
