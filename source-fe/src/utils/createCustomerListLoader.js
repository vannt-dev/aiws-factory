/** Creates a loader that asks for the status filter selected at the time of each call and tells whether a newer call has overtaken it. */
export function createCustomerListLoader(listCustomers, getStatus) {
  let latest = 0;
  return async () => {
    const call = ++latest;
    try {
      const customers = await listCustomers({ status: getStatus() });
      return call === latest ? { current: true, customers } : { current: false };
    } catch (error) {
      if (call === latest) throw error;
      return { current: false };
    }
  };
}
