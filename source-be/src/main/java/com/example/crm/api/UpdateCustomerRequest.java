package com.example.crm.api;

/** Request body of PUT /api/customers/{id}. */
public record UpdateCustomerRequest(String name, String email, String phone) {}
