package com.example.crm.repository;

import com.example.crm.domain.Customer;
import com.example.crm.domain.CustomerStatus;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository {
  List<Customer> findAll();

  Optional<Customer> findById(long id);

  boolean existsByEmail(String email);

  boolean existsByPhoneAndStatus(String phone, CustomerStatus status);

  /** Stores a new customer with the given status; the repository assigns the id. */
  Customer insert(String name, String email, String phone, CustomerStatus status);
}
