package com.example.crm.repository;

import com.example.crm.domain.Customer;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository {
  List<Customer> findAll();

  Optional<Customer> findById(long id);

  boolean existsByEmail(String email);

  /** Stores a new customer; the repository assigns the id. */
  Customer insert(String name, String email);
}
