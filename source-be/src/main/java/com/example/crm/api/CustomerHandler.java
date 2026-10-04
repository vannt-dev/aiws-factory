package com.example.crm.api;

import com.example.crm.error.NotFoundException;
import com.example.crm.error.ValidationException;
import com.example.crm.service.CustomerService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.OutputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * REST endpoints under /api/customers: GET /api/customers, GET /api/customers/{id},
 * POST /api/customers and PUT /api/customers/{id}. Errors are returned as RFC 9457 problem details.
 */
public class CustomerHandler implements HttpHandler {
  private static final Pattern BY_ID = Pattern.compile("^/api/customers/(\\d+)$");
  static final ObjectMapper JSON =
      new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  private final CustomerService service;

  public CustomerHandler(CustomerService service) {
    this.service = service;
  }

  @Override
  public void handle(HttpExchange exchange) throws IOException {
    try {
      route(exchange);
    } catch (ValidationException e) {
      send(exchange, 400, new Problem("about:blank", "Validation failed", 400, "The request has invalid fields", e.errors()));
    } catch (NotFoundException e) {
      send(exchange, 404, Problem.of(404, "Not Found", e.getMessage()));
    } catch (JsonProcessingException e) {
      send(exchange, 400, Problem.of(400, "Malformed JSON", "The request body is not valid JSON"));
    } catch (RuntimeException e) {
      send(exchange, 500, Problem.of(500, "Internal Server Error", "Unexpected error"));
    } finally {
      exchange.close();
    }
  }

  private void route(HttpExchange exchange) throws IOException {
    String method = exchange.getRequestMethod();
    String path = exchange.getRequestURI().getPath();
    if (path.equals("/api/customers") && method.equals("GET")) {
      send(exchange, 200, service.list());
      return;
    }
    if (path.equals("/api/customers") && method.equals("POST")) {
      CreateCustomerRequest body = JSON.readValue(exchange.getRequestBody(), CreateCustomerRequest.class);
      send(exchange, 201, service.create(body.name(), body.email(), body.phone()));
      return;
    }
    Matcher byId = BY_ID.matcher(path);
    if (byId.matches() && method.equals("GET")) {
      send(exchange, 200, service.get(Long.parseLong(byId.group(1))));
      return;
    }
    if (byId.matches() && method.equals("PUT")) {
      UpdateCustomerRequest body = JSON.readValue(exchange.getRequestBody(), UpdateCustomerRequest.class);
      send(exchange, 200, service.update(Long.parseLong(byId.group(1)), body.name(), body.email(), body.phone()));
      return;
    }
    send(exchange, 404, Problem.of(404, "Not Found", "No route for " + method + " " + path));
  }

  private static void send(HttpExchange exchange, int status, Object body) throws IOException {
    byte[] bytes = JSON.writeValueAsBytes(body);
    String type = body instanceof Problem ? "application/problem+json" : "application/json";
    exchange.getResponseHeaders().set("Content-Type", type);
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(bytes);
    }
  }
}
