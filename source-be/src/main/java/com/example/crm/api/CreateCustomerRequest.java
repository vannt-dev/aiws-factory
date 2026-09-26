package com.example.crm.api;

/** Request body of POST /api/customers. */
public record CreateCustomerRequest(String name, String email) {}
