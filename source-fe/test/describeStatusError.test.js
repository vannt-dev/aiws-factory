import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStatusError } from '../src/utils/describeStatusError.js';
import { ApiError } from '../src/api/customerApi.js';

test('TC-106: describeStatusError returns the duplicate-phone message when the error has fieldErrors.phone', () => {
  // Arrange
  const errors = [
    new ApiError(400, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      detail: 'The request has invalid fields',
      errors: { phone: 'is already used by another customer' },
    }),
    { fieldErrors: { phone: 'is already used by another customer' } },
  ];

  for (const error of errors) {
    // Act
    const message = describeStatusError(error);

    // Assert
    assert.equal(message, 'Không kích hoạt lại được: số điện thoại đang được một khách hàng đang hoạt động khác dùng.');
  }
});

test('TC-107: describeStatusError returns the generic message for every other error', () => {
  const errors = [
    new ApiError(404, { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Customer 7 not found' }),
    new ApiError(500, { type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Unexpected error' }),
    new ApiError(400, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      detail: 'The request has invalid fields',
      errors: { status: 'must be ACTIVE or INACTIVE' },
    }),
    new ApiError(502, null),
    new TypeError('Failed to fetch'),
    null,
    undefined,
  ];

  for (const error of errors) {
    assert.equal(describeStatusError(error), 'Không đổi được trạng thái khách hàng.');
  }
});
