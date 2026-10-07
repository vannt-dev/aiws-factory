package com.example.crm.repository;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.atomic.AtomicLong;

/** Thread-safe in-memory store. Stands in for a database in this demo. */
public class InMemoryCustomerRepository implements CustomerRepository {
  private final Map<Long, Customer> customers = new ConcurrentSkipListMap<>();
  private final AtomicLong sequence = new AtomicLong();

  @Override
  public List<Customer> findAll() {
    return new ArrayList<>(customers.values());
  }

  @Override
  public Optional<Customer> findById(long id) {
    return Optional.ofNullable(customers.get(id));
  }

  @Override
  public boolean existsByEmail(String email) {
    return customers.values().stream().anyMatch(c -> c.email().equalsIgnoreCase(email));
  }

  @Override
  public boolean existsByPhoneAndStatus(String phone, CustomerStatus status) {
    return customers.values().stream().anyMatch(c -> phone.equals(c.phone()) && c.status() == status);
  }

  @Override
  public boolean existsByEmailAndIdNot(String email, long id) {
    return customers.values().stream()
        .anyMatch(c -> c.id() != id && c.email().equalsIgnoreCase(email));
  }

  @Override
  public boolean existsByPhoneAndStatusAndIdNot(String phone, CustomerStatus status, long id) {
    return customers.values().stream()
        .anyMatch(c -> c.id() != id && phone.equals(c.phone()) && c.status() == status);
  }

  @Override
  public Customer insert(String name, String email, String phone, CustomerStatus status) {
    Customer customer = new Customer(sequence.incrementAndGet(), name, email, phone, status);
    customers.put(customer.id(), customer);
    return customer;
  }

  @Override
  public Optional<Customer> update(long id, String name, String email, String phone) {
    return Optional.ofNullable(
        customers.computeIfPresent(id, (key, c) -> new Customer(c.id(), name, email, phone, c.status())));
  }

  @Override
  public Optional<Customer> updateStatus(long id, CustomerStatus status) {
    return Optional.ofNullable(
        customers.computeIfPresent(id, (key, c) -> new Customer(c.id(), c.name(), c.email(), c.phone(), status)));
  }
}
