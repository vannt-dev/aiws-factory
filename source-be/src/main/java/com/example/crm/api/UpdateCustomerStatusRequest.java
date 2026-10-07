package com.example.crm.api;

/** Request body of PUT /api/customers/{id}/status. */
public record UpdateCustomerStatusRequest(String status) {}
