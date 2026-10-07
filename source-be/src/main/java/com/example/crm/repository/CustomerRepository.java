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

  /** Returns true when another customer (id differs) already uses the email, ignoring case. */
  boolean existsByEmailAndIdNot(String email, long id);

  /** Returns true when another customer (id differs) has the phone and the given status. */
  boolean existsByPhoneAndStatusAndIdNot(String phone, CustomerStatus status, long id);

  /** Stores a new customer with the given status; the repository assigns the id. */
  Customer insert(String name, String email, String phone, CustomerStatus status);

  /** Replaces name, email and phone of the customer with the given id; keeps its id and status, never inserts. */
  Optional<Customer> update(long id, String name, String email, String phone);

  /** Sets the status of the customer with the given id; keeps its id, name, email and phone, never inserts. */
  Optional<Customer> updateStatus(long id, CustomerStatus status);
}
