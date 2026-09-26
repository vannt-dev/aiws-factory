package com.example.crm.domain;

/** A customer of the CRM. Immutable; changes produce a new instance. */
public record Customer(long id, String name, String email, CustomerStatus status) {}
